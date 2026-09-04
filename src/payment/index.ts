import { mockPaymentClient } from "./mock.js";
import { createRazorpayPaymentClient } from "./razorpay.js";
import { createStripePaymentClient } from "./stripe.js";
import type { PaymentClient } from "./types.js";

export { mockPaymentClient, decliningPaymentClient } from "./mock.js";
export { createRazorpayPaymentClient } from "./razorpay.js";
export { createStripePaymentClient } from "./stripe.js";
export type { ChargeRequest, PaymentClient, PaymentResult, PaymentStatus } from "./types.js";

export function resolvePaymentClient(): PaymentClient {
    const razorpayKeyId = process.env["RAZORPAY_KEY_ID"];
    const razorpayKeySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (razorpayKeyId && razorpayKeySecret) {
        const baseUrl = process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000";
        return createRazorpayPaymentClient(razorpayKeyId, razorpayKeySecret, {
            returnUrl: `${baseUrl}/return`,
        });
    }

    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    return stripeKey ? createStripePaymentClient(stripeKey) : mockPaymentClient;
}
