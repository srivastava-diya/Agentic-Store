import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { foldAuditLog, spendSince } from "./audit.js";
import { loadCatalog } from "./catalog.js";
import { loadEnv } from "./env.js";
import { defaultGateConfig } from "./gate.js";
import { Inventory } from "./inventory.js";
import { placeOrder } from "./order.js";
import { resolvePaymentClient } from "./payment/index.js";
import proposalSchema from "./schemas/order-proposal.schema.json" with { type: "json" };

loadEnv();

const inventory = new Inventory(loadCatalog());
const payment = resolvePaymentClient();

const { $schema: _ignored, ...placeOrderInput } = proposalSchema;

const server = new Server(
    { name: "agentic-store", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

const text = (value: unknown) => ({
    content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
        {
            name: "search_catalog",
            description:
                "List the store's products with live prices and stock. Call this before ordering as product ids are not guessable.",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Optional case-insensitive filter on name or category." },
                },
                additionalProperties: false,
            },
        },
        {
            name: "place_order",
            description:
                "Order a product. The order is checked against the store's spending rules before any payment is made, and may be refused.",
            inputSchema: placeOrderInput,
        },
        {
            name: "read_audit_log",
            description: "Read the store's record of recent orders, including ones that were refused and why.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "search_catalog") {
        const query = typeof args?.["query"] === "string" ? args["query"].toLowerCase() : "";
        const products = inventory
            .list()
            .filter((p) => query === "" || p.name.toLowerCase().includes(query) || (p.category ?? "").includes(query));
        return text(products);
    }

    if (name === "read_audit_log") {
        const spent = spendSince(new Date(Date.now() - defaultGateConfig.spendWindowMs));
        return text({
            spentInWindow: spent,
            remainingInWindow: Math.max(0, defaultGateConfig.maxSpendPerWindow - spent),
            orders: foldAuditLog().toReversed().slice(0, 20),
        });
    }

    if (name === "place_order") {
        const outcome = await placeOrder(args, inventory, { payment });
        const { decision } = outcome;

        return {
            ...text({
                orderId: outcome.orderId,
                allowed: decision.allowed,
                code: decision.code,
                reason: decision.reason,
                ...(decision.total !== undefined ? { total: decision.total, currency: decision.currency } : {}),
                payment: outcome.payment ?? "not attempted, the store refused this order",
            }),

            isError: !decision.allowed,
        };
    }

    return { ...text(`Unknown tool: ${name}`), isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`agentic-store MCP server ready (payments: ${payment.name}, ${inventory.list().length} products)`);
