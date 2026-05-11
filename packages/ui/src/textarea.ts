import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

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
  autoFocus?: boolean;
}

/** Multiline text input. */
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
  autoFocus,
}: TextAreaProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};
  const borderColor = isError ? "#b00020" : "#c4c4c4";

  const textArea = jalvinCreateElement("textarea", {
    value,
    onInput: (e: any) => onValueChange?.(e.target.value),
    placeholder,
    disabled: !enabled,
    readOnly,
    maxLength,
    rows,
    onFocus,
    onBlur,
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
      boxSizing: "border-box",
      resize: "vertical",
      lineHeight: 1.4,
    },
  }, []);

  if (!label && !supportingText) {
    return jalvinCreateElement("div", { ...modProps }, [textArea]);
  }

  const containerChildren: Node[] = [];
  if (label) {
    containerChildren.push(jalvinCreateElement("label", {
      style: { fontSize: "0.875rem", fontWeight: 500, color: isError ? "#b00020" : "#5c5c5c" },
    }, [document.createTextNode(label)]));
  }
  containerChildren.push(textArea);
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
