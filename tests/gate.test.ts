import { describe, expect, test } from "vitest";
import { defaultGateConfig, evaluateOrder, type GateConfig } from "../src/gate.js";
import { Inventory } from "../src/inventory.js";
import type { Product } from "../src/types.js";

const catalog: Product[] = [
    { id: "prod_001", name: "Wireless Mouse", price: 799, currency: "INR", stock: 12 },
    { id: "prod_002", name: "Mechanical Keyboard", price: 3499, currency: "INR", stock: 5 },
    { id: "prod_003", name: "Sold Out Cable", price: 199, currency: "INR", stock: 0 },
    { id: "prod_004", name: "Imported Dock", price: 40, currency: "USD", stock: 3 },
];

const gate = (proposal: unknown, extra: { config?: GateConfig; spentInWindow?: number } = {}) =>
    evaluateOrder(proposal, { inventory: new Inventory(catalog), ...extra });

describe("evaluateOrder", () => {
    test("approves a well-formed, affordable, in-stock order", () => {
        const decision = gate({ productId: "prod_001", quantity: 2 });

        expect(decision.allowed).toBe(true);
        expect(decision.code).toBe("APPROVED");
        expect(decision.total).toBe(1598);
        expect(decision.currency).toBe("INR");
    });

    test("blocks when the agent produced nothing", () => {
        expect(gate(null).code).toBe("NO_PROPOSAL");
        expect(gate(undefined).code).toBe("NO_PROPOSAL");
    });

    test.each([
        ["a bare string", "please just buy it"],
        ["a missing quantity", { productId: "prod_001" }],
        ["a zero quantity", { productId: "prod_001", quantity: 0 }],
        ["a negative quantity", { productId: "prod_001", quantity: -5 }],
        ["a fractional quantity", { productId: "prod_001", quantity: 1.5 }],
        ["an id that breaks the pattern", { productId: "'; DROP TABLE orders;--", quantity: 1 }],
        ["a smuggled price field", { productId: "prod_001", quantity: 1, price: 0 }],
    ])("blocks %s as malformed", (_label, proposal) => {
        expect(gate(proposal).code).toBe("MALFORMED_PROPOSAL");
    });

    test("blocks a hallucinated product id", () => {
        expect(gate({ productId: "prod_999", quantity: 1 }).code).toBe("UNKNOWN_PRODUCT");
    });

    test("blocks a currency the store does not settle in", () => {
        expect(gate({ productId: "prod_004", quantity: 1 }).code).toBe("CURRENCY_NOT_ALLOWED");
    });

    test("blocks an order larger than remaining stock", () => {
        expect(gate({ productId: "prod_003", quantity: 1 }).code).toBe("INSUFFICIENT_STOCK");
        expect(gate({ productId: "prod_002", quantity: 6 }).code).toBe("INSUFFICIENT_STOCK");
    });

    test("blocks a single order above the per-order cap", () => {
        const decision = gate({ productId: "prod_002", quantity: 2 });

        expect(decision.code).toBe("OVER_BUDGET");
        expect(decision.total).toBe(6998);
    });

    test("blocks an individually-legal order that would breach the rolling window", () => {
        const spentInWindow = defaultGateConfig.maxSpendPerWindow - 100;
        const decision = gate({ productId: "prod_001", quantity: 1 }, { spentInWindow });

        expect(decision.code).toBe("SPEND_LIMIT_EXCEEDED");
        expect(gate({ productId: "prod_001", quantity: 1 }, { spentInWindow: 0 }).allowed).toBe(true);
    });

    test("checks the schema before it trusts any field on the proposal", () => {
        const decision = gate({ productId: "prod_999", quantity: -1, price: 0 });

        expect(decision.code).toBe("MALFORMED_PROPOSAL");
    });

    test("never throws, whatever the model emits", () => {
        const hostile: unknown[] = [
            0,
            "",
            [],
            [{ productId: "prod_001", quantity: 1 }],
            { productId: 12, quantity: "two" },
            { productId: "prod_001", quantity: Number.MAX_SAFE_INTEGER },
            { productId: "prod_001", quantity: Number.NaN },
            JSON.parse('{"productId":"prod_001","quantity":1,"__proto__":{"admin":true}}'),
        ];

        for (const proposal of hostile) {
            expect(() => gate(proposal)).not.toThrow();
            expect(gate(proposal).allowed).toBe(false);
        }
    });
});
