import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

export function loadEnv(): void {
    if (existsSync(ENV_PATH)) {
        process.loadEnvFile(ENV_PATH);
    }
}
