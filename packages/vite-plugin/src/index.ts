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
//
// To run a Jalvin UI app without any hand-written index.html or entry file,
// specify an `entry` option:
//
//   export default defineConfig({
//     plugins: [jalvin({
//       entry: { file: "./UIShowcase.jalvin", component: "UIShowcase" }
//     })],
//   });
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "node:path";
import * as fs from "node:fs";
import { compile } from "@jalvin/compiler";

const VIRTUAL_ENTRY = "virtual:@jalvin/app-entry";
const VIRTUAL_ENTRY_RESOLVED = "\0virtual:@jalvin/app-entry";

export interface JalvinAppEntry {
  /** Path to the root .jalvin file, relative to the Vite project root. */
  file: string;
  /** Name of the component to mount as the React root. */
  component: string;
  /** Optional page title for the generated HTML. */
  title?: string;
}

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
  /**
   * When set, the plugin generates a virtual index.html and React entry point
   * so no hand-written index.html or main.tsx is needed in the project.
   */
  entry?: JalvinAppEntry;
}

function generateIndexHtml(title: string, scriptSrc: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #fafafa;
        color: #1c1c1c;
      }
      #root { height: 100%; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
}

function generateEntryModule(entryFilePath: string, component: string): string {
  // Use React.createElement to avoid needing JSX in the virtual module itself.
  return [
    `import React from "react";`,
    `import ReactDOM from "react-dom/client";`,
    ``,
    `const rootEl = document.getElementById("root");`,
    `if (!rootEl) throw new Error("Missing #root element");`,
    `const root = ReactDOM.createRoot(rootEl);`,
    ``,
    `function showError(err) {`,
    `  root.render(`,
    `    React.createElement(`,
    `      "div",`,
    `      {`,
    `        style: {`,
    `          fontFamily: "monospace",`,
    `          padding: "32px",`,
    `          background: "#1a1a1a",`,
    `          color: "#ff6b6b",`,
    `          minHeight: "100vh",`,
    `          boxSizing: "border-box",`,
    `        },`,
    `      },`,
    `      React.createElement(`,
    `        "h2",`,
    `        { style: { margin: "0 0 16px", fontSize: "18px", color: "#ff4444" } },`,
    `        "\u26a0\ufe0f Jalvin App Error"`,
    `      ),`,
    `      React.createElement(`,
    `        "pre",`,
    `        {`,
    `          style: {`,
    `            whiteSpace: "pre-wrap",`,
    `            wordBreak: "break-word",`,
    `            background: "#111",`,
    `            padding: "16px",`,
    `            borderRadius: "6px",`,
    `            color: "#ff9898",`,
    `            fontSize: "13px",`,
    `          },`,
    `        },`,
    `        String(err?.stack ?? err)`,
    `      )`,
    `    )`,
    `  );`,
    `}`,
    ``,
    `window.addEventListener('unhandledrejection', e => showError(e.reason));`,
    `window.addEventListener('error', e => showError(e.error ?? e.message));`,
    ``,
    `try {`,
    `  const { ${component} } = await import(${JSON.stringify(entryFilePath)});`,
    `  root.render(`,
    `    React.createElement(React.StrictMode, null, React.createElement(${component}))`,
    `  );`,
    `} catch (err) {`,
    `  showError(err);`,
    `}`,
  ].join("\n");
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

    config(cfg: any, { command }: { command: string }) {
      // Ensure @jalvin/runtime (CJS) is pre-bundled by Vite's esbuild so the
      // browser receives a proper ES module instead of bare CommonJS.
      cfg.optimizeDeps = cfg.optimizeDeps ?? {};
      const include: string[] = cfg.optimizeDeps.include ?? [];
      if (!include.includes("@jalvin/runtime")) include.push("@jalvin/runtime");
      cfg.optimizeDeps.include = include;

      if (!opts.entry) return;
      if (command === "build") {
        // For builds, set the virtual entry as the rollup input.
        const rollupOptions = cfg.build?.rollupOptions ?? {};
        rollupOptions.input = VIRTUAL_ENTRY;
        cfg.build = { ...(cfg.build ?? {}), rollupOptions };
      }
    },

    resolveId(id: string, importer: string | undefined) {
      if (id === VIRTUAL_ENTRY) return VIRTUAL_ENTRY_RESOLVED;
      if (isJalvinFile(id)) return id;
      return null;
    },

    load(id: string) {
      if (id !== VIRTUAL_ENTRY_RESOLVED || !opts.entry) return null;
      const root = viteConfig?.root ?? process.cwd();
      const entryFilePath = path.resolve(root, opts.entry.file);
      return generateEntryModule(entryFilePath, opts.entry.component);
    },

    async transform(code: string, id: string) {
      if (!isJalvinFile(id)) return null;

      const result = compile(code, id, {
        emitTypes: opts.emitTypes ?? false,
        runtimeImport: opts.runtimeImport ?? "@jalvin/runtime",
        sourceRoot: viteConfig?.root ?? process.cwd(),
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

      // The compiled output is TSX with JSX syntax. We need to transform
      // JSX → JS here because Vite's React plugin only handles .tsx/.jsx files.
      // Use a dynamic import to work around vite's deprecated CJS type stub.
      const { transformWithEsbuild } = await (import("vite") as Promise<any>);
      const tsxResult = await transformWithEsbuild(result.code, id + ".tsx", {
        jsx: "automatic",
        loader: "tsx",
        target: "esnext",
      });

      return {
        code: tsxResult.code,
        map: tsxResult.map,
      };
    },

    configureServer(server: any) {
      if (!opts.entry) return;
      // Return a post-hook (runs after Vite's own middlewares).
      // When no static index.html exists, Vite passes requests for "/" through,
      // so this middleware catches them and serves the generated HTML.
      return () => {
        server.middlewares.use(async (req: any, res: any, next: () => void) => {
          const url: string = req.url ?? "/";
          if (url !== "/" && url !== "/index.html") {
            next();
            return;
          }
          const root: string = viteConfig?.root ?? process.cwd();
          // If a static index.html already exists, let Vite handle it normally.
          if (fs.existsSync(path.join(root, "index.html"))) {
            next();
            return;
          }
          const title = opts.entry!.title ?? "Jalvin App";
          const html = generateIndexHtml(title, `/@id/${VIRTUAL_ENTRY}`);
          const transformed: string = await server.transformIndexHtml(url, html);
          res.setHeader("Content-Type", "text/html");
          res.end(transformed);
        });
      };
    },

    generateBundle(_: any, bundle: Record<string, any>) {
      if (!opts.entry) return;
      // Find the entry chunk to reference in the emitted HTML.
      const entryChunk = Object.values(bundle).find(
        (c: any) => c.type === "chunk" && c.isEntry
      ) as any | undefined;
      const scriptSrc = entryChunk ? `./${entryChunk.fileName}` : `./${VIRTUAL_ENTRY}`;
      const title = opts.entry.title ?? "Jalvin App";
      const html = generateIndexHtml(title, scriptSrc);
      this.emitFile({ type: "asset", fileName: "index.html", source: html });
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
