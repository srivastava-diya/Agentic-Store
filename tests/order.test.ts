import { rmSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { AUDIT_LOG_PATH, foldAuditLog, readAuditLog, spendSince } from "../src/audit.js";
import { defaultGateConfig, type GateConfig } from "../src/gate.js";
import { Inventory } from "../src/inventory.js";
import { placeOrder } from "../src/order.js";
import { cancellableMockPaymentClient, decliningPaymentClient, mockPaymentClient } from "../src/payment/mock.js";
import type { Product } from "../src/types.js";

const catalog: Product[] = [
    { id: "prod_001", name: "Wireless Mouse", price: 799, currency: "INR", stock: 12 },
    { id: "prod_002", name: "Mechanical Keyboard", price: 3499, currency: "INR", stock: 5 },
];

const noSpendCap: GateConfig = { ...defaultGateConfig, maxSpendPerWindow: Number.MAX_SAFE_INTEGER };

let inventory: Inventory;

beforeEach(() => {
    rmSync(AUDIT_LOG_PATH, { force: true });
    inventory = new Inventory(catalog);
});

describe("placeOrder", () => {
    test("commits stock and records the charge when payment succeeds", async () => {
        const { decision, payment } = await placeOrder({ productId: "prod_001", quantity: 2 }, inventory, {
            payment: mockPaymentClient,
        });

        expect(decision.allowed).toBe(true);
        expect(payment?.status).toBe("succeeded");
        expect(inventory.available("prod_001")).toBe(10);
    });

    test("logs the decision and never reaches the payment provider when the gate blocks", async () => {
        let charged = false;
        const spy = {
            name: "spy",
            charge: async () => {
                charged = true;
                return { status: "succeeded" as const };
            },
        };

        const { decision, payment } = await placeOrder({ productId: "prod_999", quantity: 1 }, inventory, {
            payment: spy,
        });

        expect(decision.code).toBe("UNKNOWN_PRODUCT");
        expect(payment).toBeUndefined();
        expect(charged).toBe(false);
        expect(readAuditLog()).toHaveLength(1);
        expect(readAuditLog()[0]?.decision).toBe("blocked");
    });

    test("releases the reservation when the card is declined, so stock is not lost", async () => {
        const { payment } = await placeOrder({ productId: "prod_002", quantity: 1 }, inventory, {
            payment: decliningPaymentClient,
        });

        expect(payment?.status).toBe("failed");
        expect(inventory.available("prod_002")).toBe(5);
        expect(spendSince(new Date(Date.now() - defaultGateConfig.spendWindowMs))).toBe(0);
    });

    test("holds stock and budget while a payment link is pending", async () => {
        await placeOrder({ productId: "prod_002", quantity: 1 }, inventory, {
            payment: cancellableMockPaymentClient,
        });

        expect(inventory.available("prod_002")).toBe(4);
        expect(spendSince(new Date(Date.now() - defaultGateConfig.spendWindowMs))).toBe(3499);
    });

    test("stops the run once the rolling spend cap is reached", async () => {
        const deepStock = new Inventory(catalog.map((product) => ({ ...product, stock: 100 })));
        const codes: string[] = [];

        for (let attempt = 0; attempt < 14; attempt += 1) {
            const { decision } = await placeOrder({ productId: "prod_001", quantity: 1 }, deepStock, {
                payment: mockPaymentClient,
            });
            codes.push(decision.code);
            if (!decision.allowed) break;
        }

        expect(codes.at(-1)).toBe("SPEND_LIMIT_EXCEEDED");
        expect(codes.filter((code) => code === "APPROVED")).toHaveLength(12);
    });

    test("replays a repeated idempotency key instead of charging twice", async () => {
        const options = { payment: mockPaymentClient, idempotencyKey: "checkout-abc-123", config: noSpendCap };

        const first = await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, options);
        const second = await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, options);

        expect(first.replayed).toBeUndefined();
        expect(second.replayed).toBe(true);
        expect(second.payment?.reference).toBe(first.payment?.reference);
        expect(inventory.available("prod_001")).toBe(11);
        expect(foldAuditLog().filter((row) => row.paymentResult === "succeeded")).toHaveLength(1);
    });

    test("writes the decision to the ledger before the charge is attempted", async () => {
        await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, { payment: mockPaymentClient });
        const events = readAuditLog().map((row) => row.event);

        expect(events).toEqual(["decision", "payment"]);
    });
});
