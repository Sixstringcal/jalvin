import React from "react";
import { Modifier } from "./modifier.js";
import { type TextStyleDef, textStyleToCSS } from "./typography.js";
import type { CSSProperties } from "react";

export interface TextProps {
  children?: React.ReactNode;
  /** Shorthand for text content when no JSX children needed */
  text?: string;
  modifier?: Modifier;
  style?: TextStyleDef | CSSProperties;
  color?: string;
  maxLines?: number;
  /** HTML tag to render — defaults to "span" */
  as?: "p" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "label" | "code" | "pre" | "strong" | "em";
}

/** Text element — analogous to Compose's Text. */
export function Text({
  children,
  text,
  modifier,
  style,
  color,
  maxLines,
  as: Tag = "span",
}: TextProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const textStyle: CSSProperties = style ? textStyleToCSS(style as TextStyleDef) : {};

  const clampStyle: CSSProperties = maxLines !== undefined ? {
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } : {};

  return React.createElement(Tag, {
    ...modProps,
    style: {
      ...textStyle,
      color: color ?? textStyle.color,
      ...clampStyle,
      ...modProps.style,
    },
  }, text ?? children);
}
