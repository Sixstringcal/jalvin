import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildAnnotatedString,
  LinkAnnotation,
  SpanStyle,
  TextDecoration,
  renderAnnotatedString,
} from "../annotated-string.js";
import { Text } from "../text.js";

// ---------------------------------------------------------------------------
// TextDecoration
// ---------------------------------------------------------------------------

describe("TextDecoration", () => {
  it("None produces no CSS value", () => {
    expect(TextDecoration.None.toCSSValue()).toBeUndefined();
  });

  it("Underline produces 'underline'", () => {
    expect(TextDecoration.Underline.toCSSValue()).toBe("underline");
  });

  it("LineThrough produces 'line-through'", () => {
    expect(TextDecoration.LineThrough.toCSSValue()).toBe("line-through");
  });

  it("Underline + LineThrough produces 'underline line-through'", () => {
    const combined = TextDecoration.Underline.plus(TextDecoration.LineThrough);
    expect(combined.toCSSValue()).toBe("underline line-through");
  });

  it("combining with None is a no-op", () => {
    const combined = TextDecoration.Underline.plus(TextDecoration.None);
    expect(combined.toCSSValue()).toBe("underline");
  });
});

// ---------------------------------------------------------------------------
// buildAnnotatedString — builder mechanics
// ---------------------------------------------------------------------------

describe("buildAnnotatedString — builder mechanics", () => {
  it("produces plain text with no spans", () => {
    const ann = buildAnnotatedString(b => b.append("hello"));
    expect(ann.text).toBe("hello");
    expect(ann.spanStyles).toHaveLength(0);
    expect(ann.linkAnnotations).toHaveLength(0);
  });

  it("records correct start/end for withStyle", () => {
    const ann = buildAnnotatedString(b => {
      b.append("ab");
      b.withStyle({ color: "red" }, () => b.append("cd"));
      b.append("ef");
    });
    expect(ann.text).toBe("abcdef");
    const span = ann.spanStyles[0]!;
    expect(span.start).toBe(2);
    expect(span.end).toBe(4);
    expect(span.item.color).toBe("red");
  });

  it("records correct start/end for withLink (Url)", () => {
    const ann = buildAnnotatedString(b => {
      b.append("go ");
      b.withLink(LinkAnnotation.Url("https://example.com"), () => b.append("here"));
    });
    expect(ann.text).toBe("go here");
    const link = ann.linkAnnotations[0]!;
    expect(link.start).toBe(3);
    expect(link.end).toBe(7);
    expect(link.item.type).toBe("url");
  });

  it("records correct start/end for withLink (Clickable)", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("tag1", onClick), () => b.append("click me"));
    });
    const link = ann.linkAnnotations[0]!;
    expect(link.start).toBe(0);
    expect(link.end).toBe(8);
    expect(link.item.type).toBe("clickable");
  });

  it("addStyle applies span to an explicit range", () => {
    const ann = buildAnnotatedString(b => {
      b.append("hello world");
      b.addStyle({ fontWeight: "bold" }, 6, 11);
    });
    const span = ann.spanStyles[0]!;
    expect(span.start).toBe(6);
    expect(span.end).toBe(11);
    expect(span.item.fontWeight).toBe("bold");
  });

  it("addLink applies a link to an explicit range", () => {
    const ann = buildAnnotatedString(b => {
      b.append("visit docs now");
      b.addLink(LinkAnnotation.Url("https://docs.example.com"), 6, 10);
    });
    const link = ann.linkAnnotations[0]!;
    expect(link.start).toBe(6);
    expect(link.end).toBe(10);
  });

  it("appending another AnnotatedString shifts offsets correctly", () => {
    const inner = buildAnnotatedString(b => {
      b.withStyle({ color: "blue" }, () => b.append("blue"));
    });
    const outer = buildAnnotatedString(b => {
      b.append("abc ");
      b.append(inner);
    });
    expect(outer.text).toBe("abc blue");
    const span = outer.spanStyles[0]!;
    expect(span.start).toBe(4);
    expect(span.end).toBe(8);
  });

  it("nested withStyle pushes two spans", () => {
    const ann = buildAnnotatedString(b => {
      b.withStyle({ fontWeight: "bold" }, () => {
        b.withStyle({ color: "red" }, () => b.append("x"));
      });
    });
    expect(ann.spanStyles).toHaveLength(2);
  });

  it("unclosed pushStyle is flushed on build", () => {
    const ann = buildAnnotatedString(b => {
      b.pushStyle({ color: "green" });
      b.append("test");
      // no pop() — build() should flush it
    });
    expect(ann.spanStyles).toHaveLength(1);
    expect(ann.spanStyles[0]!.end).toBe(4);
  });

  it("multiple sequential appends produce correct full text", () => {
    const ann = buildAnnotatedString(b => {
      b.append("one");
      b.append(" ");
      b.append("two");
    });
    expect(ann.text).toBe("one two");
  });
});

// ---------------------------------------------------------------------------
// LinkAnnotation factory
// ---------------------------------------------------------------------------

describe("LinkAnnotation", () => {
  it("Url stores url and type", () => {
    const link = LinkAnnotation.Url("https://example.com");
    expect(link.type).toBe("url");
    if (link.type === "url") expect(link.url).toBe("https://example.com");
  });

  it("Url accepts optional styles", () => {
    const styles = { style: { color: "#00f" } };
    const link = LinkAnnotation.Url("https://a.com", styles);
    expect(link.styles).toBe(styles);
  });

  it("Clickable stores tag, type, and callback", () => {
    const fn = vi.fn();
    const link = LinkAnnotation.Clickable("my-tag", fn);
    expect(link.type).toBe("clickable");
    if (link.type === "clickable") {
      expect(link.tag).toBe("my-tag");
      expect(link.onClick).toBe(fn);
    }
  });
});

// ---------------------------------------------------------------------------
// renderAnnotatedString
// ---------------------------------------------------------------------------

describe("renderAnnotatedString", () => {
  it("returns a single string node for plain text with no spans", () => {
    const ann = buildAnnotatedString(b => b.append("plain"));
    const nodes = renderAnnotatedString(ann);
    // Filters out nulls; for unstyled plain text a bare string is returned
    const text = nodes.join("");
    expect(text).toBe("plain");
  });

  it("renders a Url link as an <a> tag", () => {
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Url("https://example.com"), () => b.append("click"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a!.href).toBe("https://example.com/");
    expect(a!.target).toBe("_blank");
    expect(a!.rel).toContain("noopener");
    expect(a!.textContent).toBe("click");
  });

  it("renders a Clickable link as a <span role=link>", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("open", onClick), () => b.append("open dialog"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector('[role="link"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("open dialog");
  });

  it("fires the onClick callback when a Clickable link is clicked", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("my-tag", onClick), () => b.append("press"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector('[role="link"]') as HTMLElement;
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith("my-tag");
  });

  it("fires the onClick callback on Enter keydown", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("tag", onClick), () => b.append("press"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector('[role="link"]') as HTMLElement;
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires the onClick callback on Space keydown", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("tag", onClick), () => b.append("press"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector('[role="link"]') as HTMLElement;
    fireEvent.keyDown(el, { key: " " });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies SpanStyle color to a styled segment", () => {
    const ann = buildAnnotatedString(b => {
      b.withStyle({ color: "purple" }, () => b.append("colored"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector("span > span") as HTMLElement;
    expect(el.style.color).toBe("purple");
  });

  it("applies SpanStyle fontWeight to a styled segment", () => {
    const ann = buildAnnotatedString(b => {
      b.withStyle({ fontWeight: "bold" }, () => b.append("bold text"));
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const el = container.querySelector("span > span") as HTMLElement;
    expect(el.style.fontWeight).toBe("bold");
  });

  it("applies textDecoration from SpanStyle to a link", () => {
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Url("https://a.com"), () => {
        b.withStyle({ textDecoration: TextDecoration.Underline }, () => b.append("underlined link"));
      });
    });
    const { container } = render(
      React.createElement("span", null, ...renderAnnotatedString(ann))
    );
    const a = container.querySelector("a") as HTMLElement;
    expect(a.style.textDecoration).toContain("underline");
  });

  it("renders unstyled text segments without wrapping spans", () => {
    const ann = buildAnnotatedString(b => {
      b.append("plain ");
      b.withStyle({ color: "red" }, () => b.append("red"));
      b.append(" plain");
    });
    const nodes = renderAnnotatedString(ann);
    // First and last nodes should be bare strings, middle a React element
    expect(typeof nodes[0]).toBe("string");
    expect(typeof nodes[2]).toBe("string");
  });

  it("handles an AnnotatedString with no spans as a single text node", () => {
    const ann = buildAnnotatedString(b => b.append("no spans here"));
    const nodes = renderAnnotatedString(ann).filter(Boolean);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toBe("no spans here");
  });
});

// ---------------------------------------------------------------------------
// Text component integration
// ---------------------------------------------------------------------------

describe("Text + AnnotatedString integration", () => {
  it("renders plain string text unchanged", () => {
    render(React.createElement(Text, { text: "plain" }));
    expect(screen.getByText("plain")).toBeTruthy();
  });

  it("renders an AnnotatedString passed via text prop", () => {
    const ann = buildAnnotatedString(b => {
      b.append("Visit ");
      b.withLink(LinkAnnotation.Url("https://jalvin.dev"), () => b.append("Jalvin"));
    });
    const { container } = render(React.createElement(Text, { text: ann }));
    expect(container.querySelector("a")).not.toBeNull();
    expect(container.querySelector("a")!.textContent).toBe("Jalvin");
  });

  it("renders mixed plain + styled text inside Text", () => {
    const ann = buildAnnotatedString(b => {
      b.append("Hello ");
      b.withStyle({ color: "blue" }, () => b.append("world"));
    });
    const { container } = render(React.createElement(Text, { text: ann }));
    const spans = container.querySelectorAll("span");
    // Outer wrapper span + inner styled span
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it("Clickable link inside Text fires callback on click", () => {
    const onClick = vi.fn();
    const ann = buildAnnotatedString(b => {
      b.withLink(LinkAnnotation.Clickable("action", onClick), () => b.append("do it"));
    });
    const { container } = render(React.createElement(Text, { text: ann }));
    const el = container.querySelector('[role="link"]') as HTMLElement;
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledWith("action");
  });

  it("still supports children when text prop is a plain string", () => {
    render(React.createElement(Text, null, "child text"));
    expect(screen.getByText("child text")).toBeTruthy();
  });

  it("Text color prop still applied when text is an AnnotatedString", () => {
    const ann = buildAnnotatedString(b => b.append("hello"));
    const { container } = render(
      React.createElement(Text, { text: ann, color: "hotpink" })
    );
    const outer = container.querySelector("span") as HTMLElement;
    expect(outer.style.color).toBe("hotpink");
  });
});
