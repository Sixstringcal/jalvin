// @jalvin/ui — Jalvin UI component library
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

// Text
export { Text } from "./text.js";
export type { TextProps } from "./text.js";
export { TextStyle } from "./typography.js";
export type { TextStyleDef, TextStyleKey } from "./typography.js";
export {
  TextDecoration,
  buildAnnotatedString,
  LinkAnnotation,
  renderAnnotatedString,
} from "./annotated-string.js";
export type {
  SpanStyle,
  TextLinkStyles,
  AnnotatedString,
  StringRange,
} from "./annotated-string.js";

// Input
export { Input } from "./input.js";
export type { InputProps } from "./input.js";
export { TextArea } from "./textarea.js";
export type { TextAreaProps } from "./textarea.js";
export { Checkbox } from "./checkbox.js";
export type { CheckboxProps } from "./checkbox.js";

// Image
export { Image, AsyncImage } from "./image.js";
export type { ImageProps, AsyncImageProps } from "./image.js";
export { Canvas } from "./canvas.js";
export type { CanvasProps } from "./canvas.js";

// Spacer / Divider
export { Spacer, Divider } from "./spacer.js";
export type { SpacerProps, DividerProps } from "./spacer.js";

// Surface / Scaffold
export { Card, Scaffold, TopBar } from "./surface.js";
export type { CardProps, ScaffoldProps, TopBarProps } from "./surface.js";
