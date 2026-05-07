import React from "react";
import { Modifier } from "./modifier.js";

export type ButtonVariant = "filled" | "outlined" | "text" | "tonal";

export interface ButtonProps {
  text?: string;
  innerHTML?: string;
  onClick?: () => void;
  modifier?: Modifier;
  variant?: ButtonVariant;
  enabled?: boolean;
  type?: "button" | "submit" | "reset";
}

/** Button element. */
export function Button(
  { text, innerHTML: html, onClick, modifier, enabled = true, type = "button" }: ButtonProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const baseProps = {
    type,
    disabled: !enabled,
    onClick: enabled ? onClick : undefined,
    onMouseEnter: modProps.onMouseEnter,
    onMouseLeave: modProps.onMouseLeave,
    onFocus: modProps.onFocus,
    onBlur: modProps.onBlur,
    onMouseDown: modProps.onMouseDown,
    onMouseUp: modProps.onMouseUp,
    className: modProps.className,
    style: modProps.style as React.CSSProperties,
  };
  if (html !== undefined) {
    return React.createElement("button", {
      ...baseProps,
      dangerouslySetInnerHTML: { __html: html },
    });
  }
  const childNodes: React.ReactNode[] = text !== undefined ? [text] : (children ?? []);
  return React.createElement("button", baseProps, ...childNodes);
}

export interface IconButtonProps {
  innerHTML?: string;
  onClick?: () => void;
  modifier?: Modifier;
  enabled?: boolean;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
}

/** Icon-only circular button. */
export function IconButton(
  { innerHTML, onClick, modifier, enabled = true, type = "button", "aria-label": ariaLabel }: IconButtonProps,
  children?: React.ReactNode[]
): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  const baseProps = {
    type,
    disabled: !enabled,
    onClick: enabled ? onClick : undefined,
    onMouseEnter: modProps.onMouseEnter,
    onMouseLeave: modProps.onMouseLeave,
    onFocus: modProps.onFocus,
    onBlur: modProps.onBlur,
    onMouseDown: modProps.onMouseDown,
    onMouseUp: modProps.onMouseUp,
    className: modProps.className,
    style: modProps.style as React.CSSProperties,
    "aria-label": ariaLabel,
  };
  if (innerHTML !== undefined) {
    return React.createElement("button", {
      ...baseProps,
      dangerouslySetInnerHTML: { __html: innerHTML },
    });
  }
  return React.createElement("button", baseProps, ...(children ?? []));
}
