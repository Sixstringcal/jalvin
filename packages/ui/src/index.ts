// @jalvin/ui — Compose-style DOM component library (no React)
//
// Usage example (in a .jalvin file):
//   import @jalvin/ui.Column
//   import @jalvin/ui.Row
//   import @jalvin/ui.Button
//   import @jalvin/ui.Modifier

export { Modifier, applyModifier } from "./modifier.js";
export type { CSSProperties } from "./modifier.js";

export { Color } from "./colors.js";
export type { ColorValue } from "./colors.js";

// Layout
export { Column, Row, Box } from "./layout.js";
export type { ColumnProps, RowProps, BoxProps, Alignment, Arrangement } from "./layout.js";

// Buttons
export { Button, IconButton } from "./button.js";
export type { ButtonProps, ButtonVariant, IconButtonProps } from "./button.js";
