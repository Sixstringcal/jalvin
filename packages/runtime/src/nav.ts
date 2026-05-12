// Jalvin Nav — Compose Navigation-style router (hash-based)

import { MutableStateFlow } from "./stateflow.js";
import type { StateFlow } from "./stateflow.js";
import { remember, collectAsState } from "./ui.js";
import type { VNode } from "./dom.js";

export interface BackStackEntry {
  /** Matched route pattern, e.g. "profile/{userId}" */
  route: string;
  /** Actual destination path, e.g. "profile/42" */
  destination: string;
  /** Extracted path parameters */
  arguments: Record<string, string>;
}

export interface NavOptions {
  /** Pop back stack up to (but not including) this route before navigating */
  popUpTo?: string;
  /** If true, also pop the popUpTo route itself */
  popUpToInclusive?: boolean;
  /** If true and already at destination, don't add a duplicate entry */
  launchSingleTop?: boolean;
}

interface CompiledRoute {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  content: (entry: BackStackEntry) => VNode;
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/\{(\w+)\}/g, (_, name: string) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function matchRoute(routes: CompiledRoute[], destination: string): BackStackEntry | null {
  for (const route of routes) {
    const m = route.regex.exec(destination);
    if (m) {
      const args: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        args[route.paramNames[i] ?? ""] = m[i + 1] ?? "";
      }
      return { route: route.pattern, destination, arguments: args };
    }
  }
  return null;
}

export class NavGraphBuilder {
  readonly _routes: CompiledRoute[] = [];

  composable(pattern: string, content: (entry: BackStackEntry) => VNode): void {
    const { regex, paramNames } = compilePattern(pattern);
    this._routes.push({ pattern, regex, paramNames, content });
  }
}

export class NavController {
  private readonly _backStack: BackStackEntry[] = [];
  private readonly _currentEntry: MutableStateFlow<BackStackEntry | null>;
  private _resolver: ((dest: string) => BackStackEntry | null) | null = null;

  constructor() {
    this._currentEntry = new MutableStateFlow<BackStackEntry | null>(null);
  }

  get currentBackStackEntry(): StateFlow<BackStackEntry | null> {
    return this._currentEntry;
  }

  _setResolver(resolver: (dest: string) => BackStackEntry | null): void {
    this._resolver = resolver;
  }

  _initFromHash(startDestination: string): void {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const dest = hash.startsWith("#/") ? hash.slice(2) : startDestination;
    this._navigateTo(dest);

    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", () => {
        const h = window.location.hash;
        const d = h.startsWith("#/") ? h.slice(2) : startDestination;
        this._navigateTo(d);
      });
    }
  }

  private _navigateTo(destination: string): void {
    const entry = this._resolver ? this._resolver(destination) : null;
    if (!entry) return;
    this._backStack.push(entry);
    this._currentEntry.value = entry;
  }

  navigate(destination: string, options?: NavOptions): void {
    if (options?.launchSingleTop && this._currentEntry.value?.destination === destination) {
      return;
    }

    if (options?.popUpTo) {
      const targetRoute = options.popUpTo;
      let idx = this._backStack.length - 1;
      while (idx >= 0) {
        const e = this._backStack[idx];
        if (e && e.route === targetRoute) break;
        idx--;
      }
      if (idx >= 0) {
        const removeFrom = options.popUpToInclusive ? idx : idx + 1;
        this._backStack.splice(removeFrom);
      }
    }

    if (typeof window !== "undefined") {
      window.location.hash = `#/${destination}`;
    } else {
      this._navigateTo(destination);
    }
  }

  popBackStack(): boolean {
    if (this._backStack.length <= 1) return false;
    this._backStack.pop();
    const prev = this._backStack[this._backStack.length - 1] ?? null;
    this._currentEntry.value = prev;
    if (prev && typeof window !== "undefined") {
      // replaceState does not fire hashchange, so no re-push into _backStack
      history.replaceState(null, "", `#/${prev.destination}`);
    }
    return true;
  }

  canPopBackStack(): boolean {
    return this._backStack.length > 1;
  }
}

export function rememberNavController(): NavController {
  return remember(() => new NavController());
}

export function NavHost(
  props: { navController: NavController; startDestination: string },
  children?: Array<((builder: NavGraphBuilder) => void) | any>
): VNode {
  const { navController, startDestination } = props;

  const builder = remember(() => {
    const b = new NavGraphBuilder();
    if (children) {
      for (const child of children) {
        if (typeof child === "function") child(b);
      }
    }
    return b;
  });

  remember(() => {
    navController._setResolver((dest) => matchRoute(builder._routes, dest));
    navController._initFromHash(startDestination);
    return true;
  });

  const entry = collectAsState(navController.currentBackStackEntry);

  if (!entry) {
    return { tag: "div", props: {}, children: [] };
  }

  for (const route of builder._routes) {
    if (route.regex.test(entry.destination)) {
      return route.content(entry);
    }
  }

  return { tag: "div", props: {}, children: [] };
}
