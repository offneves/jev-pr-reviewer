import { spawn } from "node:child_process";

export interface CommandResult {
    code: number;
    stdout: string;
    stderr: string;
}

export type RunCommand = (
    command: string,
    args: string[],
    options?: { cwd?: string },
) => Promise<CommandResult>;

export const runCommand: RunCommand = (command, args, options = {}) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            shell: false,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
            reject(err);
        });
        child.on("close", (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
