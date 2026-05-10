import { Modifier, type CSSProperties } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

export type ButtonVariant = "filled" | "outlined" | "text" | "tonal";

interface ButtonBaseProps {
  type: "button" | "submit" | "reset";
  disabled: boolean;
  onClick?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onMouseDown?: (e: { clientX: number; clientY: number }) => void;
  onMouseUp?: () => void;
  onTouchStart?: (e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
  className?: string;
  style?: CSSProperties;
  innerHTML?: string;
  "aria-label"?: string;
}

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
  children?: Node[]
): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  const baseProps: ButtonBaseProps = {
    type,
    disabled: !enabled,
    onClick: enabled ? (onClick as any) : undefined,
    onMouseEnter: modProps.onMouseEnter,
    onMouseLeave: modProps.onMouseLeave,
    onFocus: modProps.onFocus,
    onBlur: modProps.onBlur,
    onMouseDown: modProps.onMouseDown,
    onMouseUp: modProps.onMouseUp,
    onTouchStart: modProps.onTouchStart,
    onTouchEnd: modProps.onTouchEnd,
    onTouchCancel: modProps.onTouchCancel,
    className: modProps.className,
    style: modProps.style,
  };
  if (html !== undefined) {
    baseProps.innerHTML = html;
    return jalvinCreateElement("button", baseProps, []);
  }
  const childNodes = text !== undefined ? [document.createTextNode(text)] : (children ?? []);
  return jalvinCreateElement("button", baseProps as any, childNodes);
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
  children?: Node[]
): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  const baseProps: ButtonBaseProps = {
    type,
    disabled: !enabled,
    onClick: enabled ? (onClick as any) : undefined,
    onMouseEnter: modProps.onMouseEnter,
    onMouseLeave: modProps.onMouseLeave,
    onFocus: modProps.onFocus,
    onBlur: modProps.onBlur,
    onMouseDown: modProps.onMouseDown,
    onMouseUp: modProps.onMouseUp,
    onTouchStart: modProps.onTouchStart,
    onTouchEnd: modProps.onTouchEnd,
    onTouchCancel: modProps.onTouchCancel,
    className: modProps.className,
    style: modProps.style,
    "aria-label": ariaLabel,
  };
  if (innerHTML !== undefined) {
    baseProps.innerHTML = innerHTML;
    return jalvinCreateElement("button", baseProps, []);
  }
  return jalvinCreateElement("button", baseProps as any, children ?? []);
}
