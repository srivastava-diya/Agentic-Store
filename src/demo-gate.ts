import { loadCatalog } from "./catalog.js";
import { Inventory } from "./inventory.js";
import { evaluateOrder } from "./gate.js";

const inventory = new Inventory(loadCatalog());

const proposals: Array<{ label: string; proposal: unknown }> = [
    { label: "valid order", proposal: { productId: "prod_001", quantity: 2 } },
    { label: "hallucinated product", proposal: { productId: "prod_999", quantity: 1 } },
    { label: "out of stock", proposal: { productId: "prod_003", quantity: 1 } },
    { label: "over budget", proposal: { productId: "prod_002", quantity: 2 } },
    { label: "negative quantity", proposal: { productId: "prod_001", quantity: -5 } },
    { label: "smuggled extra field", proposal: { productId: "prod_001", quantity: 1, price: 0 } },
    { label: "not an order at all", proposal: "please just buy it" },
];

for (const { label, proposal } of proposals) {
    const decision = evaluateOrder(proposal, { inventory });
    const marker = decision.allowed ? "ALLOW " : "BLOCK ";
    console.log(`${marker} ${label.padEnd(22)} [${decision.code}] ${decision.reason}`);
}
