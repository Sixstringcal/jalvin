import { Modifier, type CSSProperties } from "./modifier.js";
import { type TextStyleDef, textStyleToCSS } from "./typography.js";
import { type AnnotatedString, renderAnnotatedString } from "./annotated-string.js";
import { jalvinCreateElement } from "@jalvin/runtime";

export interface TextProps {
  children?: Node[];
  /** Plain string content or an AnnotatedString (for inline links / spans). */
  text?: string | AnnotatedString;
  modifier?: Modifier;
  /** Typography style — use TextStyle tokens (e.g. TextStyle.headlineLarge) */
  style?: TextStyleDef | Record<string, any>;
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
}: TextProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  const textStyle = style && (style as any).fontSize ? textStyleToCSS(style as TextStyleDef) : (style ?? {});
  
  const clampStyle: Record<string, any> = maxLines !== undefined ? {
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } : {};

  let content: Node[];
  if (typeof text === "object" && text !== null && "spanStyles" in text) {
    content = renderAnnotatedString(text);
  } else if (text !== undefined) {
    content = [document.createTextNode(String(text))];
  } else {
    content = children ?? [];
  }

  const finalStyle: CSSProperties = {
    ...textStyle,
    ...clampStyle,
    ...modProps.style,
  };

  if (color) finalStyle.color = color;
  else if (textStyle.color) finalStyle.color = textStyle.color;

  return jalvinCreateElement("span", {
    ...modProps,
    style: finalStyle,
  }, content);
}
