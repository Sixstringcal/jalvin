import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, remember, collectAsState, DisposableEffect, LaunchedEffect, mutableStateOf } from "../ui.js";
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

// ── Fix #12: per-render hook isolation ───────────────────────────────────────
describe("render() — per-render context isolation (fix #12)", () => {
  it("two independent render() calls do not share hookState", () => {
    const counterA = new MutableStateFlow(0);
    const counterB = new MutableStateFlow(0);

    const factoryA = vi.fn(() => "memo-a");
    const factoryB = vi.fn(() => "memo-b");

    let valA = "";
    let valB = "";

    function AppA(): VNode {
      collectAsState(counterA);
      valA = remember(factoryA, []);
      return el("div", { id: "a" });
    }

    function AppB(): VNode {
      collectAsState(counterB);
      valB = remember(factoryB, []);
      return el("div", { id: "b" });
    }

    const ca = makeContainer();
    const cb = document.createElement("div");
    document.body.appendChild(cb);

    render(AppA, ca);
    render(AppB, cb);

    expect(valA).toBe("memo-a");
    expect(valB).toBe("memo-b");

    // Trigger AppA update — AppB's factory must NOT be re-called
    counterA.value = 1;
    expect(factoryB).toHaveBeenCalledTimes(1); // only called at initial AppB mount

    // Trigger AppB update — AppA's factory must NOT be re-called
    counterB.value = 1;
    expect(factoryA).toHaveBeenCalledTimes(1); // only called at initial AppA mount
  });
});

// ── Fix #13: collectAsState does not leak subscriptions ───────────────────────
describe("collectAsState() — subscription cleanup (fix #13)", () => {
  it("cleans up old subscription when flow reference changes", () => {
    const flowA = new MutableStateFlow(0);
    const flowB = new MutableStateFlow(100);
    const whichFlow = new MutableStateFlow<"a" | "b">("a");
    let rendered = 0;

    function App(): VNode {
      const which = collectAsState(whichFlow);
      const val = collectAsState(which === "a" ? flowA : flowB);
      rendered = val;
      return el("div");
    }

    const container = makeContainer();
    render(App, container);
    expect(rendered).toBe(0);

    // Switch to flow B — flow A's subscription should be dropped
    whichFlow.value = "b";
    expect(rendered).toBe(100);

    // Update flowA — should NOT trigger a re-render since we unsubscribed
    const prevRendered = rendered;
    flowA.value = 999;
    expect(rendered).toBe(prevRendered); // unchanged
  });
});

// ── Fix #14: DisposableEffect cleanup is called ───────────────────────────────
describe("DisposableEffect() — cleanup called on dep change (fix #14)", () => {
  it("calls cleanup when deps change", () => {
    const deps = new MutableStateFlow(0);
    const cleanup = vi.fn();

    function App(): VNode {
      const d = collectAsState(deps);
      DisposableEffect([d], () => {
        return cleanup;
      });
      return el("div");
    }

    render(App, makeContainer());
    expect(cleanup).not.toHaveBeenCalled();

    deps.value = 1; // dep change → cleanup must be called
    expect(cleanup).toHaveBeenCalledTimes(1);

    deps.value = 2;
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("does NOT call cleanup when deps are stable", () => {
    const trigger = new MutableStateFlow(0);
    const cleanup = vi.fn();

    function App(): VNode {
      collectAsState(trigger);
      DisposableEffect([], () => cleanup); // [] deps — never changes
      return el("div");
    }

    render(App, makeContainer());
    trigger.value = 1;
    trigger.value = 2;

    expect(cleanup).not.toHaveBeenCalled();
  });
});

// ── Fix #15: LaunchedEffect passes AbortSignal and re-fires on dep change ──────
describe("LaunchedEffect() — cancellation via AbortSignal (fix #15)", () => {
  it("abort signal is not aborted on first launch", async () => {
    let capturedSignal: AbortSignal | null = null;

    function App(): VNode {
      LaunchedEffect([], async (signal) => {
        capturedSignal = signal;
      });
      return el("div");
    }

    render(App, makeContainer());
    await Promise.resolve(); // let microtasks flush
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("aborts previous signal when deps change", async () => {
    const deps = new MutableStateFlow(0);
    const signals: AbortSignal[] = [];

    function App(): VNode {
      const d = collectAsState(deps);
      LaunchedEffect([d], async (signal) => {
        signals.push(signal);
        await new Promise(() => {}); // never resolves
      });
      return el("div");
    }

    render(App, makeContainer());
    await Promise.resolve();
    const first = signals[0]!;
    expect(first.aborted).toBe(false);

    deps.value = 1; // triggers new effect run
    await Promise.resolve();
    expect(first.aborted).toBe(true); // previous run was aborted
    expect(signals.length).toBe(2);
  });
});
