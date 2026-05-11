// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Router — Compose Navigation-style declarative routing
//
// API mirrors Jetpack Compose Navigation:
//   val nav = rememberNavController()
//   NavHost(navController = nav, startDestination = "home") { graph ->
//     graph.composable("home") { HomeScreen(navController = nav) }
//     graph.composable("profile/{userId}") { entry ->
//       ProfileScreen(userId = entry.arguments["userId"])
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { MutableStateFlow, type StateFlow } from "./stateflow.js";
import { remember, collectAsState } from "./ui.js";
import type { VNode } from "./dom.js";
import { jalvinCreateElement } from "./dom.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Information about the currently active destination in the back stack. */
export interface BackStackEntry {
  /** The matched route pattern, e.g. "profile/{userId}" */
  route: string;
  /** The actual navigated path, e.g. "profile/42" */
  destination: string;
  /** Path parameters extracted from the pattern, e.g. { userId: "42" } */
  arguments: Record<string, string>;
}

/** Options passed to NavController.navigate(). */
export interface NavOptions {
  /** Pop back stack until this route pattern is reached before pushing the new destination. */
  popUpTo?: string;
  /** Whether to also pop the popUpTo destination itself. Default false. */
  popUpToInclusive?: boolean;
  /** Skip pushing if the current destination is already this route. Default false. */
  launchSingleTop?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal route compilation
// ─────────────────────────────────────────────────────────────────────────────

interface CompiledRoute {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  content: (entry: BackStackEntry) => VNode;
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  // Split on {paramName} to alternate between literal segments and param slots
  const parts = pattern.split(/\{(\w+)\}/);
  let regexStr = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Literal segment — escape regex metacharacters
      regexStr += (parts[i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      // Param slot — capture any non-slash sequence
      paramNames.push(parts[i] ?? "");
      regexStr += "([^/]+)";
    }
  }
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function matchRoute(routes: CompiledRoute[], destination: string): BackStackEntry | null {
  for (const route of routes) {
    const match = destination.match(route.regex);
    if (match) {
      const args: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        args[name] = decodeURIComponent(match[i + 1] ?? "");
      });
      return { route: route.pattern, destination, arguments: args };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NavGraphBuilder — the DSL block inside NavHost { graph -> ... }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects route definitions registered by composable() calls.
 * Passed as the argument to the NavHost trailing-block lambda.
 */
export class NavGraphBuilder {
  /** @internal */
  readonly _routes: CompiledRoute[] = [];

  /**
   * Register a route destination.
   *
   * @param pattern  Route pattern with optional {param} placeholders,
   *                 e.g. "home", "profile/{userId}", "post/{id}/comments".
   * @param content  Composable that renders this destination.
   *                 Receives the BackStackEntry so it can read route arguments.
   */
  composable(pattern: string, content: (entry: BackStackEntry) => VNode): void {
    const { regex, paramNames } = compilePattern(pattern);
    this._routes.push({ pattern, regex, paramNames, content });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash-based URL helpers
// ─────────────────────────────────────────────────────────────────────────────

function getHashDestination(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash;
  if (hash.startsWith("#/")) return hash.slice(2);
  if (hash.startsWith("#")) return hash.slice(1);
  return "";
}

function setHashDestination(destination: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = destination ? "#/" + destination : "#/";
}

// ─────────────────────────────────────────────────────────────────────────────
// NavController
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the navigation back stack and drives route transitions.
 *
 * Create one via rememberNavController() and pass it to NavHost.
 * Then thread it to screens that need to trigger navigation.
 */
export class NavController {
  private readonly _backStack = new MutableStateFlow<BackStackEntry[]>([]);

  /** The top-most entry in the back stack, or null before the first navigation. */
  readonly currentBackStackEntry: StateFlow<BackStackEntry | null>;

  // The resolver is updated by NavHost on every render so it always reflects
  // the current route table (in case routes are defined dynamically).
  private _resolver: ((destination: string) => BackStackEntry) | null = null;

  constructor() {
    const currentFlow = new MutableStateFlow<BackStackEntry | null>(null);
    this.currentBackStackEntry = currentFlow;

    // Derive currentBackStackEntry from the back stack top
    this._backStack.collect((stack) => {
      currentFlow.value = stack.length > 0 ? (stack[stack.length - 1] ?? null) : null;
    });

    // Sync with browser back/forward buttons
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", () => {
        this._navigateTo(getHashDestination());
      });
    }
  }

  // Resolves a destination string → BackStackEntry and pushes it, unless
  // we're already there.
  private _navigateTo(destination: string): void {
    if (!this._resolver) return;
    const current = this.currentBackStackEntry.value;
    if (current?.destination === destination) return;
    const entry = this._resolver(destination);
    this._backStack.update((s) => [...s, entry]);
  }

  /** @internal — NavHost sets this on every render. */
  _setResolver(resolver: (destination: string) => BackStackEntry): void {
    this._resolver = resolver;
  }

  /** @internal — NavHost calls this once on mount to seed the initial destination. */
  _initFromHash(startDestination: string): void {
    const initial = getHashDestination() || startDestination;
    this._navigateTo(initial);
  }

  private _popTo(routePattern: string, inclusive: boolean): void {
    this._backStack.update((stack) => {
      // Find the last occurrence of the pattern in the stack
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.route === routePattern) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return stack;
      return inclusive ? stack.slice(0, idx) : stack.slice(0, idx + 1);
    });
  }

  /**
   * Navigate to a destination.
   *
   * @param destination  The literal path to navigate to, e.g. "profile/42".
   *                     This is the *destination* string, not the route pattern.
   */
  navigate(destination: string, options?: NavOptions): void {
    if (options?.popUpTo !== undefined) {
      this._popTo(options.popUpTo, options.popUpToInclusive ?? false);
    }

    if (
      options?.launchSingleTop &&
      this.currentBackStackEntry.value?.destination === destination
    ) {
      return;
    }

    const prevHash = getHashDestination();
    setHashDestination(destination);

    // If the hash was already at this destination, hashchange won't fire,
    // so we push directly.
    if (prevHash === destination) {
      this._navigateTo(destination);
    }
  }

  /**
   * Pop the current destination off the back stack (the system back action).
   * Returns true if navigation happened, false if the stack had only one entry.
   */
  popBackStack(): boolean {
    const stack = this._backStack.value;
    if (stack.length <= 1) return false;

    const prev = stack[stack.length - 2]!;
    this._backStack.update((s) => s.slice(0, -1));
    setHashDestination(prev.destination);
    return true;
  }

  /** Returns true if there is a previous destination to pop to. */
  canPopBackStack(): boolean {
    return this._backStack.value.length > 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// rememberNavController
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a NavController and remembers it across recompositions.
 * Call this at the root of your component tree.
 */
export function rememberNavController(): NavController {
  return remember(() => new NavController());
}

// ─────────────────────────────────────────────────────────────────────────────
// NavHost
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The root navigation composable. Renders whichever route matches the current
 * destination in the NavController's back stack.
 *
 * The children block receives a NavGraphBuilder and should call
 * graph.composable() to register each destination:
 *
 *   NavHost(navController = nav, startDestination = "home") { graph ->
 *     graph.composable("home") { HomeScreen(navController = nav) }
 *     graph.composable("profile/{userId}") { entry ->
 *       ProfileScreen(userId = entry.arguments["userId"], navController = nav)
 *     }
 *   }
 *
 * In compiled TypeScript the children array will contain a single function
 * (graph: NavGraphBuilder) => void that populates the builder.
 */
export function NavHost(
  props: { navController: NavController; startDestination: string },
  children?: Array<((builder: NavGraphBuilder) => void) | any>
): VNode {
  const { navController, startDestination } = props;

  // Build the route table by running the DSL block
  const graph = new NavGraphBuilder();
  if (children) {
    for (const child of children) {
      if (typeof child === "function") child(graph);
    }
  }
  const routes = graph._routes;

  // Resolver: maps a raw destination string to a BackStackEntry using the route table.
  // Falls back to a synthetic entry (triggers 404 render) if no pattern matches.
  const resolve = (destination: string): BackStackEntry =>
    matchRoute(routes, destination) ?? {
      route: destination,
      destination,
      arguments: {},
    };

  // Keep the resolver current so hashchange events always use the latest routes.
  navController._setResolver(resolve);

  // Seed the initial destination once on mount.
  remember(() => {
    navController._initFromHash(startDestination);
    return true;
  }, [navController, startDestination]);

  // Subscribe to route changes — this re-renders NavHost when destination changes.
  const current = collectAsState(navController.currentBackStackEntry);

  if (!current) {
    // Still initializing; render nothing.
    return jalvinCreateElement("div", { style: { display: "none" } });
  }

  const matched = routes.find((r) => r.pattern === current.route);
  if (matched) {
    return matched.content(current);
  }

  // No route matched — render a 404 placeholder.
  return jalvinCreateElement(
    "div",
    { style: { padding: "16px", color: "#c00", fontFamily: "monospace" } },
    `404 — no route matched "${current.destination}"`
  );
}
