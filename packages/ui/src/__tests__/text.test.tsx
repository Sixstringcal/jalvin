import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Text } from "../text.js";
import { TextStyle } from "../typography.js";

describe("Text", () => {
  it("renders a span by default", () => {
    const { container } = render(React.createElement(Text, { text: "hello" }));
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("renders text from the text prop", () => {
    render(React.createElement(Text, { text: "hello world" }));
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("renders text from children", () => {
    render(React.createElement(Text, null, "from children"));
    expect(screen.getByText("from children")).toBeTruthy();
  });

  it("text prop takes priority over children when both provided", () => {
    render(React.createElement(Text, { text: "explicit" }, "child"));
    expect(screen.getByText("explicit")).toBeTruthy();
    expect(screen.queryByText("child")).toBeNull();
  });

  it("applies color prop as inline style", () => {
    const { container } = render(React.createElement(Text, { text: "hi", color: "red" }));
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("red");
  });

  it("applies TextStyle.h1 typography via style prop", () => {
    const { container } = render(
      React.createElement(Text, { text: "headline", style: TextStyle.h1 }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("2rem");
    expect(el.style.fontWeight).toBe("bold");
  });

  it("applies TextStyle.bodyLarge via style prop", () => {
    const { container } = render(
      React.createElement(Text, { text: "body", style: TextStyle.bodyLarge }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("1rem");
  });

  it("applies maxLines clamp styles", () => {
    const { container } = render(
      React.createElement(Text, { text: "clamp me", maxLines: 2 }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.overflow).toBe("hidden");
    expect(el.style.webkitLineClamp).toBe("2");
  });

  it("color prop overrides style color", () => {
    const { container } = render(
      React.createElement(Text, {
        text: "hi",
        style: { fontSize: "1rem", fontWeight: 400, lineHeight: "1.5rem", color: "blue" } as any,
        color: "green",
      }),
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("green");
  });

  it("does not render any tag other than span", () => {
    const { container } = render(React.createElement(Text, { text: "x" }));
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });
});
