import { randomUUID } from "node:crypto";
import {
    appendAuditEntry,
    findByIdempotencyKey,
    readAuditLog,
    spendSince,
    type AuditEntry,
} from "./audit.js";
import { defaultGateConfig, evaluateOrder, type GateConfig } from "./gate.js";
import type { Inventory } from "./inventory.js";
import { mockPaymentClient } from "./payment/mock.js";
import type { PaymentClient, PaymentResult } from "./payment/types.js";
import type { Decision } from "./types.js";

export interface PlaceOrderOptions {
    config?: GateConfig;
    payment?: PaymentClient;

    idempotencyKey?: string;
}

export interface OrderOutcome {
    orderId: string;
    decision: Decision;

    payment?: PaymentResult;

    replayed?: boolean;
}

export async function placeOrder(
    proposal: unknown,
    inventory: Inventory,
    options: PlaceOrderOptions = {}
): Promise<OrderOutcome> {
    const payment = options.payment ?? mockPaymentClient;
    const config = options.config ?? defaultGateConfig;
    const entries = readAuditLog();

    if (options.idempotencyKey !== undefined) {
        const prior = findByIdempotencyKey(options.idempotencyKey, entries);
        if (prior) {
            return {
                orderId: prior.orderId,
                decision: {
                    allowed: prior.decision === "allowed",
                    code: prior.code,
                    reason: prior.reason,
                    ...(prior.total !== undefined ? { total: prior.total } : {}),
                    ...(prior.currency !== undefined ? { currency: prior.currency } : {}),
                },
                ...(prior.paymentResult !== undefined
                    ? { payment: { status: prior.paymentResult, ...(prior.paymentRef !== undefined ? { reference: prior.paymentRef } : {}) } }
                    : {}),
                replayed: true,
            };
        }
    }

    const orderId = randomUUID();
    const spentInWindow = spendSince(new Date(Date.now() - config.spendWindowMs), entries);
    const decision = evaluateOrder(proposal, { inventory, config, spentInWindow });

    const base = {
        orderId,
        proposal,
        ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
    };

    const log = (entry: Omit<AuditEntry, "orderId" | "proposal" | "timestamp">): void => {
        appendAuditEntry({ ...base, timestamp: new Date().toISOString(), ...entry });
    };

    const record = (outcome: Decision) => ({
        decision: outcome.allowed ? ("allowed" as const) : ("blocked" as const),
        code: outcome.code,
        reason: outcome.reason,
        ...(outcome.total !== undefined ? { total: outcome.total } : {}),
        ...(outcome.currency !== undefined ? { currency: outcome.currency } : {}),
    });

    log({ event: "decision", ...record(decision) });

    if (!decision.allowed || decision.total === undefined || decision.currency === undefined) {
        return { orderId, decision };
    }

    const productId = decision.productId ?? "";
    const quantity = decision.quantity ?? 0;
    if (!inventory.reserve(orderId, productId, quantity)) {
        const raced: Decision = {
            allowed: false,
            code: "INSUFFICIENT_STOCK",
            reason: `Stock for ${productId} was taken by another order before payment`,
        };
        log({ event: "decision", ...record(raced) });
        return { orderId, decision: raced };
    }

    const result = await payment.charge({
        orderId,
        amount: decision.total,
        currency: decision.currency,
        description: decision.reason,
        idempotencyKey: options.idempotencyKey ?? orderId,
    });

    if (result.status === "succeeded") {
        inventory.commit(orderId);
    } else if (result.status === "failed") {
        inventory.release(orderId);
    }

    log({
        event: "payment",
        ...record(decision),
        paymentProvider: payment.name,
        paymentResult: result.status,
        ...(result.reference !== undefined ? { paymentRef: result.reference } : {}),
        ...(result.actionUrl !== undefined ? { paymentUrl: result.actionUrl } : {}),
        ...(result.reason !== undefined ? { reason: `${decision.reason}: ${result.reason}` } : {}),
    });

    return { orderId, decision, payment: result };
}
