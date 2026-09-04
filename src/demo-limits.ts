import { rmSync } from "node:fs";
import { AUDIT_LOG_PATH, spendSince } from "./audit.js";
import { loadCatalog } from "./catalog.js";
import { Inventory } from "./inventory.js";
import { defaultGateConfig, type GateConfig } from "./gate.js";
import { placeOrder } from "./order.js";
import { decliningPaymentClient, mockPaymentClient } from "./payment/index.js";

const payment = mockPaymentClient;

function reset(): Inventory {
    rmSync(AUDIT_LOG_PATH, { force: true });
    return new Inventory(loadCatalog());
}

const spent = () => spendSince(new Date(Date.now() - defaultGateConfig.spendWindowMs));
const noSpendCap: GateConfig = { ...defaultGateConfig, maxSpendPerWindow: Number.MAX_SAFE_INTEGER };

console.log("--- 1. stock decrements as orders are paid for (5 keyboards in stock) ---");
let inventory = reset();
for (let attempt = 1; attempt <= 6; attempt += 1) {
    const { decision } = await placeOrder({ productId: "prod_002", quantity: 1 }, inventory, { payment, config: noSpendCap });
    console.log(`attempt ${attempt}  ${decision.allowed ? "ALLOW" : "BLOCK"}  [${decision.code.padEnd(18)}]  stock left: ${inventory.available("prod_002")}`);
    if (!decision.allowed) break;
}

console.log("\n--- 1b. a declined payment releases the reservation, it is not lost stock ---");
inventory = reset();
const before = inventory.available("prod_002");
const declined = await placeOrder({ productId: "prod_002", quantity: 1 }, inventory, { payment: decliningPaymentClient, config: noSpendCap });
console.log(`payment ${declined.payment?.status}  |  stock before ${before}, after ${inventory.available("prod_002")}`);

console.log(`\n--- 2. rolling spend cap (${defaultGateConfig.maxSpendPerWindow} per ${defaultGateConfig.spendWindowMs / 3600000}h): a loop of individually-legal orders ---`);

rmSync(AUDIT_LOG_PATH, { force: true });
inventory = new Inventory(loadCatalog().map((product) => ({ ...product, stock: 100 })));
for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { decision } = await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, { payment });
    console.log(`attempt ${String(attempt).padStart(2)}  ${decision.allowed ? "ALLOW" : "BLOCK"}  spent ${String(spent()).padStart(5)}  ${decision.allowed ? "" : decision.reason}`);
    if (!decision.allowed) break;
}

console.log("\n--- 3. idempotency: the same checkout submitted twice ---");
inventory = reset();
const key = "checkout-abc-123";
const first = await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, { payment, idempotencyKey: key });
const second = await placeOrder({ productId: "prod_001", quantity: 1 }, inventory, { payment, idempotencyKey: key });
console.log(`first   ${first.decision.code}  charge=${first.payment?.reference}  replayed=${first.replayed === true}`);
console.log(`second  ${second.decision.code}  charge=${second.payment?.reference}  replayed=${second.replayed === true}`);
console.log(`same charge: ${first.payment?.reference === second.payment?.reference}  |  stock moved once: ${inventory.available("prod_001")} of 12  |  total spent: ${spent()}`);
