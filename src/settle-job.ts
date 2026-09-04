import { loadCatalog } from "./catalog.js";
import { Inventory } from "./inventory.js";
import { loadEnv } from "./env.js";
import { pendingOrders } from "./audit.js";
import { resolvePaymentClient } from "./payment/index.js";
import { restoreFromLedger, settlePending } from "./settle.js";

loadEnv();

const inventory = new Inventory(loadCatalog());
const payment = resolvePaymentClient();

const restored = restoreFromLedger(inventory);
const outstanding = pendingOrders();
console.log(`provider: ${payment.name}`);
console.log(`ledger replay: ${restored.settled} sale(s) consumed, ${restored.reserved} reservation(s) rebuilt`);
console.log(`${outstanding.length} order(s) awaiting settlement\n`);

for (const order of outstanding) {
    console.log(`  ${order.orderId.slice(0, 8)}  ${order.paymentRef}  ${order.paymentUrl ?? ""}`);
}

const settlements = await settlePending(inventory, payment);
console.log(`\n${settlements.length} polled:`);
for (const settlement of settlements) {
    console.log(`  ${settlement.orderId.slice(0, 8)}  pending -> ${settlement.to}`);
}
