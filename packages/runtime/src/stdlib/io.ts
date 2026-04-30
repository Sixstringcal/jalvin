// ─────────────────────────────────────────────────────────────────────────────
// stdlib/io.ts — Console output
// ─────────────────────────────────────────────────────────────────────────────

export function println(...args: unknown[]): void {
  console.log(...args);
}

export function print(...args: unknown[]): void {
  process.stdout?.write(args.map(String).join(""));
}
