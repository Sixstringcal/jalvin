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
  modifier?: Modifier;
  spacing?: number;
  verticalArrangement?: Arrangement;
  horizontalAlignment?: Alignment;
}

/** Vertical flex container. */
export function Column(
  { modifier, spacing, verticalArrangement = "start", horizontalAlignment = "start" }: ColumnProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: arrangementToJustify(verticalArrangement),
      alignItems: alignmentToAlign(horizontalAlignment),
      ...(spacing !== undefined ? { gap: `${spacing}px` } : {}),
      ...modProps.style,
    } as React.CSSProperties,
  }, ...(children ?? []));
}

export interface RowProps {
  modifier?: Modifier;
  spacing?: number;
  horizontalArrangement?: Arrangement;
  verticalAlignment?: Alignment;
  wrap?: boolean;
}

/** Horizontal flex container. */
export function Row(
  { modifier, spacing, horizontalArrangement = "start", verticalAlignment = "center", wrap = false }: RowProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: arrangementToJustify(horizontalArrangement),
      alignItems: alignmentToAlign(verticalAlignment),
      flexWrap: wrap ? "wrap" : "nowrap",
      ...(spacing !== undefined ? { gap: `${spacing}px` } : {}),
      ...modProps.style,
    } as React.CSSProperties,
  }, ...(children ?? []));
}

export interface BoxProps {
  modifier?: Modifier;
  contentAlignment?: "topStart" | "topCenter" | "topEnd" | "centerStart" | "center" | "centerEnd" | "bottomStart" | "bottomCenter" | "bottomEnd";
}

/** Positioned container. */
export function Box(
  { modifier, contentAlignment = "topStart" }: BoxProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const isCentered = contentAlignment === "center";
  return React.createElement("div", {
    ...modProps,
    style: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      ...(isCentered ? { alignItems: "center", justifyContent: "center" } : {}),
      ...modProps.style,
    } as React.CSSProperties,
  }, ...(children ?? []));
}
