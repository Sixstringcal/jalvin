// ─────────────────────────────────────────────────────────────────────────────
// @jalvin/vite-plugin — Vite plugin for the Jalvin language
//
// Usage (vite.config.ts):
//
//   import jalvin from "@jalvin/vite-plugin";
//
//   export default defineConfig({
//     plugins: [jalvin()],
//   });
//
// You can then import .jalvin files directly in your app:
//
//   import { Counter } from "./Counter.jalvin";
// ─────────────────────────────────────────────────────────────────────────────

import { compile } from "@jalvin/compiler";

export interface JalvinViteOptions {
  /**
   * Extra file extensions to treat as Jalvin sources.
   * Default: [".jalvin"]
   */
  extensions?: string[];
  /**
   * Emit TypeScript type annotations in output.
   * Default: false
   */
  emitTypes?: boolean;
  /**
   * Runtime package to import from.
   * Default: "@jalvin/runtime"
   */
  runtimeImport?: string;
}

export function jalvin(opts: JalvinViteOptions = {}): any {
  const extensions = opts.extensions ?? [".jalvin"];
  let viteConfig: any;

  const isJalvinFile = (id: string): boolean =>
    extensions.some((ext) => id.endsWith(ext));

  return {
    name: "vite-plugin-jalvin",
    enforce: "pre",

    configResolved(config: any) {
      viteConfig = config;
    },

    resolveId(id: string, importer: string | undefined) {
      // Allow .jalvin imports without explicit extension in some scenarios
      if (isJalvinFile(id)) return id;
      return null;
    },

    transform(code: string, id: string) {
      if (!isJalvinFile(id)) return null;

      const result = compile(code, id, {
        emitTypes: opts.emitTypes ?? false,
        runtimeImport: opts.runtimeImport ?? "@jalvin/runtime",
      });

      if (!result.ok) {
        const errors = result.diagnostics.items
          .filter((d) => d.severity === "error")
          .map((d) => {
            const loc = d.span ? `${id}:${d.span.startLine + 1}:${d.span.startCol + 1}` : id;
            return `  ${loc}: ${d.message} [${d.code}]`;
          })
          .join("\n");
        this.error(`Jalvin compilation failed:\n${errors}`);
        return null;
      }

      // Surface warnings through Vite
      for (const diag of result.diagnostics.items) {
        if (diag.severity === "warning") {
          this.warn({
            message: diag.message,
            id,
          });
        }
      }

      return {
        code: result.code,
        // Basic line map for source-map support
        map: {
          version: 3 as const,
          sources: [id],
          sourcesContent: [code],
          mappings: "",
          names: [],
        },
      };
    },

    handleHotUpdate({ file, server }: { file: string; server: any }) {
      if (!isJalvinFile(file)) return;
      // Force full reload for now — incremental recompile is straightforward
      server.ws.send({ type: "full-reload", path: file });
      return [];
    },
  };
}

export default jalvin;
