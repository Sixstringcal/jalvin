import React from "react";
import { Modifier } from "./modifier.js";
import { Color } from "./colors.js";
import type { CSSProperties } from "react";

export type ButtonVariant = "filled" | "outlined" | "text" | "tonal";

export interface ButtonProps {
  text?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  modifier?: Modifier;
  variant?: ButtonVariant;
  enabled?: boolean;
  /** Icon rendered before the label */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the label */
  trailingIcon?: React.ReactNode;
  type?: "button" | "submit" | "reset";
}

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "8px 16px",
  borderRadius: "20px",
  fontSize: "0.875rem",
  fontWeight: 500,
  letterSpacing: "0.031em",
  cursor: "pointer",
  border: "none",
  outline: "none",
  transition: "background-color 0.15s, opacity 0.15s",
  userSelect: "none",
};

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  filled: {
    backgroundColor: Color.Primary,
    color: Color.OnPrimary,
  },
  outlined: {
    backgroundColor: "transparent",
    color: Color.Primary,
    border: `1px solid ${Color.Primary}`,
  },
  text: {
    backgroundColor: "transparent",
    color: Color.Primary,
    padding: "8px 12px",
  },
  tonal: {
    backgroundColor: Color.PrimaryLight + "33",
    color: Color.Primary,
  },
};

/** Button — analogous to Compose's Button / OutlinedButton / TextButton. */
export function Button({
  text,
  children,
  onClick,
  modifier,
  variant = "filled",
  enabled = true,
  leadingIcon,
  trailingIcon,
  type = "button",
}: ButtonProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement(
    "button",
    {
      type,
      onClick: enabled ? onClick : undefined,
      disabled: !enabled,
      ...modProps,
      style: {
        ...BASE,
        ...VARIANT_STYLES[variant],
        opacity: enabled ? 1 : 0.4,
        ...modProps.style,
      },
    },
    leadingIcon,
    text ?? children,
    trailingIcon,
  );
}

export interface IconButtonProps {
  onClick?: () => void;
  modifier?: Modifier;
  enabled?: boolean;
  children: React.ReactNode;
  "aria-label"?: string;
}

/** Icon-only circular button. */
export function IconButton({
  onClick,
  modifier,
  enabled = true,
  children,
  "aria-label": ariaLabel,
}: IconButtonProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("button", {
    type: "button",
    onClick: enabled ? onClick : undefined,
    disabled: !enabled,
    "aria-label": ariaLabel,
    ...modProps,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      border: "none",
      background: "transparent",
      cursor: enabled ? "pointer" : "default",
      opacity: enabled ? 1 : 0.4,
      transition: "background-color 0.15s",
      ...modProps.style,
    },
  }, children);
}
