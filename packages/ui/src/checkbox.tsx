import React from "react";
import { Modifier } from "./modifier.js";

export interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  modifier?: Modifier;
  enabled?: boolean;
  label?: string;
  supportingText?: string;
  isError?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
}

/** Boolean toggle input — analogous to Compose's Checkbox. */
export function Checkbox({
  checked = false,
  onCheckedChange,
  modifier,
  enabled = true,
  label,
  supportingText,
  isError = false,
  onFocus,
  onBlur,
  autoFocus,
}: CheckboxProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};

  const input = React.createElement("input", {
    type: "checkbox",
    checked,
    disabled: !enabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
    onFocus,
    onBlur,
    autoFocus,
    style: {
      margin: 0,
      width: "1rem",
      height: "1rem",
      accentColor: isError ? "#b00020" : "#2563eb",
      cursor: enabled ? "pointer" : "not-allowed",
    },
  });

  const content = React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: supportingText ? "2px" : "0",
    },
  },
    label && React.createElement("span", {
      style: { fontSize: "0.95rem", color: isError ? "#b00020" : "#1c1c1c" },
    }, label),
    supportingText && React.createElement("span", {
      style: { fontSize: "0.75rem", color: isError ? "#b00020" : "#5c5c5c" },
    }, supportingText),
  );

  return React.createElement("label", {
    ...modProps,
    style: {
      display: "inline-flex",
      alignItems: supportingText ? "flex-start" : "center",
      gap: "8px",
      cursor: enabled ? "pointer" : "not-allowed",
      ...modProps.style,
    },
  }, input, content);
}