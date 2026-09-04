import { describe, expect, test } from "vitest";
import {
    findByIdempotencyKey,
    foldAuditLog,
    pendingOrders,
    spendSince,
    type AuditEntry,
} from "../src/audit.js";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const entry = (over: Partial<AuditEntry> & Pick<AuditEntry, "orderId">): AuditEntry => ({
    timestamp: minutesAgo(1),
    event: "decision",
    proposal: { productId: "prod_001", quantity: 1 },
    decision: "allowed",
    code: "APPROVED",
    reason: "ok",
    ...over,
});

describe("foldAuditLog", () => {
    test("collapses the decision and payment lines of one order into a single row", () => {
        const folded = foldAuditLog([
            entry({ orderId: "a", event: "decision", total: 799 }),
            entry({ orderId: "a", event: "payment", total: 799, paymentResult: "succeeded" }),
            entry({ orderId: "b", event: "decision", decision: "blocked", code: "OVER_BUDGET" }),
        ]);

        expect(folded).toHaveLength(2);
        expect(folded[0]?.paymentResult).toBe("succeeded");
        expect(folded[0]?.total).toBe(799);
    });
});

describe("spendSince", () => {
    const since = () => new Date(Date.now() - 60 * 60_000);

    test("counts a settled order once, not once per ledger line", () => {
        const spent = spendSince(since(), [
            entry({ orderId: "a", event: "decision", total: 349 }),
            entry({ orderId: "a", event: "payment", total: 349, paymentResult: "succeeded" }),
        ]);

        expect(spent).toBe(349);
    });

    test("counts pending orders against the budget", () => {
        const spent = spendSince(since(), [
            entry({ orderId: "a", event: "payment", total: 500, paymentResult: "pending" }),
        ]);

        expect(spent).toBe(500);
    });

    test("ignores failed charges and orders the gate blocked", () => {
        const spent = spendSince(since(), [
            entry({ orderId: "a", event: "payment", total: 500, paymentResult: "failed" }),
            entry({ orderId: "b", event: "decision", decision: "blocked", code: "OVER_BUDGET", total: 9000 }),
        ]);

        expect(spent).toBe(0);
    });

    test("drops spend that has aged out of the window", () => {
        const ledger = [
            entry({ orderId: "old", event: "payment", total: 700, paymentResult: "succeeded", timestamp: minutesAgo(90) }),
            entry({ orderId: "new", event: "payment", total: 300, paymentResult: "succeeded", timestamp: minutesAgo(10) }),
        ];

        expect(spendSince(since(), ledger)).toBe(300);
    });
});

describe("pendingOrders and findByIdempotencyKey", () => {
    const ledger = [
        entry({ orderId: "a", event: "payment", total: 799, paymentResult: "pending", idempotencyKey: "checkout-1" }),
        entry({ orderId: "b", event: "payment", total: 500, paymentResult: "succeeded" }),
    ];

    test("lists only orders still awaiting settlement", () => {
        expect(pendingOrders(ledger).map((row) => row.orderId)).toEqual(["a"]);
    });

    test("finds a prior order by its idempotency key", () => {
        expect(findByIdempotencyKey("checkout-1", ledger)?.orderId).toBe("a");
        expect(findByIdempotencyKey("never-used", ledger)).toBeUndefined();
    });
});
