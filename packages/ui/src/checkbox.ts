import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

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

/** Boolean toggle input. */
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
}: CheckboxProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};

  const input = jalvinCreateElement("input", {
    type: "checkbox",
    checked,
    disabled: !enabled,
    onChange: (e: any) => onCheckedChange?.(e.target.checked),
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
  }, []) as HTMLInputElement;

  const contentNodes: Node[] = [];
  if (label) {
    contentNodes.push(jalvinCreateElement("span", {
      style: { fontSize: "0.95rem", color: isError ? "#b00020" : "#1c1c1c" },
    }, [document.createTextNode(label)]));
  }
  if (supportingText) {
    contentNodes.push(jalvinCreateElement("span", {
      style: { fontSize: "0.75rem", color: isError ? "#b00020" : "#5c5c5c" },
    }, [document.createTextNode(supportingText)]));
  }

  const content = jalvinCreateElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: supportingText ? "2px" : "0",
    },
  }, contentNodes);

  return jalvinCreateElement("label", {
    ...modProps,
    style: {
      display: "inline-flex",
      alignItems: supportingText ? "flex-start" : "center",
      gap: "8px",
      cursor: enabled ? "pointer" : "not-allowed",
      ...modProps.style,
    },
  }, [input, content]);
}
