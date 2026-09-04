export interface Product {
    id: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    category?: string;
    icon?: string;
}

export interface Decision {
    allowed: boolean;
    code: string;
    reason: string;
    total?: number;
    currency?: string;
}

export type PaymentStatus = "succeeded" | "failed" | "pending";

export interface PaymentResult {
    status: PaymentStatus;
    reference?: string;
    reason?: string;
    actionUrl?: string;
}

export interface AuditEntry {
    orderId: string;
    timestamp: string;
    proposal: unknown;
    decision: "allowed" | "blocked";
    code: string;
    reason: string;
    total?: number;
    paymentResult?: PaymentStatus;
    paymentRef?: string;
    paymentUrl?: string;
}

export interface Config {
    agent: string;
    payment: string;
    gate: {
        maxOrderTotal: number;
        maxSpendPerWindow: number;
        spendWindowMs: number;
        allowedCurrency: string;
    };
    spend: { spent: number; remaining: number; windowHours: number };
}

export interface Outcome {
    orderId: string;
    decision: Decision;
    payment?: PaymentResult;
    proposal?: unknown;
    agent?: string;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const body = await response.json().catch(() => null);

    if (!response.ok && (body === null || (body as { decision?: unknown }).decision === undefined)) {
        const detail = (body as { error?: string } | null)?.error;
        throw new Error(detail ?? `Request failed (HTTP ${response.status})`);
    }

    return body as T;
}

const post = <T,>(path: string, body: unknown): Promise<T> =>
    json<T>(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

export const getConfig = () => json<Config>("/api/config");
export const getCatalog = () => json<Product[]>("/api/catalog");
export const getAudit = () => json<AuditEntry[]>("/api/audit");

export const askAgent = (description: string, quantity: number) =>
    post<Outcome>("/api/agent", { description, quantity });

export const orderDirect = (productId: string, quantity: number) =>
    post<Outcome>("/api/orders", { proposal: { productId, quantity } });

export const settle = () => post<{ settlements: unknown[] }>("/api/settle", {});

export const cancelOrder = (orderId: string) =>
    post<{ orderId: string; to: string }>(`/api/orders/${orderId}/cancel`, {});

export const rupees = (value: number): string =>
    "₹" + value.toLocaleString("en-IN");
