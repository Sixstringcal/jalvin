import React from "react";
import { Modifier } from "./modifier.js";

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

/** Card container — analogous to Compose's Card / ElevatedCard. */
export function Card(
  {
    modifier,
    onClick,
    elevation = 1,
    outlined = false,
  }: CardProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
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
  }, ...(children ?? []));
}

export interface ScaffoldProps {
  topBar?: React.ReactNode;
  bottomBar?: React.ReactNode;
  floatingActionButton?: React.ReactNode;
  modifier?: Modifier;
}

/**
 * Full-page layout scaffold — analogous to Compose's Scaffold.
 * Stacks topBar, scrollable content, and bottomBar.
 */
export function Scaffold(
  {
    topBar,
    bottomBar,
    floatingActionButton,
    modifier,
  }: ScaffoldProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      position: "relative",
      ...modProps.style,
    },
  },
    topBar,
    React.createElement("main", {
      style: { flex: 1, overflow: "auto" },
    }, ...(children ?? [])),
    bottomBar,
    floatingActionButton && React.createElement("div", {
      style: { position: "absolute", bottom: "16px", right: "16px" },
    }, floatingActionButton),
  );
}

export interface TopBarProps {
  title: string | React.ReactNode;
  navigationIcon?: React.ReactNode;
  actions?: React.ReactNode;
  modifier?: Modifier;
}

/** App top bar — analogous to Compose's TopAppBar. */
export function TopBar({
  title,
  navigationIcon,
  actions,
  modifier,
}: TopBarProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("header", {
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
  },
    navigationIcon,
    React.createElement("span", {
      style: { flex: 1, fontSize: "1.375rem", fontWeight: 500 },
    }, title),
    actions,
  );
}
