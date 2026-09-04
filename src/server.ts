import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foldAuditLog, spendSince } from "./audit.js";
import { loadCatalog } from "./catalog.js";
import { loadEnv } from "./env.js";
import { defaultGateConfig } from "./gate.js";
import { Inventory } from "./inventory.js";
import { placeOrder } from "./order.js";
import { resolveAgent } from "./agent/index.js";
import { runAgent } from "./agent/run.js";
import type { Goal } from "./agent/types.js";
import { resolvePaymentClient } from "./payment/index.js";
import { cancelOrder, restoreFromLedger, settlePending } from "./settle.js";

loadEnv();

const PORT = Number(process.env["PORT"] ?? 3000);
const WEB_DIST = fileURLToPath(new URL("../web/dist", import.meta.url));

const inventory = new Inventory(loadCatalog());
const restored = restoreFromLedger(inventory);
const agent = resolveAgent();
const payment = resolvePaymentClient();

const app = express();
app.use(express.json());
app.use(express.static(WEB_DIST));

const windowStart = () => new Date(Date.now() - defaultGateConfig.spendWindowMs);

app.get("/api/config", (_req, res) => {
    const spent = spendSince(windowStart());
    res.json({
        agent: agent.name,
        payment: payment.name,
        gate: defaultGateConfig,
        spend: {
            spent,
            remaining: Math.max(0, defaultGateConfig.maxSpendPerWindow - spent),
            windowHours: defaultGateConfig.spendWindowMs / 3_600_000,
        },
    });
});

app.get("/return", async (_req, res) => {
    await settlePending(inventory, payment);
    res.redirect("/?settled=1");
});

app.post("/api/orders/:orderId/cancel", async (req, res) => {
    const settlement = await cancelOrder(String(req.params.orderId), inventory, payment);
    if (!settlement) {
        res.status(404).json({ error: "No unsettled order with that id" });
        return;
    }
    res.json(settlement);
});

app.post("/api/settle", async (_req, res) => {
    res.json({ settlements: await settlePending(inventory, payment) });
});

app.get("/api/catalog", (_req, res) => {
    res.json(inventory.list());
});

app.get("/api/audit", (_req, res) => {
    res.json(foldAuditLog().toReversed());
});

app.post("/api/orders", async (req, res) => {
    const outcome = await placeOrder(req.body?.proposal, inventory, {
        payment,
        ...(typeof req.body?.idempotencyKey === "string" ? { idempotencyKey: req.body.idempotencyKey } : {}),
    });
    res.status(outcome.decision.allowed ? 200 : 422).json(outcome);
});

app.post("/api/agent", async (req, res) => {
    const goal: Goal = {
        description: String(req.body?.description ?? ""),
        quantity: Number(req.body?.quantity ?? 1),
        ...(req.body?.maxPrice !== undefined && req.body.maxPrice !== null
            ? { maxPrice: Number(req.body.maxPrice) }
            : {}),
    };

    if (goal.description.trim() === "") {
        res.status(400).json({ error: "description is required" });
        return;
    }

    try {
        const run = await runAgent(agent, goal, inventory, { payment });
        res.status(run.decision.allowed ? 200 : 422).json(run);
    } catch (error) {
        res.status(503).json({
            error: error instanceof Error ? error.message : "Agent unavailable",
        });
    }
});

app.listen(PORT, () => {
    console.log(`agentic-store listening on http://localhost:${PORT}`);
    console.log(`  agent:    ${agent.name}`);
    console.log(`  payments: ${payment.name}`);
    if (restored.settled > 0 || restored.reserved > 0) {
        console.log(`  ledger:   ${restored.settled} settled sale(s) applied, ${restored.reserved} reservation(s) held`);
    }
    if (!existsSync(WEB_DIST)) {
        console.log("  frontend: not built. Run `npm run web:build`, or `npm run web` for the dev server");
    }
});
