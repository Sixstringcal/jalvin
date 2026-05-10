/** Local definition for standard CSS properties. */
export type CSSProperties = { [key: string]: string | number | undefined };

export interface TextStyleDef {
  fontSize: number;
  lineHeight: number;
  fontWeight: number | "bold" | "normal";
  letterSpacing: number;
  fontFamily?: string;
  color?: string;
}

export const TextStyle = {
  displayLarge:    { fontSize: 57, lineHeight: 64, fontWeight: 400, letterSpacing: -0.25 },
  displayMedium:   { fontSize: 45, lineHeight: 52, fontWeight: 400, letterSpacing: 0 },
  displaySmall:    { fontSize: 36, lineHeight: 44, fontWeight: 400, letterSpacing: 0 },
  headlineLarge:   { fontSize: 32, lineHeight: 40, fontWeight: 400, letterSpacing: 0 },
  headlineMedium:  { fontSize: 28, lineHeight: 36, fontWeight: 400, letterSpacing: 0 },
  headlineSmall:   { fontSize: 24, lineHeight: 32, fontWeight: 400, letterSpacing: 0 },
  titleLarge:      { fontSize: 22, lineHeight: 28, fontWeight: 400, letterSpacing: 0 },
  titleMedium:     { fontSize: 16, lineHeight: 24, fontWeight: 500, letterSpacing: 0.15 },
  titleSmall:      { fontSize: 14, lineHeight: 20, fontWeight: 500, letterSpacing: 0.1 },
  labelLarge:      { fontSize: 14, lineHeight: 20, fontWeight: 500, letterSpacing: 0.1 },
  labelMedium:     { fontSize: 12, lineHeight: 16, fontWeight: 500, letterSpacing: 0.5 },
  labelSmall:      { fontSize: 11, lineHeight: 16, fontWeight: 500, letterSpacing: 0.5 },
  bodyLarge:       { fontSize: 16, lineHeight: 24, fontWeight: 400, letterSpacing: 0.5 },
  bodyMedium:      { fontSize: 14, lineHeight: 20, fontWeight: 400, letterSpacing: 0.25 },
  bodySmall:       { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.4 },
} as const;

/**
 * Converts a TextStyle token to standard CSS properties.
 */
export function textStyleToCSS(style: TextStyleDef): CSSProperties {
  const css: any = {
    fontSize: `${style.fontSize}px`,
    lineHeight: `${style.lineHeight}px`,
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing}px`,
  };
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.color) css.color = style.color;
  return css;
}
