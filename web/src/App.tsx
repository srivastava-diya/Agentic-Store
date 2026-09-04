import { useCallback, useEffect, useRef, useState } from "react";
import { askAgent, cancelOrder, getAudit, getCatalog, getConfig, orderDirect, rupees, settle } from "./api";

import { ProductIcon } from "./icons";

import type { AuditEntry, Config, Outcome, Product } from "./api";

const SUGGESTIONS = [
    "something to type on, the clicky kind",
    "I need to be on a video call tomorrow",
    "cheapest way to charge my phone on the go",
    "two of the best keyboard you have",
    "get me a gaming laptop",
];

function productOf(proposal: unknown, catalog: Product[]): Product | undefined {
    if (typeof proposal !== "object" || proposal === null) return undefined;
    const id = (proposal as { productId?: unknown }).productId;
    return typeof id === "string" ? catalog.find((product) => product.id === id) : undefined;
}

const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour12: false });

function Meter({ spent, cap }: { spent: number; cap: number }) {
    const segments = 24;
    const lit = Math.min(segments, Math.round((spent / cap) * segments));
    return (
        <div className="meter" aria-label={`${spent} of ${cap} spent`}>
            {Array.from({ length: segments }, (_, i) => (
                <i key={i} className={i < lit ? (lit > segments * 0.8 ? "on warn" : "on") : ""} />
            ))}
        </div>
    );
}

function Slip({ outcome, catalog, onCancel }: { outcome: Outcome; catalog: Product[]; onCancel?: (orderId: string) => void }) {
    const { decision, payment } = outcome;
    const product = productOf(outcome.proposal, catalog);
    const state = decision.allowed ? "allowed" : "refused";
    const settled = payment?.status;
    const stamp = !decision.allowed
        ? { text: "REFUSED", tone: "refused" }
        : settled === "succeeded"
          ? { text: "PAID", tone: "allowed" }
          : settled === "pending"
            ? { text: "ISSUED", tone: "pending" }
            : { text: "UNPAID", tone: "refused" };

    return (
        <div className="slip">
            <div className="slip-head">
                <span className="label">Order record</span>
                <span className={`stamp ${stamp.tone}`}>{stamp.text}</span>
            </div>

            <div className="stage">
                <span className="label">01 Proposed</span>
                <div className="stage-body">
                    <div className="stage-value">{JSON.stringify(outcome.proposal ?? null)}</div>
                    {product && (
                        <div className="stage-product">
                            {product.name} <span className="faint">· {rupees(product.price)} each</span>
                        </div>
                    )}
                    {outcome.agent && <div className="stage-note">by {outcome.agent}</div>}
                </div>
            </div>

            <div className="stage">
                <span className="label">02 Gate</span>
                <div className="stage-body">
                    <div>
                        <span className={`verdict ${state}`}>
                            {decision.allowed ? "ALLOWED" : "REFUSED"}
                        </span>
                        <span className="code">{decision.code}</span>
                    </div>
                    <div className="stage-note">{decision.reason}</div>
                </div>
            </div>

            <div className={`stage${payment ? "" : " skipped"}`}>
                <span className="label">03 Payment</span>
                <div className="stage-body">
                    {payment ? (
                        <>
                            <div className="stage-value">
                                <span className={`verdict ${payment.status === "succeeded" ? "allowed" : payment.status === "pending" ? "pending" : "refused"}`}>
                                    {payment.status.toUpperCase()}
                                </span>
                            </div>
                            <div className="stage-note">{payment.reference ?? payment.reason}</div>
                            {payment.actionUrl && payment.status === "pending" && (
                                <a className="pay-link" href={payment.actionUrl} target="_blank" rel="noreferrer">
                                    Complete this payment →
                                </a>
                            )}
                            {payment.status === "pending" && onCancel && (
                                <div className="stage-actions">
                                    <button className="linkish" onClick={() => onCancel(outcome.orderId)}>
                                        Abandon this order
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="stage-value">
                            never called. The gate stopped this before money moved
                        </div>
                    )}
                </div>
            </div>

            <div className="slip-foot">
                <span>order {outcome.orderId.slice(0, 8)}</span>
                <span>
                    {!outcome.decision.allowed ? "no charge" : settled === "succeeded" ? "settled" : "awaiting payment"}
                </span>
            </div>
        </div>
    );
}

function PriceList({
    products,
    onOrder,
    busy,
}: {
    products: Product[];
    onOrder: (product: Product) => void;
    busy: boolean;
}) {
    return (
        <table className="pricelist">
            <tbody>
                {products.map((product) => (
                    <tr key={product.id} className={product.stock === 0 ? "dim" : ""}>
                        <td className="pl-icon">
                            <ProductIcon id={product.id} />
                        </td>
                        <td>
                            <div className="pl-name">{product.name}</div>
                            <div className="pl-id">{product.id}</div>
                        </td>
                        <td className="pl-category faint">{product.category ?? ""}</td>
                        <td className={`pl-stock${product.stock === 0 ? " out" : ""}`}>
                            {product.stock === 0 ? "none" : `${product.stock} in stock`}
                        </td>
                        <td className="pl-price">{rupees(product.price)}</td>
                        <td className="pl-buy">
                            <button
                                onClick={() => onOrder(product)}
                                disabled={product.stock === 0 || busy}
                            >
                                buy
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function Ledger({ entries, catalog, onCancel }: { entries: AuditEntry[]; catalog: Product[]; onCancel: (orderId: string) => void }) {
    if (entries.length === 0) {
        return <p className="empty-note">Nothing ordered yet. The ledger fills as orders are attempted.</p>;
    }

    return (
        <div className="ledger-wrap">
            <table className="ledger">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Verdict</th>
                        <th>Rule</th>
                        <th>Proposal</th>
                        <th>Reason</th>
                        <th className="num">Amount</th>
                        <th>Payment</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.orderId}>
                            <td className="faint">{clock(entry.timestamp)}</td>
                            <td className={`verdict-cell ${entry.decision === "allowed" ? "allowed" : "refused"}`}>
                                {entry.decision === "allowed" ? "ALLOWED" : "REFUSED"}
                            </td>
                            <td className="faint">{entry.code.toLowerCase()}</td>
                            <td>
                                {JSON.stringify(entry.proposal)}
                                {(() => {
                                    const named = productOf(entry.proposal, catalog);
                                    return named ? <div className="ledger-product">{named.name}</div> : null;
                                })()}
                            </td>
                            <td className="reason-cell">{entry.reason}</td>
                            <td className="num">{entry.total === undefined ? "-" : rupees(entry.total)}</td>
                            <td className={
                                entry.paymentResult === "failed"
                                    ? "verdict-cell refused"
                                    : entry.paymentResult === "pending"
                                      ? "verdict-cell pending"
                                      : "faint"
                            }>
                                {entry.paymentResult === "pending" ? (
                                    <div className="ledger-pending">
                                        {entry.paymentUrl && (
                                            <a className="pay-link" href={entry.paymentUrl} target="_blank" rel="noreferrer">
                                                pending, pay
                                            </a>
                                        )}
                                        <button className="linkish" onClick={() => onCancel(entry.orderId)}>
                                            abandon
                                        </button>
                                    </div>
                                ) : entry.paymentResult ? (
                                    entry.paymentRef ?? entry.paymentResult
                                ) : (
                                    "-"
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

type Route = "desk" | "shop" | "ledger";

const ROUTES: Array<{ id: Route; label: string }> = [
    { id: "desk", label: "Order desk" },
    { id: "shop", label: "Shop" },
    { id: "ledger", label: "Ledger" },
];

const routeFromHash = (): Route => {
    const id = window.location.hash.replace(/^#\/?/, "");
    return ROUTES.some((route) => route.id === id) ? (id as Route) : "desk";
};

function useRoute(): [Route, (route: Route) => void] {
    const [route, setRoute] = useState<Route>(routeFromHash);

    useEffect(() => {
        const onChange = () => setRoute(routeFromHash());
        window.addEventListener("hashchange", onChange);
        return () => window.removeEventListener("hashchange", onChange);
    }, []);

    const go = useCallback((next: Route) => {
        window.location.hash = `/${next}`;
    }, []);

    return [route, go];
}

function TopBar({
    route,
    go,
    counts,
    config,
}: {
    route: Route;
    go: (route: Route) => void;
    counts: Partial<Record<Route, number>>;
    config: Config | null;
}) {
    return (
        <header className="topbar">
            <div className="brand">
                Agentic <em>Store</em>
            </div>

            <nav className="nav">
                {ROUTES.map((entry) => (
                    <button
                        key={entry.id}
                        className={`nav-item${route === entry.id ? " active" : ""}`}
                        onClick={() => go(entry.id)}
                    >
                        {entry.label}
                        {counts[entry.id] !== undefined && (
                            <span className="nav-count">{counts[entry.id]}</span>
                        )}
                    </button>
                ))}
            </nav>

            {config && (
                <div className="bar-status">
                    <div className="bar-stat">
                        <span>agent</span>
                        <b>{config.agent.replace("gemini:", "")}</b>
                    </div>
                    <div className="bar-stat">
                        <span>payments</span>
                        <b>{config.payment}</b>
                    </div>
                    <div className="bar-stat">
                        <span>per order</span>
                        <b>{rupees(config.gate.maxOrderTotal)}</b>
                    </div>
                    <div className="bar-stat">
                        <span>{config.spend.windowHours}h spend</span>
                        <b>
                            {rupees(config.spend.spent)} / {rupees(config.gate.maxSpendPerWindow)}
                        </b>
                        <Meter spent={config.spend.spent} cap={config.gate.maxSpendPerWindow} />
                    </div>
                </div>
            )}
        </header>
    );
}

interface Turn {
    id: string;
    goal: string;
    quantity: number;
    outcome?: Outcome;
    error?: string;
}

export default function App() {
    const [route, go] = useRoute();
    const [config, setConfig] = useState<Config | null>(null);
    const [catalog, setCatalog] = useState<Product[]>([]);
    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [goal, setGoal] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [busy, setBusy] = useState(false);
    const foot = useRef<HTMLDivElement | null>(null);

    const refresh = useCallback(async () => {
        const [nextConfig, nextCatalog, nextAudit] = await Promise.all([
            getConfig(),
            getCatalog(),
            getAudit(),
        ]);
        setConfig(nextConfig);
        setCatalog(nextCatalog);
        setAudit(nextAudit);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [turns]);

    const pendingCount = audit.filter((entry) => entry.paymentResult === "pending").length;

    useEffect(() => {
        if (pendingCount === 0) return;

        const check = () => {
            void settle().then(refresh);
        };
        const timer = window.setInterval(check, 5000);
        window.addEventListener("focus", check);

        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", check);
        };
    }, [pendingCount, refresh]);

    const record = useCallback(
        async (turn: Turn, action: () => Promise<Outcome>) => {
            setBusy(true);
            setTurns((current) => [...current, turn]);
            try {
                const outcome = await action();
                setTurns((current) =>
                    current.map((entry) => (entry.id === turn.id ? { ...entry, outcome } : entry))
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : "Request failed";
                setTurns((current) =>
                    current.map((entry) => (entry.id === turn.id ? { ...entry, error: message } : entry))
                );
            } finally {
                setBusy(false);
                await refresh();
            }
        },
        [refresh]
    );

    const submit = useCallback(
        (description: string) => {
            const text = description.trim();
            if (text === "" || busy) return;
            setGoal("");
            void record({ id: crypto.randomUUID(), goal: text, quantity }, () =>
                askAgent(text, quantity)
            );
        },
        [busy, quantity, record]
    );

    const buy = useCallback(
        (product: Product) => {
            if (busy) return;
            go("desk");
            void record(
                { id: crypto.randomUUID(), goal: `Order 1 x ${product.name} directly`, quantity: 1 },
                () => orderDirect(product.id, 1)
            );
        },
        [busy, go, record]
    );

    const abandon = useCallback(
        (orderId: string) => {
            void cancelOrder(orderId)
                .then(refresh)
                .then(() =>
                    setTurns((current) =>
                        current.map((entry) =>
                            entry.outcome?.orderId === orderId && entry.outcome.payment
                                ? {
                                      ...entry,
                                      outcome: {
                                          ...entry.outcome,
                                          payment: {
                                              ...entry.outcome.payment,
                                              status: "failed" as const,
                                              reason: "Payment link cancelled",
                                          },
                                      },
                                  }
                                : entry
                        )
                    )
                );
        },
        [refresh]
    );

    const pendingNote = pendingCount > 0 && (
        <p className="pending-banner">
            {pendingCount} payment link{pendingCount > 1 ? "s" : ""} outstanding. Stock stays
            reserved and the amount counts against the cap until it settles. Re-checking every 5s.
        </p>
    );

    return (
        <div className="app">
            <TopBar
                route={route}
                go={go}
                counts={{ shop: catalog.length, ledger: audit.length }}
                config={config}
            />

            <div className="body">
                {route === "desk" && (
                    <div className="desk">
                        <div className="transcript">
                            {turns.length === 0 ? (
                                <div className="opening">
                                    <h2>What should the agent buy?</h2>
                                    <p>
                                        Ask in plain language. The agent proposes, a gate it cannot see
                                        decides, and every attempt is written to the ledger before any
                                        money moves.
                                    </p>
                                </div>
                            ) : (
                                <div className="transcript-inner">
                                    {turns.map((turn) => (
                                        <div className="turn" key={turn.id}>
                                            <div className="said">
                                                {turn.goal}
                                                {turn.quantity > 1 && (
                                                    <span className="said-qty">× {turn.quantity}</span>
                                                )}
                                            </div>
                                            {turn.outcome ? (
                                                <Slip outcome={turn.outcome} catalog={catalog} onCancel={abandon} />
                                            ) : turn.error ? (
                                                <div className="turn-error">
                                                    <span className="label">Could not decide</span>
                                                    <p>{turn.error}</p>
                                                    <p className="turn-error-note">
                                                        No order was placed and nothing was charged.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="thinking">deciding</div>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={foot} />
                                </div>
                            )}
                        </div>

                        <div className="composer">
                            <div className="composer-inner">
                                <div className="composer-row">
                                    <input
                                        type="text"
                                        value={goal}
                                        placeholder="buy me something to type on"
                                        autoFocus
                                        onChange={(event) => setGoal(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") submit(goal);
                                        }}
                                    />
                                    <label className="qty">
                                        <span>qty</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={quantity}
                                            onChange={(event) =>
                                                setQuantity(Math.max(1, Number(event.target.value) || 1))
                                            }
                                        />
                                    </label>
                                    <button className="primary" onClick={() => submit(goal)} disabled={busy}>
                                        {busy ? "Working" : "Send"}
                                    </button>
                                </div>

                                <div className="suggestions">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            onClick={() => submit(suggestion)}
                                            disabled={busy}
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {route === "shop" && (
                    <div className="scroll-page">
                        <div className="sheet-width">
                            <div className="section-head">
                                <span className="label">Price list · {catalog.length} items</span>
                                <span className="label">Same gate, no agent involved</span>
                            </div>
                            {pendingNote}
                            <PriceList products={catalog} busy={busy} onOrder={buy} />
                            <p className="rule-note">
                                Ordering here skips the agent entirely, but the proposal still goes through
                                the same seven rules, and the receipt appears on the order desk.
                            </p>
                        </div>
                    </div>
                )}

                {route === "ledger" && (
                    <div className="scroll-page">
                        <div className="sheet-width">
                            <div className="section-head">
                                <span className="label">
                                    {audit.length} orders ·{" "}
                                    {audit.filter((entry) => entry.decision === "blocked").length} refused
                                </span>
                                <span className="label">Append-only · stock is rebuilt from this</span>
                            </div>
                            {pendingNote}
                            <Ledger entries={audit} catalog={catalog} onCancel={abandon} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
