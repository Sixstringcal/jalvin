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
