import { Modifier, applyModifier } from "./modifier.js";

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

/** Vertical flex container — analogous to Compose's Column. */
export function Column(
  { modifier, spacing, verticalArrangement = "start", horizontalAlignment = "start" }: ColumnProps,
  children?: HTMLElement[]
): HTMLElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.justifyContent = arrangementToJustify(verticalArrangement);
  el.style.alignItems = alignmentToAlign(horizontalAlignment);
  if (spacing !== undefined) el.style.gap = `${spacing}px`;
  if (modifier) applyModifier(el, modifier);
  for (const child of children ?? []) el.appendChild(child);
  return el;
}

export interface RowProps {
  modifier?: Modifier;
  spacing?: number;
  horizontalArrangement?: Arrangement;
  verticalAlignment?: Alignment;
  wrap?: boolean;
}

/** Horizontal flex container — analogous to Compose's Row. */
export function Row(
  { modifier, spacing, horizontalArrangement = "start", verticalAlignment = "center", wrap = false }: RowProps,
  children?: HTMLElement[]
): HTMLElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "row";
  el.style.justifyContent = arrangementToJustify(horizontalArrangement);
  el.style.alignItems = alignmentToAlign(verticalAlignment);
  el.style.flexWrap = wrap ? "wrap" : "nowrap";
  if (spacing !== undefined) el.style.gap = `${spacing}px`;
  if (modifier) applyModifier(el, modifier);
  for (const child of children ?? []) el.appendChild(child);
  return el;
}

export interface BoxProps {
  modifier?: Modifier;
  contentAlignment?: "topStart" | "topCenter" | "topEnd" | "centerStart" | "center" | "centerEnd" | "bottomStart" | "bottomCenter" | "bottomEnd";
}

/** Positioned container — analogous to Compose's Box. */
export function Box(
  { modifier, contentAlignment = "topStart" }: BoxProps,
  children?: HTMLElement[]
): HTMLElement {
  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.display = "flex";
  el.style.flexDirection = "column";
  if (contentAlignment === "center") {
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
  }
  if (modifier) applyModifier(el, modifier);
  for (const child of children ?? []) el.appendChild(child);
  return el;
}
