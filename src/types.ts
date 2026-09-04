export interface Product {
    id: string;
    name: string;
    price: number;
    currency: string;
    stock: number;

    category?: string;
    icon?: string;
}

export interface OrderProposal {
    productId: string;
    quantity: number;
}

export type DecisionCode = "APPROVED" | "NO_PROPOSAL" | "MALFORMED_PROPOSAL" | "UNKNOWN_PRODUCT" | "CURRENCY_NOT_ALLOWED" | "INSUFFICIENT_STOCK" | "OVER_BUDGET" | "SPEND_LIMIT_EXCEEDED";

export interface Decision {
    allowed: boolean;
    code: DecisionCode;
    reason: string;

    total?: number;
    currency?: string;

    productId?: string;
    quantity?: number;
}
