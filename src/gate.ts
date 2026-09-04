import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import proposalSchema from "./schemas/order-proposal.schema.json" with { type: "json" };
import type { Inventory } from "./inventory.js";
import type { Decision, OrderProposal } from "./types.js";

const ajv = new Ajv({ allErrors: true });
const validateProposal = ajv.compile<OrderProposal>(proposalSchema);

export interface GateConfig {
    maxOrderTotal: number;

    maxSpendPerWindow: number;

    spendWindowMs: number;

    allowedCurrency: string;
}

export const defaultGateConfig: GateConfig = {
    maxOrderTotal: 5000,
    maxSpendPerWindow: 10000,
    spendWindowMs: 60 * 60 * 1000,
    allowedCurrency: "INR",
};

export interface GateContext {
    inventory: Inventory;
    config?: GateConfig;

    spentInWindow?: number;
}

export function evaluateOrder(proposal: unknown, context: GateContext): Decision {
    const config = context.config ?? defaultGateConfig;
    const spentInWindow = context.spentInWindow ?? 0;

    if (proposal === null || proposal === undefined) {
        return {
            allowed: false,
            code: "NO_PROPOSAL",
            reason: "Agent produced no order proposal",
        };
    }

    if (!validateProposal(proposal)) {
        return {
            allowed: false,
            code: "MALFORMED_PROPOSAL",
            reason: `Proposal failed schema validation: ${ajv.errorsText(validateProposal.errors)}`,
        };
    }

    const { productId, quantity } = proposal;

    const product = context.inventory.find(productId);
    if (!product) {
        return {
            allowed: false,
            code: "UNKNOWN_PRODUCT",
            reason: `No product with id ${productId}`,
        };
    }

    if (product.currency !== config.allowedCurrency) {
        return {
            allowed: false,
            code: "CURRENCY_NOT_ALLOWED",
            reason: `${product.id} is priced in ${product.currency}, only ${config.allowedCurrency} is allowed`,
            productId,
            quantity,
        };
    }

    if (product.stock < quantity) {
        return {
            allowed: false,
            code: "INSUFFICIENT_STOCK",
            reason: `Not enough stock for ${product.id}: asked for ${quantity}, ${product.stock} available`,
            productId,
            quantity,
        };
    }

    const total = product.price * quantity;
    const priced = { total, currency: product.currency, productId, quantity };

    if (total > config.maxOrderTotal) {
        return {
            allowed: false,
            code: "OVER_BUDGET",
            reason: `Order total ${total} exceeds the ${config.maxOrderTotal} per-order limit`,
            ...priced,
        };
    }

    if (spentInWindow + total > config.maxSpendPerWindow) {
        const windowHours = config.spendWindowMs / (60 * 60 * 1000);
        return {
            allowed: false,
            code: "SPEND_LIMIT_EXCEEDED",
            reason: `Order of ${total} would take ${windowHours}h spend to ${spentInWindow + total}, over the ${config.maxSpendPerWindow} cap`,
            ...priced,
        };
    }

    return {
        allowed: true,
        code: "APPROVED",
        reason: `Order approved: ${quantity} x ${product.name} for ${total} ${product.currency}`,
        ...priced,
    };
}
