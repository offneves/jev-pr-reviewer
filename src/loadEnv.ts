import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv(): void {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageRoot = resolve(here, "..");
    config({ path: resolve(packageRoot, ".env") });
    config({ path: resolve(process.cwd(), ".env"), override: true });
}
