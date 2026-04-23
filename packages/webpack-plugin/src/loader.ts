// ─────────────────────────────────────────────────────────────────────────────
// @jalvin/webpack-plugin — raw loader function
// ─────────────────────────────────────────────────────────────────────────────

import { compile } from "@jalvin/compiler";
import type { JalvinWebpackOptions } from "./index.js";

interface LoaderContext {
  resourcePath: string;
  getOptions(): JalvinWebpackOptions;
  emitWarning(err: Error): void;
  emitError(err: Error): void;
  async(): (err: Error | null, result?: string) => void;
  addDependency(path: string): void;
}

function loader(this: LoaderContext, source: string): void {
  const callback = this.async();
  const opts = this.getOptions() ?? {};

  const result = compile(source, this.resourcePath, {
    emitTypes: opts.emitTypes ?? false,
    runtimeImport: opts.runtimeImport ?? "@jalvin/runtime",
  });

  for (const diag of result.diagnostics) {
    if (diag.severity === "error") {
      this.emitError(
        new Error(`[Jalvin] ${diag.message} [${diag.code}] in ${this.resourcePath}:${diag.span ? diag.span.startLine + 1 : "?"}`)
      );
    } else if (diag.severity === "warning") {
      this.emitWarning(
        new Error(`[Jalvin] ${diag.message} [${diag.code}] in ${this.resourcePath}:${diag.span ? diag.span.startLine + 1 : "?"}`)
      );
    }
  }

  if (!result.ok) {
    callback(new Error(`[Jalvin] Compilation failed for ${this.resourcePath}`));
    return;
  }

  callback(null, result.code);
}

module.exports = loader;
export default loader;
