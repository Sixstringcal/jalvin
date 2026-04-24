import React from "react";
import { Modifier } from "./modifier.js";

export interface SpacerProps {
  /** Fixed width in pixels (horizontal spacer) */
  width?: number;
  /** Fixed height in pixels (vertical spacer) */
  height?: number;
  /** flex: 1 — takes all remaining space */
  weight?: number;
  modifier?: Modifier;
}

/** Flexible or fixed-size spacer — analogous to Compose's Spacer. */
export function Spacer({ width, height, weight, modifier }: SpacerProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("div", {
    ...modProps,
    style: {
      flex: weight !== undefined ? weight : undefined,
      width: width !== undefined ? `${width}px` : (weight !== undefined ? undefined : "0"),
      height: height !== undefined ? `${height}px` : (weight !== undefined ? undefined : "0"),
      flexShrink: 0,
      ...modProps.style,
    },
  });
}

export interface DividerProps {
  modifier?: Modifier;
  color?: string;
  thickness?: number;
  /** "horizontal" (default) or "vertical" */
  orientation?: "horizontal" | "vertical";
}

/** Thin line divider — analogous to Compose's Divider / VerticalDivider. */
export function Divider({
  modifier,
  color = "#c4c4c4",
  thickness = 1,
  orientation = "horizontal",
}: DividerProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const isVertical = orientation === "vertical";
  return React.createElement("div", {
    ...modProps,
    role: "separator",
    style: {
      width: isVertical ? `${thickness}px` : "100%",
      height: isVertical ? "100%" : `${thickness}px`,
      backgroundColor: color,
      flexShrink: 0,
      ...modProps.style,
    },
  });
}
