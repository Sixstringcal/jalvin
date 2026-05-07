import { describe, expect, it } from "vitest";
import { jalvin } from "../../dist/index.js";

describe("vite-plugin virtual entry", () => {
  it("uses one React root and never mutates #root via innerHTML", () => {
    const plugin = jalvin({
      entry: {
        file: "./UIShowcase.jalvin",
        component: "UIShowcase",
      },
    });

    plugin.configResolved?.({ root: "/tmp/jalvin-app" });

    const virtualId = plugin.resolveId?.("virtual:@jalvin/app-entry", undefined);
    expect(virtualId).toBe("\0virtual:@jalvin/app-entry");

    const generated = plugin.load?.(virtualId);
    expect(typeof generated).toBe("string");

    const entryModule = generated as string;
    expect(entryModule).toContain('const root = ReactDOM.createRoot(rootEl);');
    expect(entryModule).not.toContain("root.innerHTML");

    const createRootCalls = entryModule.match(/createRoot\(/g) ?? [];
    expect(createRootCalls).toHaveLength(1);
  });
});

describe("vite-plugin optimizeDeps config", () => {
  it("adds @jalvin/runtime to optimizeDeps.include", () => {
    const plugin = jalvin();
    const cfg: any = {};
    plugin.config?.(cfg, { command: "serve" });
    expect(cfg.optimizeDeps.include).toContain("@jalvin/runtime");
  });

  it("adds @jalvin/ui to optimizeDeps.exclude", () => {
    const plugin = jalvin();
    const cfg: any = {};
    plugin.config?.(cfg, { command: "serve" });
    expect(cfg.optimizeDeps.exclude).toContain("@jalvin/ui");
  });

  it("does not duplicate @jalvin/ui in exclude when already present", () => {
    const plugin = jalvin();
    const cfg: any = { optimizeDeps: { exclude: ["@jalvin/ui"] } };
    plugin.config?.(cfg, { command: "serve" });
    const count = cfg.optimizeDeps.exclude.filter((e: string) => e === "@jalvin/ui").length;
    expect(count).toBe(1);
  });

  it("does not duplicate @jalvin/runtime in include when already present", () => {
    const plugin = jalvin();
    const cfg: any = { optimizeDeps: { include: ["@jalvin/runtime"] } };
    plugin.config?.(cfg, { command: "serve" });
    const count = cfg.optimizeDeps.include.filter((e: string) => e === "@jalvin/runtime").length;
    expect(count).toBe(1);
  });

  it("preserves existing optimizeDeps entries", () => {
    const plugin = jalvin();
    const cfg: any = {
      optimizeDeps: { include: ["some-lib"], exclude: ["another-lib"] },
    };
    plugin.config?.(cfg, { command: "serve" });
    expect(cfg.optimizeDeps.include).toContain("some-lib");
    expect(cfg.optimizeDeps.exclude).toContain("another-lib");
  });
});
