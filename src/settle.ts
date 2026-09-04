import { appendAuditEntry, foldAuditLog, pendingOrders, type AuditEntry } from "./audit.js";
import type { Inventory } from "./inventory.js";
import type { PaymentClient } from "./payment/types.js";

function proposalOf(entry: AuditEntry): { productId: string; quantity: number } | undefined {
    const proposal = entry.proposal;
    if (typeof proposal !== "object" || proposal === null) return undefined;
    const { productId, quantity } = proposal as { productId?: unknown; quantity?: unknown };
    return typeof productId === "string" && typeof quantity === "number"
        ? { productId, quantity }
        : undefined;
}

export interface RestoredState {
    settled: number;
    reserved: number;
}

export function restoreFromLedger(inventory: Inventory): RestoredState {
    const state: RestoredState = { settled: 0, reserved: 0 };

    for (const order of foldAuditLog()) {
        const proposal = proposalOf(order);
        if (!proposal) continue;

        if (order.paymentResult === "succeeded") {
            inventory.consume(proposal.productId, proposal.quantity);
            state.settled += 1;
        } else if (order.paymentResult === "pending") {
            inventory.restore(order.orderId, proposal.productId, proposal.quantity);
            state.reserved += 1;
        }
    }

    return state;
}

export async function cancelOrder(
    orderId: string,
    inventory: Inventory,
    payment: PaymentClient
): Promise<Settlement | undefined> {
    const order = pendingOrders().find((entry) => entry.orderId === orderId);
    if (!order || order.paymentRef === undefined || !payment.cancel) {
        return undefined;
    }

    const result = await payment.cancel(order.paymentRef);
    if (result.status === "pending") {
        return { orderId, from: "pending", to: "pending" };
    }

    inventory.release(orderId);

    appendAuditEntry({
        ...order,
        timestamp: new Date().toISOString(),
        event: "payment",
        paymentResult: "failed",
        reason: `${order.reason}: ${result.reason ?? "cancelled"}`,
    });

    return {
        orderId,
        from: "pending",
        to: "failed",
        ...(result.reference !== undefined ? { reference: result.reference } : {}),
    };
}

export interface Settlement {
    orderId: string;
    from: "pending";
    to: "succeeded" | "failed" | "pending";
    reference?: string;
}

export async function settlePending(
    inventory: Inventory,
    payment: PaymentClient
): Promise<Settlement[]> {
    if (!payment.poll) {
        return [];
    }

    const settlements: Settlement[] = [];

    for (const order of pendingOrders()) {
        if (order.paymentRef === undefined) {
            continue;
        }

        const result = await payment.poll(order.paymentRef);
        if (result.status === "pending") {
            settlements.push({ orderId: order.orderId, from: "pending", to: "pending" });
            continue;
        }

        if (result.status === "succeeded") {
            inventory.commit(order.orderId);
        } else {
            inventory.release(order.orderId);
        }

        const entry: AuditEntry = {
            ...order,
            timestamp: new Date().toISOString(),
            event: "payment",
            paymentResult: result.status,
            reason:
                result.status === "succeeded"
                    ? `${order.reason}: payment link settled`
                    : `${order.reason}: ${result.reason ?? "payment link did not settle"}`,
            ...(result.reference !== undefined ? { paymentRef: result.reference } : {}),
        };
        appendAuditEntry(entry);

        settlements.push({
            orderId: order.orderId,
            from: "pending",
            to: result.status,
            ...(result.reference !== undefined ? { reference: result.reference } : {}),
        });
    }

    return settlements;
}
