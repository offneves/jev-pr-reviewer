#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(__dirname, "../dist/cli/main.js");
const srcEntry = resolve(__dirname, "../src/cli/main.ts");

async function main() {
    try {
        await access(distEntry);
        const mod = await import(pathToFileURL(distEntry).href);
        await mod.runCli();
    } catch {
        await import("tsx/esm");
        const mod = await import(pathToFileURL(srcEntry).href);
        await mod.runCli();
    }
}

await main();
