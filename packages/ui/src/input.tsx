import React from "react";
import { Modifier } from "./modifier.js";

export interface InputProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  modifier?: Modifier;
  enabled?: boolean;
  readOnly?: boolean;
  type?: "text" | "email" | "password" | "number" | "search" | "tel" | "url";
  label?: string;
  supportingText?: string;
  isError?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}

/** Text input — analogous to Compose's TextField / OutlinedTextField. */
export function Input({
  value,
  onValueChange,
  placeholder,
  modifier,
  enabled = true,
  readOnly = false,
  type = "text",
  label,
  supportingText,
  isError = false,
  maxLength,
  onFocus,
  onBlur,
  onKeyDown,
  autoFocus,
}: InputProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const borderColor = isError ? "#b00020" : "#c4c4c4";

  const input = React.createElement("input", {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange?.(e.target.value),
    placeholder,
    disabled: !enabled,
    readOnly,
    type,
    maxLength,
    onFocus,
    onBlur,
    onKeyDown,
    autoFocus,
    style: {
      width: "100%",
      padding: "8px 12px",
      fontSize: "1rem",
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      outline: "none",
      backgroundColor: enabled ? "#fff" : "#f5f5f5",
      color: "#1c1c1c",
      boxSizing: "border-box" as const,
    },
  });

  if (!label && !supportingText) {
    return React.createElement("div", { ...modProps }, input);
  }

  return React.createElement("div", {
    ...modProps,
    style: { display: "flex", flexDirection: "column", gap: "4px", ...modProps.style },
  },
    label && React.createElement("label", {
      style: { fontSize: "0.875rem", fontWeight: 500, color: isError ? "#b00020" : "#5c5c5c" },
    }, label),
    input,
    supportingText && React.createElement("span", {
      style: { fontSize: "0.75rem", color: isError ? "#b00020" : "#5c5c5c" },
    }, supportingText),
  );
}
