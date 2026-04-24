import React from "react";
import { Modifier } from "./modifier.js";

export type Alignment = "start" | "center" | "end" | "stretch";
export type Arrangement = "start" | "center" | "end" | "spaceBetween" | "spaceAround" | "spaceEvenly";

function arrangementToJustify(a: Arrangement): string {
  switch (a) {
    case "start":        return "flex-start";
    case "center":       return "center";
    case "end":          return "flex-end";
    case "spaceBetween": return "space-between";
    case "spaceAround":  return "space-around";
    case "spaceEvenly":  return "space-evenly";
  }
}

function alignmentToAlign(a: Alignment): string {
  switch (a) {
    case "start":   return "flex-start";
    case "center":  return "center";
    case "end":     return "flex-end";
    case "stretch": return "stretch";
  }
}

export interface ColumnProps {
  children?: React.ReactNode;
  modifier?: Modifier;
  spacing?: number;
  verticalArrangement?: Arrangement;
  horizontalAlignment?: Alignment;
}

/** Vertical flex container — analogous to Compose's Column. */
export function Column({
  children,
  modifier,
  spacing,
  verticalArrangement = "start",
  horizontalAlignment = "start",
}: ColumnProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: arrangementToJustify(verticalArrangement),
      alignItems: alignmentToAlign(horizontalAlignment),
      gap: spacing !== undefined ? `${spacing}px` : undefined,
      ...modProps.style,
    },
  }, children);
}

export interface RowProps {
  children?: React.ReactNode;
  modifier?: Modifier;
  spacing?: number;
  horizontalArrangement?: Arrangement;
  verticalAlignment?: Alignment;
  wrap?: boolean;
}

/** Horizontal flex container — analogous to Compose's Row. */
export function Row({
  children,
  modifier,
  spacing,
  horizontalArrangement = "start",
  verticalAlignment = "center",
  wrap = false,
}: RowProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: arrangementToJustify(horizontalArrangement),
      alignItems: alignmentToAlign(verticalAlignment),
      flexWrap: wrap ? "wrap" : "nowrap",
      gap: spacing !== undefined ? `${spacing}px` : undefined,
      ...modProps.style,
    },
  }, children);
}

export interface BoxProps {
  children?: React.ReactNode;
  modifier?: Modifier;
  contentAlignment?: "topStart" | "topCenter" | "topEnd" | "centerStart" | "center" | "centerEnd" | "bottomStart" | "bottomCenter" | "bottomEnd";
}

/** Positioned container — analogous to Compose's Box. */
export function Box({
  children,
  modifier,
  contentAlignment = "topStart",
}: BoxProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const [vertical, horizontal] = contentAlignment === "center"
    ? ["center", "center"]
    : contentAlignment.startsWith("top")
      ? ["flex-start", contentAlignment.includes("Center") ? "center" : contentAlignment.includes("End") ? "flex-end" : "flex-start"]
      : contentAlignment.startsWith("bottom")
        ? ["flex-end", contentAlignment.includes("Center") ? "center" : contentAlignment.includes("End") ? "flex-end" : "flex-start"]
        : ["center", contentAlignment.includes("Center") ? "center" : contentAlignment.includes("End") ? "flex-end" : "flex-start"];

  return React.createElement("div", {
    ...modProps,
    style: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: horizontal,
      justifyContent: vertical,
      ...modProps.style,
    },
  }, children);
}
