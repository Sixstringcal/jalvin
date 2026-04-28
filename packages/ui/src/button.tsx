import { Modifier, applyModifier } from "./modifier.js";

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

/** Button — analogous to Compose's Button / OutlinedButton / TextButton. */
export function Button(
  { text, innerHTML: html, onClick, modifier, enabled = true, type = "button" }: ButtonProps,
  children?: HTMLElement[]
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = type;
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  if (onClick && enabled) el.addEventListener("click", onClick);
  if (!enabled) el.disabled = true;
  if (modifier) applyModifier(el, modifier);
  for (const child of children ?? []) el.appendChild(child);
  return el;
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
  children?: HTMLElement[]
): HTMLButtonElement {
  const el = Button({ innerHTML, onClick, modifier, enabled, type }, children);
  if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
  return el;
}
