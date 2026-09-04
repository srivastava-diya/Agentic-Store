import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PaymentStatus } from "./payment/types.js";
import type { DecisionCode } from "./types.js";

export const AUDIT_LOG_PATH =
    process.env["AUDIT_LOG_PATH"] ?? fileURLToPath(new URL("../data/audit-log.jsonl", import.meta.url));

export interface AuditEntry {
    orderId: string;
    timestamp: string;
    event: "decision" | "payment";

    proposal: unknown;
    decision: "allowed" | "blocked";
    code: DecisionCode;
    reason: string;
    total?: number;
    currency?: string;
    paymentProvider?: string;
    paymentResult?: PaymentStatus;
    paymentRef?: string;

    paymentUrl?: string;

    idempotencyKey?: string;
}

export function appendAuditEntry(entry: AuditEntry): void {
    appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readAuditLog(): AuditEntry[] {
    if (!existsSync(AUDIT_LOG_PATH)) {
        return [];
    }

    return readFileSync(AUDIT_LOG_PATH, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as AuditEntry);
}

export function foldAuditLog(entries: readonly AuditEntry[] = readAuditLog()): AuditEntry[] {
    const byOrder = new Map<string, AuditEntry>();

    for (const entry of entries) {
        const existing = byOrder.get(entry.orderId);
        byOrder.set(entry.orderId, existing ? { ...existing, ...entry } : entry);
    }

    return [...byOrder.values()];
}

export function spendSince(since: Date, entries: readonly AuditEntry[] = readAuditLog()): number {
    return foldAuditLog(entries)
        .filter(
            (entry) =>
                entry.event === "payment" &&

                (entry.paymentResult === "succeeded" || entry.paymentResult === "pending") &&
                new Date(entry.timestamp) >= since
        )
        .reduce((sum, entry) => sum + (entry.total ?? 0), 0);
}

export function pendingOrders(entries: readonly AuditEntry[] = readAuditLog()): AuditEntry[] {
    return foldAuditLog(entries).filter((entry) => entry.paymentResult === "pending");
}

export function findByIdempotencyKey(
    key: string,
    entries: readonly AuditEntry[] = readAuditLog()
): AuditEntry | undefined {
    return foldAuditLog(entries).find((entry) => entry.idempotencyKey === key);
}
