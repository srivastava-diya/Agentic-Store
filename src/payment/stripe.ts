import Stripe from "stripe";
import type { ChargeRequest, PaymentClient, PaymentResult } from "./types.js";

const MINOR_UNITS_PER_MAJOR = 100;

export function createStripePaymentClient(secretKey: string): PaymentClient {
    if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("rk_test_")) {
        throw new Error(
            "STRIPE_SECRET_KEY is not a test key. Refusing to start: this project only runs against Stripe test mode."
        );
    }

    const stripe = new Stripe(secretKey);

    return {
        name: "stripe-test",
        async charge(request: ChargeRequest): Promise<PaymentResult> {
            try {
                const intent = await stripe.paymentIntents.create({
                    amount: request.amount * MINOR_UNITS_PER_MAJOR,
                    currency: request.currency.toLowerCase(),
                    description: request.description,
                    confirm: true,
                    payment_method: "pm_card_visa",
                    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
                    metadata: { orderId: request.orderId },
                }, { idempotencyKey: request.idempotencyKey });

                return intent.status === "succeeded"
                    ? { status: "succeeded", reference: intent.id }
                    : { status: "failed", reference: intent.id, reason: `Payment intent ended as ${intent.status}` };
            } catch (error) {
                return {
                    status: "failed",
                    reason: error instanceof Error ? error.message : "Unknown Stripe error",
                };
            }
        },
    };
}
