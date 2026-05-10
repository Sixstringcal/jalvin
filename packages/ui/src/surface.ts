import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

export interface CardProps {
  modifier?: Modifier;
  onClick?: () => void;
  /** Shadow depth 0–3 */
  elevation?: 0 | 1 | 2 | 3;
  outlined?: boolean;
}

const SHADOWS = [
  "none",
  "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
  "0 3px 6px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.09)",
  "0 10px 20px rgba(0,0,0,0.12), 0 3px 6px rgba(0,0,0,0.09)",
] as const;

/** Card container. */
export function Card(
  {
    modifier,
    onClick,
    elevation = 1,
    outlined = false,
  }: CardProps,
  children?: Node[]
): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  return jalvinCreateElement("div", {
    ...modProps,
    onClick,
    role: onClick ? "button" : undefined,
    tabIndex: onClick ? 0 : undefined,
    style: {
      backgroundColor: "#ffffff",
      borderRadius: "12px",
      padding: "16px",
      boxShadow: SHADOWS[elevation],
      border: outlined ? "1px solid #e7e7e7" : "none",
      cursor: onClick ? "pointer" : "default",
      ...modProps.style,
    },
  }, children ?? []);
}

export interface ScaffoldProps {
  topBar?: Node;
  bottomBar?: Node;
  floatingActionButton?: Node;
  modifier?: Modifier;
}

/**
 * Full-page layout scaffold. Stacks topBar, scrollable content, and bottomBar.
 */
export function Scaffold(
  {
    topBar,
    bottomBar,
    floatingActionButton,
    modifier,
  }: ScaffoldProps,
  children?: Node[]
): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  
  const main = jalvinCreateElement("main", {
    style: { flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch" },
  }, children ?? []);

  const scaffoldChildren: Node[] = [];
  if (topBar) scaffoldChildren.push(topBar);
  scaffoldChildren.push(main);
  if (bottomBar) scaffoldChildren.push(bottomBar);
  if (floatingActionButton) {
    scaffoldChildren.push(jalvinCreateElement("div", {
      style: { position: "absolute", bottom: "16px", right: "16px" },
    }, [floatingActionButton]));
  }

  return jalvinCreateElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      position: "relative",
      ...modProps.style,
    },
  }, scaffoldChildren);
}

export interface TopBarProps {
  title: string | Node;
  navigationIcon?: Node;
  actions?: Node;
  modifier?: Modifier;
}

/** App top bar. */
export function TopBar({
  title,
  navigationIcon,
  actions,
  modifier,
}: TopBarProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  
  const titleNode = typeof title === "string" ? document.createTextNode(title) : title;

  const barChildren: Node[] = [];
  if (navigationIcon) barChildren.push(navigationIcon);
  barChildren.push(jalvinCreateElement("span", {
    style: { flex: 1, fontSize: "1.375rem", fontWeight: 500 },
  }, [titleNode]));
  if (actions) barChildren.push(actions);

  return jalvinCreateElement("header", {
    ...modProps,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "0 16px",
      height: "56px",
      backgroundColor: "#ffffff",
      boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      flexShrink: 0,
      ...modProps.style,
    },
  }, barChildren);
}
