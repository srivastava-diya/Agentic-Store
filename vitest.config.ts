import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const scratchLedger = fileURLToPath(new URL("./data/test-audit-log.jsonl", import.meta.url));

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        env: { AUDIT_LOG_PATH: scratchLedger },
        fileParallelism: false,
    },
});
