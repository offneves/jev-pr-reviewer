export class MrDiffError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "MrDiffError";
    }
}
