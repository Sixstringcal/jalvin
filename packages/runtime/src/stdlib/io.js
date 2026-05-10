// ─────────────────────────────────────────────────────────────────────────────
// stdlib/io.ts — Console output
// ─────────────────────────────────────────────────────────────────────────────
export function println(...args) {
    console.log(...args);
}
export function print(...args) {
    process.stdout?.write(args.map(String).join(""));
}
//# sourceMappingURL=io.js.map