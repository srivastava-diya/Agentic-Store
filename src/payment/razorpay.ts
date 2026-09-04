import Razorpay from "razorpay";
import type { ChargeRequest, PaymentClient, PaymentResult } from "./types.js";

function describeError(error: unknown): string {
    if (typeof error === "object" && error !== null) {
        const nested = (error as { error?: { description?: string; code?: string } }).error;
        if (nested?.description) {
            return nested.code ? `${nested.code}: ${nested.description}` : nested.description;
        }
    }
    return error instanceof Error ? error.message : "Unknown Razorpay error";
}

const PAISE_PER_RUPEE = 100;

const LINK_TTL_SECONDS = 30 * 60;

export interface RazorpayOptions {
    returnUrl?: string;
}

export function createRazorpayPaymentClient(
    keyId: string,
    keySecret: string,
    options: RazorpayOptions = {}
): PaymentClient {
    if (!keyId.startsWith("rzp_test_")) {
        throw new Error("RAZORPAY_KEY_ID is not a test key. Refusing to start: this project only runs in test mode.");
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    return {
        name: "razorpay-test",

        async charge(request: ChargeRequest): Promise<PaymentResult> {
            try {
                const link = await razorpay.paymentLink.create({
                    customer: { name: "AI buyer", email: "agent@agentic-store.local", contact: "+919812345678" },
                    amount: request.amount * PAISE_PER_RUPEE,
                    currency: request.currency,
                    description: request.description.slice(0, 2048),
                    reference_id: request.idempotencyKey,
                    expire_by: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
                    notes: { orderId: request.orderId },
                    notify: { email: false, sms: false },
                    ...(options.returnUrl
                        ? {
                              callback_url: `${options.returnUrl}?orderId=${encodeURIComponent(request.orderId)}`,
                              callback_method: "get" as const,
                          }
                        : {}),
                });

                return link.status === "paid"
                    ? { status: "succeeded", reference: link.id }
                    : { status: "pending", reference: link.id, actionUrl: link.short_url };
            } catch (error) {
                return {
                    status: "failed",
                    reason: describeError(error),
                };
            }
        },

        async cancel(reference: string): Promise<PaymentResult> {
            try {
                const link = await razorpay.paymentLink.cancel(reference);
                return { status: "failed", reference: link.id, reason: "Payment link cancelled" };
            } catch (error) {
                return { status: "pending", reference, reason: describeError(error) };
            }
        },

        async poll(reference: string): Promise<PaymentResult> {
            try {
                const link = await razorpay.paymentLink.fetch(reference);

                if (link.status === "paid") {
                    return { status: "succeeded", reference: link.id };
                }
                if (link.status === "expired" || link.status === "cancelled") {
                    return { status: "failed", reference: link.id, reason: `Payment link ${link.status}` };
                }
                return { status: "pending", reference: link.id, actionUrl: link.short_url };
            } catch (error) {
                return {
                    status: "pending",
                    reference,
                    reason: describeError(error),
                };
            }
        },
    };
}
