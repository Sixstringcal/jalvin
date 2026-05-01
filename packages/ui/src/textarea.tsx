import React from "react";
import { Modifier } from "./modifier.js";

export interface TextAreaProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  modifier?: Modifier;
  enabled?: boolean;
  readOnly?: boolean;
  label?: string;
  supportingText?: string;
  isError?: boolean;
  maxLength?: number;
  rows?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}

/** Multiline text input — analogous to Compose's TextField with `singleLine = false`. */
export function TextArea({
  value,
  onValueChange,
  placeholder,
  modifier,
  enabled = true,
  readOnly = false,
  label,
  supportingText,
  isError = false,
  maxLength,
  rows = 4,
  onFocus,
  onBlur,
  onKeyDown,
  autoFocus,
}: TextAreaProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const borderColor = isError ? "#b00020" : "#c4c4c4";

  const textArea = React.createElement("textarea", {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onValueChange?.(e.target.value),
    placeholder,
    disabled: !enabled,
    readOnly,
    maxLength,
    rows,
    onFocus,
    onBlur,
    onKeyDown,
    autoFocus,
    style: {
      width: "100%",
      padding: "8px 12px",
      fontSize: "1rem",
      fontFamily: "inherit",
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      outline: "none",
      backgroundColor: enabled ? "#fff" : "#f5f5f5",
      color: "#1c1c1c",
      boxSizing: "border-box" as const,
      resize: "vertical" as const,
      lineHeight: 1.4,
    },
  });

  if (!label && !supportingText) {
    return React.createElement("div", { ...modProps }, textArea);
  }

  return React.createElement("div", {
    ...modProps,
    style: { display: "flex", flexDirection: "column", gap: "4px", ...modProps.style },
  },
    label && React.createElement("label", {
      style: { fontSize: "0.875rem", fontWeight: 500, color: isError ? "#b00020" : "#5c5c5c" },
    }, label),
    textArea,
    supportingText && React.createElement("span", {
      style: { fontSize: "0.75rem", color: isError ? "#b00020" : "#5c5c5c" },
    }, supportingText),
  );
}