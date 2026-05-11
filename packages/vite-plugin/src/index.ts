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
  /** Name of the component to mount as the DOM root. */
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
   * When set, the plugin generates a virtual index.html and entry point
   * so no hand-written index.html or main.ts is needed in the project.
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
      *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      html, body { height: 100%; margin: 0; overflow-x: hidden; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #fafafa;
        color: #1c1c1c;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      #root { height: 100%; }
      button { touch-action: manipulation; }
      input, textarea, select { font-size: 1rem; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
}

function generateEntryModule(entryFilePath: string, component: string, runtimeImport: string): string {
  const buildId = Date.now();
  return [
    `console.log("JALVIN APP-ENTRY LOADED - BUILD ${buildId}");`,
    `// React Trap`,
    `window.React = {`,
    `  createElement: (type, props, ...children) => {`,
    `    console.error("[TRAP] React.createElement called for:", type, "Props:", props);`,
    `    console.trace();`,
    `    // If it's one of our components, just call it directly to bypass the React wrapper`,
    `    if (typeof type === "function") return type(props, children);`,
    `    return { $$typeof: Symbol.for("react.transitional.element"), type, props, children };`,
    `  }`,
    `};`,
    `import { render } from ${JSON.stringify(runtimeImport)};`,
    `const rootEl = document.getElementById("root");`,
    `if (!rootEl) throw new Error("Missing #root element");`,
    ``,
    `function showError(err) {`,
    `  rootEl.innerHTML = "";`,
    `  const container = document.createElement("div");`,
    `  container.style.fontFamily = "monospace";`,
    `  container.style.padding = "32px";`,
    `  container.style.background = "#1a1a1a";`,
    `  container.style.color = "#ff6b6b";`,
    `  container.style.minHeight = "100vh";`,
    `  container.style.boxSizing = "border-box";`,
    ``,
    `  const heading = document.createElement("h2");`,
    `  heading.style.margin = "0 0 16px";`,
    `  heading.style.fontSize = "18px";`,
    `  heading.style.color = "#ff4444";`,
    `  heading.innerText = "\u26a0\ufe0f Jalvin App Error";`,
    `  container.appendChild(heading);`,
    ``,
    `  const pre = document.createElement("pre");`,
    `  pre.style.whiteSpace = "pre-wrap";`,
    `  pre.style.wordBreak = "break-word";`,
    `  pre.style.background = "#111";`,
    `  pre.style.padding = "16px";`,
    `  pre.style.borderRadius = "6px";`,
    `  pre.style.color = "#ff9898";`,
    `  pre.style.fontSize = "13px";`,
    `  pre.innerText = String(err?.stack ?? err);`,
    `  container.appendChild(pre);`,
    ``,
    `  rootEl.appendChild(container);`,
    `}`,
    ``,
    `window.addEventListener('unhandledrejection', e => showError(e.reason));`,
    `window.addEventListener('error', e => showError(e.error ?? e.message));`,
    ``,
    `try {`,
    `  const mod = await import(${JSON.stringify(entryFilePath)});`,
    `  const App = mod.${component};`,
    `  if (typeof App !== "function") throw new Error("Component ${component} not found in " + ${JSON.stringify(entryFilePath)});`,
    `  console.log("JALVIN MOUNTING ROOT COMPONENT:", App.name);`,
    `  render(App, rootEl);`,
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
      cfg.optimizeDeps = cfg.optimizeDeps ?? {};
      cfg.optimizeDeps.exclude = cfg.optimizeDeps.exclude ?? [];
      if (!cfg.optimizeDeps.exclude.includes("@jalvin/runtime")) cfg.optimizeDeps.exclude.push("@jalvin/runtime");
      if (!cfg.optimizeDeps.exclude.includes("@jalvin/ui")) cfg.optimizeDeps.exclude.push("@jalvin/ui");

      cfg.esbuild = cfg.esbuild ?? {};
      cfg.esbuild.jsxFactory = "jalvinCreateElement";
      cfg.esbuild.jsxFragment = "Fragment";

      // Force a single runtime instance across all symlinked packages.
      // Without this, @jalvin/ui (symlinked into the monorepo) resolves
      // @jalvin/runtime from its own node_modules and gets a separate copy,
      // splitting the render loop's activeSubscriber from the hook state.
      cfg.resolve = cfg.resolve ?? {};
      cfg.resolve.dedupe = cfg.resolve.dedupe ?? [];
      for (const pkg of ["@jalvin/runtime", "@jalvin/ui"]) {
        if (!cfg.resolve.dedupe.includes(pkg)) cfg.resolve.dedupe.push(pkg);
      }

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
      const runtimeImport = opts.runtimeImport ?? "@jalvin/runtime";
      return generateEntryModule(entryFilePath, opts.entry.component, runtimeImport);
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

      for (const diag of result.diagnostics.items) {
        if (diag.severity === "warning") {
          this.warn({
            message: diag.message,
            id,
          });
        }
      }

      const { transformWithEsbuild } = await (import("vite") as Promise<any>);
      const tsResult = await transformWithEsbuild(result.code, id + ".ts", {
        loader: "ts",
        target: "esnext",
        jsx: "preserve",
      });

      return {
        code: tsResult.code,
        map: tsResult.map,
      };
    },

    configureServer(server: any) {
      if (!opts.entry) return;
      return () => {
        server.middlewares.use(async (req: any, res: any, next: () => void) => {
          const url: string = req.url ?? "/";
          if (url !== "/" && url !== "/index.html") {
            next();
            return;
          }
          const root: string = viteConfig?.root ?? process.cwd();
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
      server.ws.send({ type: "full-reload", path: file });
      return [];
    },
  };
}

export default jalvin;
