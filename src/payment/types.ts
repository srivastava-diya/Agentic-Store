export type PaymentStatus = "succeeded" | "failed" | "pending";

export interface ChargeRequest {
    orderId: string;

    amount: number;
    currency: string;
    description: string;

    idempotencyKey: string;
}

export interface PaymentResult {
    status: PaymentStatus;

    actionUrl?: string;

    reference?: string;
    reason?: string;
}

export interface PaymentClient {
    readonly name: string;
    charge(request: ChargeRequest): Promise<PaymentResult>;

    poll?(reference: string): Promise<PaymentResult>;

    cancel?(reference: string): Promise<PaymentResult>;
}
