import React from "react";
import { Modifier } from "./modifier.js";
import { type TextStyleDef, textStyleToCSS } from "./typography.js";
import type { CSSProperties } from "react";
import { type AnnotatedString, renderAnnotatedString } from "./annotated-string.js";

export interface TextProps {
  children?: React.ReactNode;
  /** Plain string content or an AnnotatedString (for inline links / spans). */
  text?: string | AnnotatedString;
  modifier?: Modifier;
  /** Typography style — use TextStyle tokens (e.g. TextStyle.headlineLarge) */
  style?: TextStyleDef | CSSProperties;
  color?: string;
  maxLines?: number;
}

/** Text element. Accepts plain strings or AnnotatedStrings with inline links and spans. */
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

  const content = typeof text === "object" && text !== null && "spanStyles" in text
    ? renderAnnotatedString(text)
    : (text ?? children);

  return React.createElement("span", {
    ...modProps,
    style: {
      ...textStyle,
      color: color ?? textStyle.color,
      ...clampStyle,
      ...modProps.style,
    },
  }, content);
}
