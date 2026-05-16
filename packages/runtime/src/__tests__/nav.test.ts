import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NavController, NavGraphBuilder } from "../nav.js";

// Minimal route setup helper
function makeController(): NavController {
  const ctrl = new NavController();
  const builder = new NavGraphBuilder();
  builder.composable("home", () => ({ tag: "div", props: {}, children: [] }));
  builder.composable("profile/{id}", () => ({ tag: "div", props: {}, children: [] }));
  builder.composable("settings", () => ({ tag: "div", props: {}, children: [] }));
  ctrl._setResolver((dest) => {
    for (const r of builder._routes) {
      const m = r.regex.exec(dest);
      if (m) {
        const args: Record<string, string> = {};
        for (let i = 0; i < r.paramNames.length; i++) args[r.paramNames[i]!] = m[i + 1]!;
        return { route: r.pattern, destination: dest, arguments: args };
      }
    }
    return null;
  });
  return ctrl;
}

// ── Fix #27: hashchange listener is removed on dispose() ─────────────────────
describe("NavController.dispose() — removes hashchange listener (fix #27)", () => {
  beforeEach(() => {
    // Mock window.addEventListener / removeEventListener
    vi.spyOn(window, "addEventListener");
    vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls window.removeEventListener('hashchange', ...) on dispose()", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    expect(window.addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));

    ctrl.dispose();

    expect(window.removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
  });

  it("does not add a second listener if _initFromHash is called twice", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");
    ctrl._initFromHash("home"); // second call must first remove old listener

    // Should have removed the first listener before adding the replacement
    expect(window.removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));

    ctrl.dispose();
  });

  it("dispose() is idempotent — second call does not throw", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");
    expect(() => { ctrl.dispose(); ctrl.dispose(); }).not.toThrow();
  });

  it("hashChangeHandler is null after dispose()", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");
    ctrl.dispose();
    // The internal handler should be cleared so no stale references remain
    expect((ctrl as any)._hashChangeHandler).toBeNull();
  });
});

// ── Fix #28: navigate() does not double-push to backstack ────────────────────
describe("NavController.navigate() — no double-push (fix #28)", () => {
  beforeEach(() => {
    // Reset location to a plain path so window.location.hash is "" and
    // _initFromHash falls through to its startDestination parameter.
    history.pushState(null, "", "/");
  });

  it("navigate() pushes exactly one entry to the back stack", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    // back stack now: [home]
    expect((ctrl as any)._backStack).toHaveLength(1);

    ctrl.navigate("settings");

    // back stack must be: [home, settings] — not [home, settings, settings]
    expect((ctrl as any)._backStack).toHaveLength(2);
    expect((ctrl as any)._backStack[1].destination).toBe("settings");
  });

  it("currentBackStackEntry reflects the navigated destination", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    ctrl.navigate("settings");

    expect(ctrl.currentBackStackEntry.value?.destination).toBe("settings");
  });

  it("multiple navigations produce the correct stack", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    ctrl.navigate("settings");
    ctrl.navigate("profile/42");

    const stack: string[] = (ctrl as any)._backStack.map((e: any) => e.destination);
    expect(stack).toEqual(["home", "settings", "profile/42"]);
  });

  it("launchSingleTop prevents duplicate top-of-stack entries", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    ctrl.navigate("settings");
    ctrl.navigate("settings", { launchSingleTop: true }); // should be a no-op

    expect((ctrl as any)._backStack).toHaveLength(2);
  });

  it("popBackStack works correctly after navigate()", () => {
    const ctrl = makeController();
    ctrl._initFromHash("home");

    ctrl.navigate("settings");
    expect(ctrl.canPopBackStack()).toBe(true);

    ctrl.popBackStack();
    expect(ctrl.currentBackStackEntry.value?.destination).toBe("home");
    expect((ctrl as any)._backStack).toHaveLength(1);
  });
});
