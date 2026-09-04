import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const transport = new StdioClientTransport({ command: "npx", args: ["tsx", serverPath] });
const client = new Client({ name: "smoke-test", version: "1.0.0" });

await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools advertised: ${tools.map((t) => t.name).join(", ")}\n`);

const first = (result: unknown): string => {
    const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
    return content[0]?.text ?? "";
};

const search = await client.callTool({ name: "search_catalog", arguments: { query: "keyboard" } });
console.log("search_catalog('keyboard'):");
console.log(first(search).split("\n").slice(0, 10).join("\n"), "\n");

const attempts: Array<{ label: string; args: Record<string, unknown> }> = [
    { label: "in-budget order", args: { productId: "prod_008", quantity: 1 } },
    { label: "over per-order cap", args: { productId: "prod_004", quantity: 1 } },
    { label: "out of stock", args: { productId: "prod_003", quantity: 1 } },
    { label: "hallucinated id", args: { productId: "prod_777", quantity: 1 } },
    { label: "smuggled price field", args: { productId: "prod_002", quantity: 1, price: 1 } },
];

for (const { label, args } of attempts) {
    const result = await client.callTool({ name: "place_order", arguments: args });
    const parsed = JSON.parse(first(result)) as { allowed: boolean; code: string; reason: string };
    console.log(`${parsed.allowed ? "ALLOW" : "BLOCK"}  ${label.padEnd(22)} [${parsed.code}] ${parsed.reason}`);
}

const audit = JSON.parse(first(await client.callTool({ name: "read_audit_log", arguments: {} }))) as {
    spentInWindow: number;
    remainingInWindow: number;
};
console.log(`\nspend this window: ${audit.spentInWindow} (remaining ${audit.remainingInWindow})`);

await client.close();
