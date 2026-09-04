import { randomUUID } from "node:crypto";
import type { ChargeRequest, PaymentClient, PaymentResult } from "./types.js";

export const mockPaymentClient: PaymentClient = {
    name: "mock",
    charge(_request: ChargeRequest): Promise<PaymentResult> {
        return Promise.resolve({
            status: "succeeded",
            reference: `mock_${randomUUID().slice(0, 8)}`,
        });
    },
};

export const cancellableMockPaymentClient: PaymentClient = {
    name: "mock-pending",
    charge(request: ChargeRequest): Promise<PaymentResult> {
        return Promise.resolve({
            status: "pending",
            reference: `mock_link_${request.orderId.slice(0, 8)}`,
            actionUrl: "https://example.invalid/pay",
        });
    },
    poll(reference: string): Promise<PaymentResult> {
        return Promise.resolve({ status: "pending", reference });
    },
    cancel(reference: string): Promise<PaymentResult> {
        return Promise.resolve({ status: "failed", reference, reason: "Payment link cancelled" });
    },
};

export const decliningPaymentClient: PaymentClient = {
    name: "mock-declining",
    charge(_request: ChargeRequest): Promise<PaymentResult> {
        return Promise.resolve({
            status: "failed",
            reason: "Card declined by issuer",
        });
    },
};
