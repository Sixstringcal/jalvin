import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { Text } from "../text.js";
import { TextStyle } from "../typography.js";
import { patch } from "@jalvin/runtime";

/** Helper to render a VNode to the document body for testing. */
function render(vnode: any) {
  document.body.innerHTML = "";
  patch(document.body, vnode);
  return { container: document.body };
}

describe("Text", () => {
  it("renders a span by default", () => {
    const { container } = render(Text({ text: "hello" }));
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("renders text from the text prop", () => {
    render(Text({ text: "hello world" }));
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("renders text from children", () => {
    render(Text({ children: [document.createTextNode("from children")] }));
    expect(screen.getByText("from children")).toBeTruthy();
  });

  it("text prop takes priority over children when both provided", () => {
    render(Text({ text: "explicit", children: [document.createTextNode("child")] }));
    expect(screen.getByText("explicit")).toBeTruthy();
    expect(screen.queryByText("child")).toBeNull();
  });

  it("applies color prop as inline style", () => {
    const { container } = render(Text({ text: "hi", color: "red" }));
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("red");
  });

  it("applies TextStyle.headlineLarge typography via style prop", () => {
    const { container } = render(
      Text({ text: "headline", style: TextStyle.headlineLarge })
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("32px");
    expect(el.style.lineHeight).toBe("40px");
  });

  it("applies TextStyle.bodyLarge via style prop", () => {
    const { container } = render(
      Text({ text: "body", style: TextStyle.bodyLarge })
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("16px");
  });


  it("applies maxLines clamp styles", () => {
    const { container } = render(
      Text({ text: "clamp me", maxLines: 2 }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.overflow).toBe("hidden");
    expect(el.style.webkitLineClamp).toBe("2");
  });

  it("color prop overrides style color", () => {
    const { container } = render(
      Text({
        text: "hi",
        style: { fontSize: "1rem", fontWeight: 400, lineHeight: "1.5rem", color: "blue" } as any,
        color: "green",
      }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("green");
  });

  it("does not render any tag other than span", () => {
    const { container } = render(Text({ text: "x" }));
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });
});
