import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";
import type { VNode } from "@jalvin/runtime";

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
  children?: VNode[]
): VNode {
  const modProps = modifier?.toProps() ?? {};
  return jalvinCreateElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: arrangementToJustify(verticalArrangement),
      alignItems: alignmentToAlign(horizontalAlignment),
      ...(spacing !== undefined ? { gap: `${spacing}px` } : {}),
      ...modProps.style,
    },
  }, children ?? []);
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
  children?: VNode[]
): VNode {
  const modProps = modifier?.toProps() ?? {};
  return jalvinCreateElement("div", {
    ...modProps,
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: arrangementToJustify(horizontalArrangement),
      alignItems: alignmentToAlign(verticalAlignment),
      flexWrap: wrap ? "wrap" : "nowrap",
      ...(spacing !== undefined ? { gap: `${spacing}px` } : {}),
      ...modProps.style,
    },
  }, children ?? []);
}

export type ContentAlignment =
  | "topStart" | "topCenter" | "topEnd"
  | "centerStart" | "center" | "centerEnd"
  | "bottomStart" | "bottomCenter" | "bottomEnd";

export interface BoxProps {
  modifier?: Modifier;
  contentAlignment?: ContentAlignment;
}

function contentAlignmentToStyle(a: ContentAlignment): { alignItems: string; justifyContent: string } {
  const row = a.startsWith("top") ? "flex-start" : a.startsWith("bottom") ? "flex-end" : "center";
  const col = a.endsWith("Start") ? "flex-start" : a.endsWith("End") ? "flex-end" : "center";
  return { alignItems: col, justifyContent: row };
}

/** Positioned/stacking container. */
export function Box(
  { modifier, contentAlignment = "topStart" }: BoxProps,
  children?: VNode[]
): VNode {
  const modProps = modifier?.toProps() ?? {};
  const { alignItems, justifyContent } = contentAlignmentToStyle(contentAlignment);
  return jalvinCreateElement("div", {
    ...modProps,
    style: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems,
      justifyContent,
      ...modProps.style,
    },
  }, children ?? []);
}
