// ─────────────────────────────────────────────────────────────────────────────
// Color — named color constants matching Material Design 3 + extras
// ─────────────────────────────────────────────────────────────────────────────

export const Color = {
  // Grays
  White:        "#ffffff",
  Black:        "#000000",
  Transparent:  "transparent",
  Surface:      "#f5f5f5",
  SurfaceVariant: "#e7e7e7",
  Outline:      "#c4c4c4",
  OnSurface:    "#1c1c1c",
  OnSurfaceVariant: "#5c5c5c",

  // Primary
  Primary:      "#0066cc",
  PrimaryLight: "#4d94ff",
  PrimaryDark:  "#004499",
  OnPrimary:    "#ffffff",

  // Secondary
  Secondary:    "#6750a4",
  SecondaryLight: "#9a82d9",
  OnSecondary:  "#ffffff",

  // Error
  Error:        "#b00020",
  ErrorLight:   "#ef5350",
  OnError:      "#ffffff",

  // Success
  Success:      "#2e7d32",
  SuccessLight: "#66bb6a",
  OnSuccess:    "#ffffff",

  // Warning
  Warning:      "#f57c00",
  WarningLight: "#ffb74d",
  OnWarning:    "#ffffff",
} as const;

export type ColorValue = string;
