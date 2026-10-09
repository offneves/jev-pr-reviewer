import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load .env from the package root, then from the current working directory
 * (cwd wins). Safe to call multiple times.
 */
export function loadEnv(): void {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageRoot = resolve(here, "..");
    config({ path: resolve(packageRoot, ".env") });
    config({ path: resolve(process.cwd(), ".env"), override: true });
}
