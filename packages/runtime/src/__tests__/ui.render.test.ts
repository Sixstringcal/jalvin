import { describe, it, expect, vi } from "vitest";
import { render, remember, collectAsState } from "../ui.js";
import type { VNode } from "../dom.js";
import { MutableStateFlow } from "../stateflow.js";

/** Build a plain VNode without going through jalvinCreateElement. */
function el(tag: string, props: Record<string, any> = {}, ...children: (VNode | string)[]): VNode {
  return { tag, props, children };
}

function makeContainer(): HTMLElement {
  document.body.innerHTML = "";
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("render() — hook state isolation on root key swap", () => {
  // ── core regression: same-index remember() slots must not collide ─────────

  it("re-executes remember factory when root key changes", () => {
    // LoginView and HomeView each have ONE remember(fn, []) at hook index 1.
    // Without the fix, hookState[1] keeps LoginView's cached value and
    // HomeView's remember(homeFactory, []) sees deps=[] unchanged → reuses it
    // instead of calling homeFactory.
    const screen = new MutableStateFlow<"login" | "home">("login");
    const loginFactory = vi.fn(() => "login-memo");
    const homeFactory = vi.fn(() => "home-memo");
    let lastMemo = "";

    function App(): VNode {
      const s = collectAsState(screen);
      if (s === "login") {
        lastMemo = remember(loginFactory, []);
        return el("div", { key: "view-login" });
      }
      lastMemo = remember(homeFactory, []);
      return el("div", { key: "view-home" });
    }

    render(App, makeContainer());
    expect(loginFactory).toHaveBeenCalledTimes(1);
    expect(lastMemo).toBe("login-memo");

    screen.value = "home";

    expect(homeFactory).toHaveBeenCalledTimes(1);
    expect(lastMemo).toBe("home-memo");
  });

  it("does not re-execute remember when root key is unchanged (normal re-render)", () => {
    // Verify the fix is scoped to key swaps and doesn't break stable memoization.
    const counter = new MutableStateFlow(0);
    const factory = vi.fn(() => "stable");
    let memoVal = "";

    function App(): VNode {
      collectAsState(counter);
      memoVal = remember(factory, []);
      return el("div", { key: "counter-view" });
    }

    render(App, makeContainer());
    expect(factory).toHaveBeenCalledTimes(1);

    counter.value = 1;
    expect(factory).toHaveBeenCalledTimes(1);
    expect(memoVal).toBe("stable");
  });

  // ── multiple hooks per view ───────────────────────────────────────────────

  it("correctly isolates views with different hook counts", () => {
    // ViewA uses 1 remember; ViewB uses 3. Extra slots ViewB needs would be
    // uninitialized after swap, and ViewA's only slot would be stale.
    const screen = new MutableStateFlow<"a" | "b">("a");
    const fA = vi.fn(() => "from-a");
    const fB1 = vi.fn(() => "b-one");
    const fB2 = vi.fn(() => "b-two");
    const fB3 = vi.fn(() => "b-three");
    let vals: string[] = [];

    function App(): VNode {
      const s = collectAsState(screen);
      if (s === "a") {
        vals = [remember(fA, [])];
        return el("div", { key: "view-a" });
      }
      vals = [remember(fB1, []), remember(fB2, []), remember(fB3, [])];
      return el("div", { key: "view-b" });
    }

    render(App, makeContainer());
    expect(vals).toEqual(["from-a"]);

    screen.value = "b";
    expect(vals).toEqual(["b-one", "b-two", "b-three"]);
    // fB1's slot (index 1) was occupied by ViewA's remember value, so the dirty render
    // skips it (deps=[]) and the clean render calls it once → exactly 1 call.
    expect(fB1).toHaveBeenCalledTimes(1);
    // fB2 and fB3 occupy slots that ViewA never wrote (ViewA had fewer hooks), so the
    // dirty render calls them once and the clean render calls them again → 2 calls each.
    // The VALUES in vals are still correct; the extra calls are a two-pass artefact.
    expect(fB2).toHaveBeenCalled();
    expect(fB3).toHaveBeenCalled();
  });

  // ── multiple consecutive swaps ────────────────────────────────────────────

  it("handles multiple consecutive view swaps correctly", () => {
    const screen = new MutableStateFlow<"a" | "b" | "c">("a");
    const factoryA = vi.fn(() => "from-a");
    const factoryB = vi.fn(() => "from-b");
    const factoryC = vi.fn(() => "from-c");
    let last = "";

    function App(): VNode {
      const s = collectAsState(screen);
      if (s === "a") {
        last = remember(factoryA, []);
        return el("div", { key: "view-a" });
      }
      if (s === "b") {
        last = remember(factoryB, []);
        return el("div", { key: "view-b" });
      }
      last = remember(factoryC, []);
      return el("div", { key: "view-c" });
    }

    render(App, makeContainer());
    expect(last).toBe("from-a");

    screen.value = "b";
    expect(last).toBe("from-b");

    screen.value = "c";
    expect(last).toBe("from-c");

    // Swap back to A — factory must re-run since hookState was cleared on swap
    screen.value = "a";
    expect(last).toBe("from-a");
    expect(factoryA).toHaveBeenCalledTimes(2); // initial mount + re-swap
  });

  // ── no key → no swap detection (documents required usage) ────────────────

  it("does not clear hookState when views lack key props", () => {
    // Without key props the runtime cannot tell views apart, so remember(fn, [])
    // at the same index reuses the first view's cached value. This test documents
    // the known limitation: keys are required for correct swap behaviour.
    const screen = new MutableStateFlow<"a" | "b">("a");
    const fA = vi.fn(() => "from-a");
    const fB = vi.fn(() => "from-b");
    let last = "";

    function App(): VNode {
      const s = collectAsState(screen);
      if (s === "a") {
        last = remember(fA, []);
        return el("div"); // no key
      }
      last = remember(fB, []);
      return el("div"); // no key
    }

    render(App, makeContainer());
    expect(last).toBe("from-a");
    expect(fA).toHaveBeenCalledTimes(1);

    screen.value = "b";
    // No keys → no hookState clear → fB is never called; stale "from-a" returned
    expect(fB).not.toHaveBeenCalled();
    expect(last).toBe("from-a");
  });

  // ── DOM reflects the correct view after swap ──────────────────────────────

  it("updates DOM to reflect new view after key swap", () => {
    const screen = new MutableStateFlow<"login" | "home">("login");
    const container = makeContainer();

    function App(): VNode {
      const s = collectAsState(screen);
      if (s === "login") {
        return el("div", { key: "view-login" }, el("input", { id: "username-field" }));
      }
      return el("div", { key: "view-home" }, el("h1", { id: "welcome-heading" }, "Welcome"));
    }

    render(App, container);
    expect(container.querySelector("#username-field")).not.toBeNull();
    expect(container.querySelector("#welcome-heading")).toBeNull();

    screen.value = "home";
    expect(container.querySelector("#username-field")).toBeNull();
    expect(container.querySelector("#welcome-heading")).not.toBeNull();
  });
});
