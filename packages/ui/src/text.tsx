import React from "react";
import { Modifier } from "./modifier.js";
import { type TextStyleDef, textStyleToCSS } from "./typography.js";
import type { CSSProperties } from "react";

export interface TextProps {
  children?: React.ReactNode;
  /** Shorthand for text content when no JSX children needed */
  text?: string;
  modifier?: Modifier;
  /** Typography style — use TextStyle tokens (e.g. TextStyle.headlineLarge) */
  style?: TextStyleDef | CSSProperties;
  color?: string;
  maxLines?: number;
}

/** Text element — analogous to Compose's Text. */
export function Text({
  children,
  text,
  modifier,
  style,
  color,
  maxLines,
}: TextProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const textStyle: CSSProperties = style ? textStyleToCSS(style as TextStyleDef) : {};
  const clampStyle: CSSProperties = maxLines !== undefined ? {
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } : {};

  return React.createElement("span", {
    ...modProps,
    style: {
      ...textStyle,
      color: color ?? textStyle.color,
      ...clampStyle,
      ...modProps.style,
    },
  }, text ?? children);
}
