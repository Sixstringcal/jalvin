import type { CSSProperties } from "react";

export interface TextStyleDef {
  fontSize: string;
  fontWeight: number | "bold" | "normal";
  lineHeight: string;
  letterSpacing?: string;
}

export const TextStyle = {
  displayLarge: { fontSize: "3.5rem",  fontWeight: 400, lineHeight: "4rem" } satisfies TextStyleDef,
  displayMedium:{ fontSize: "2.8rem",  fontWeight: 400, lineHeight: "3.2rem" } satisfies TextStyleDef,
  displaySmall: { fontSize: "2.25rem", fontWeight: 400, lineHeight: "2.75rem" } satisfies TextStyleDef,

  headlineLarge: { fontSize: "2rem",  fontWeight: 400, lineHeight: "2.5rem" } satisfies TextStyleDef,
  headlineMedium:{ fontSize: "1.75rem",fontWeight: 400, lineHeight: "2.25rem" } satisfies TextStyleDef,
  headlineSmall: { fontSize: "1.5rem", fontWeight: 400, lineHeight: "2rem" } satisfies TextStyleDef,

  titleLarge:  { fontSize: "1.375rem", fontWeight: 500, lineHeight: "1.75rem" } satisfies TextStyleDef,
  titleMedium: { fontSize: "1rem",     fontWeight: 500, lineHeight: "1.5rem", letterSpacing: "0.009em" } satisfies TextStyleDef,
  titleSmall:  { fontSize: "0.875rem", fontWeight: 500, lineHeight: "1.25rem", letterSpacing: "0.007em" } satisfies TextStyleDef,

  bodyLarge:   { fontSize: "1rem",     fontWeight: 400, lineHeight: "1.5rem", letterSpacing: "0.009em" } satisfies TextStyleDef,
  bodyMedium:  { fontSize: "0.875rem", fontWeight: 400, lineHeight: "1.25rem", letterSpacing: "0.018em" } satisfies TextStyleDef,
  bodySmall:   { fontSize: "0.75rem",  fontWeight: 400, lineHeight: "1rem", letterSpacing: "0.025em" } satisfies TextStyleDef,

  labelLarge:  { fontSize: "0.875rem", fontWeight: 500, lineHeight: "1.25rem", letterSpacing: "0.007em" } satisfies TextStyleDef,
  labelMedium: { fontSize: "0.75rem",  fontWeight: 500, lineHeight: "1rem", letterSpacing: "0.031em" } satisfies TextStyleDef,
  labelSmall:  { fontSize: "0.6875rem",fontWeight: 500, lineHeight: "1rem", letterSpacing: "0.045em" } satisfies TextStyleDef,

  // Shortcuts
  h1: { fontSize: "2rem",     fontWeight: "bold", lineHeight: "2.5rem" } satisfies TextStyleDef,
  h2: { fontSize: "1.5rem",   fontWeight: "bold", lineHeight: "2rem" } satisfies TextStyleDef,
  h3: { fontSize: "1.25rem",  fontWeight: "bold", lineHeight: "1.75rem" } satisfies TextStyleDef,
  h4: { fontSize: "1.125rem", fontWeight: "bold", lineHeight: "1.5rem" } satisfies TextStyleDef,
  body: { fontSize: "1rem",   fontWeight: "normal", lineHeight: "1.5rem" } satisfies TextStyleDef,
  caption: { fontSize: "0.75rem", fontWeight: "normal", lineHeight: "1rem" } satisfies TextStyleDef,
  button: { fontSize: "0.875rem", fontWeight: 500, lineHeight: "1rem", letterSpacing: "0.031em" } satisfies TextStyleDef,
  code: { fontSize: "0.875rem", fontWeight: "normal", lineHeight: "1.4rem", letterSpacing: "-0.01em" } satisfies TextStyleDef,
} satisfies Record<string, TextStyleDef>;

export type TextStyleKey = keyof typeof TextStyle;

export function textStyleToCSS(style: TextStyleDef): CSSProperties {
  return style as CSSProperties;
}
