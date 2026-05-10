import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

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
  autoFocus?: boolean;
}

/** Text input. */
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
  autoFocus,
}: InputProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  const borderColor = isError ? "#b00020" : "#c4c4c4";

  const input = jalvinCreateElement("input", {
    value,
    onInput: (e: any) => onValueChange?.(e.target.value),
    placeholder,
    disabled: !enabled,
    readOnly,
    type,
    maxLength,
    onFocus,
    onBlur,
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
      boxSizing: "border-box",
    },
  }, []);

  if (!label && !supportingText) {
    return jalvinCreateElement("div", { ...modProps }, [input]);
  }

  const containerChildren: Node[] = [];
  if (label) {
    containerChildren.push(jalvinCreateElement("label", {
      style: { fontSize: "0.875rem", fontWeight: 500, color: isError ? "#b00020" : "#5c5c5c" },
    }, [document.createTextNode(label)]));
  }
  containerChildren.push(input);
  if (supportingText) {
    containerChildren.push(jalvinCreateElement("span", {
      style: { fontSize: "0.75rem", color: isError ? "#b00020" : "#5c5c5c" },
    }, [document.createTextNode(supportingText)]));
  }

  return jalvinCreateElement("div", {
    ...modProps,
    style: { display: "flex", flexDirection: "column", gap: "4px", ...modProps.style },
  }, containerChildren);
}
