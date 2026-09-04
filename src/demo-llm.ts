import { loadCatalog } from "./catalog.js";
import { Inventory } from "./inventory.js";
import { loadEnv } from "./env.js";
import { resolveAgent } from "./agent/index.js";
import { runAgent } from "./agent/run.js";
import type { Goal } from "./agent/types.js";
import { resolvePaymentClient } from "./payment/index.js";

loadEnv();

const inventory = new Inventory(loadCatalog());
const agent = resolveAgent();
const payment = resolvePaymentClient();

const goals: Goal[] = [
    { description: "I need something to click with, cheap", quantity: 1 },
    { description: "buy me a nice keyboard, the clicky kind", quantity: 1 },

    { description: "get me two of the best keyboard you have", quantity: 2 },
    { description: "I want to connect my monitor, get me a hub", quantity: 1 },
    { description: "buy me a gaming laptop", quantity: 1 },
];

console.log(`--- agent: ${agent.name} | payments: ${payment.name} ---\n`);

for (const goal of goals) {
    const run = await runAgent(agent, goal, inventory, { payment });
    const marker = run.decision.allowed ? "ALLOW " : "BLOCK ";

    console.log(`goal      "${goal.description}" x${goal.quantity}`);
    console.log(`proposed  ${JSON.stringify(run.proposal)}`);
    console.log(`${marker}    [${run.decision.code}] ${run.decision.reason}`);
    if (run.payment) {
        console.log(`payment   ${run.payment.status}${run.payment.reference ? ` (${run.payment.reference})` : ""}`);
    }
    console.log();
}
