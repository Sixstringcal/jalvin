import { describe, it, expect } from "vitest";
import { Modifier } from "../modifier.js";
import { MutableInteractionSource } from "../interaction.js";

// ── Basic styles (regression guard) ──────────────────────────────────────────

describe("Modifier — basic styles", () => {
  it("Default produces empty props", () => {
    const props = Modifier.Default.toProps();
    expect(props.style).toBeUndefined();
    expect(props.className).toBeUndefined();
  });

  it("fillMaxWidth sets width 100%", () => {
    expect(Modifier.fillMaxWidth().toProps().style?.width).toBe("100%");
  });

  it("padding with number appends px", () => {
    expect(Modifier.padding(16).toProps().style?.padding).toBe("16px");
  });

  it("padding with string passes through", () => {
    expect(Modifier.padding("1rem").toProps().style?.padding).toBe("1rem");
  });

  it("background sets backgroundColor", () => {
    expect(Modifier.background("#fff").toProps().style?.backgroundColor).toBe("#fff");
  });

  it("className is recorded", () => {
    expect(Modifier.className("foo").toProps().className).toBe("foo");
  });

  it("then() merges styles, later wins", () => {
    const m = Modifier.background("#aaa").then(Modifier.background("#bbb"));
    expect(m.toProps().style?.backgroundColor).toBe("#bbb");
  });

  it("then() concatenates classNames", () => {
    const m = Modifier.className("a").then(Modifier.className("b"));
    expect(m.toProps().className).toBe("a b");
  });
});

// ── hoverable ─────────────────────────────────────────────────────────────────

describe("Modifier.hoverable", () => {
  it("toProps exposes onMouseEnter and onMouseLeave", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.hoverable(source).toProps();
    expect(typeof props.onMouseEnter).toBe("function");
    expect(typeof props.onMouseLeave).toBe("function");
  });

  it("onMouseEnter triggers _handleMouseEnter on the source", () => {
    const source = new MutableInteractionSource();
    const { onMouseEnter } = Modifier.hoverable(source).toProps();
    onMouseEnter!();
    expect(source.getInteractions()[0]?.type).toBe("hover.enter");
  });

  it("onMouseLeave triggers _handleMouseLeave on the source", () => {
    const source = new MutableInteractionSource();
    const { onMouseEnter, onMouseLeave } = Modifier.hoverable(source).toProps();
    onMouseEnter!();
    onMouseLeave!();
    expect(source.getInteractions()).toHaveLength(0);
  });

  it("does not expose focus or press handlers", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.hoverable(source).toProps();
    expect(props.onFocus).toBeUndefined();
    expect(props.onBlur).toBeUndefined();
    expect(props.onMouseDown).toBeUndefined();
    expect(props.onMouseUp).toBeUndefined();
  });

  it("static factory produces same result as instance method", () => {
    const source = new MutableInteractionSource();
    const a = Modifier.hoverable(source).toProps();
    const b = Modifier.Default.hoverable(source).toProps();
    expect(typeof a.onMouseEnter).toBe(typeof b.onMouseEnter);
  });
});

// ── focusable ─────────────────────────────────────────────────────────────────

describe("Modifier.focusable", () => {
  it("toProps exposes onFocus and onBlur", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.focusable(source).toProps();
    expect(typeof props.onFocus).toBe("function");
    expect(typeof props.onBlur).toBe("function");
  });

  it("onFocus triggers _handleFocus", () => {
    const source = new MutableInteractionSource();
    const { onFocus } = Modifier.focusable(source).toProps();
    onFocus!();
    expect(source.getInteractions()[0]?.type).toBe("focus.focus");
  });

  it("onBlur triggers _handleBlur", () => {
    const source = new MutableInteractionSource();
    const { onFocus, onBlur } = Modifier.focusable(source).toProps();
    onFocus!();
    onBlur!();
    expect(source.getInteractions()).toHaveLength(0);
  });

  it("does not expose hover or press handlers", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.focusable(source).toProps();
    expect(props.onMouseEnter).toBeUndefined();
    expect(props.onMouseLeave).toBeUndefined();
    expect(props.onMouseDown).toBeUndefined();
    expect(props.onMouseUp).toBeUndefined();
  });
});

// ── pressable ─────────────────────────────────────────────────────────────────

describe("Modifier.pressable", () => {
  it("toProps exposes onMouseDown and onMouseUp", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.pressable(source).toProps();
    expect(typeof props.onMouseDown).toBe("function");
    expect(typeof props.onMouseUp).toBe("function");
  });

  it("onMouseDown triggers _handleMouseDown with coordinates", () => {
    const source = new MutableInteractionSource();
    const { onMouseDown } = Modifier.pressable(source).toProps();
    onMouseDown!({ clientX: 42, clientY: 7 });
    const i = source.getInteractions()[0]!;
    expect(i.type).toBe("press.press");
    if (i.type === "press.press") {
      expect(i.x).toBe(42);
      expect(i.y).toBe(7);
    }
  });

  it("onMouseUp triggers _handleMouseUp", () => {
    const source = new MutableInteractionSource();
    const { onMouseDown, onMouseUp } = Modifier.pressable(source).toProps();
    onMouseDown!({ clientX: 0, clientY: 0 });
    onMouseUp!();
    expect(source.getInteractions()).toHaveLength(0);
  });

  it("onMouseLeave also cancels the press", () => {
    const source = new MutableInteractionSource();
    const { onMouseDown, onMouseLeave } = Modifier.pressable(source).toProps();
    onMouseDown!({ clientX: 0, clientY: 0 });
    onMouseLeave!();
    expect(source.getInteractions()).toHaveLength(0);
  });
});

// ── combining modifiers on one source ─────────────────────────────────────────

describe("Modifier — combining hoverable + focusable + pressable on one source", () => {
  it("all three handlers are present", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.hoverable(source).focusable(source).pressable(source).toProps();
    expect(typeof props.onMouseEnter).toBe("function");
    expect(typeof props.onMouseLeave).toBe("function");
    expect(typeof props.onFocus).toBe("function");
    expect(typeof props.onBlur).toBe("function");
    expect(typeof props.onMouseDown).toBe("function");
    expect(typeof props.onMouseUp).toBe("function");
  });

  it("onMouseLeave cancels both hover and press when both are active", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.hoverable(source).pressable(source).toProps();
    props.onMouseEnter!();
    props.onMouseDown!({ clientX: 0, clientY: 0 });
    expect(source.getInteractions()).toHaveLength(2);
    props.onMouseLeave!();
    expect(source.getInteractions()).toHaveLength(0);
  });

  it("interaction source is preserved through style chain", () => {
    const source = new MutableInteractionSource();
    const props = Modifier.hoverable(source).background("#fff").padding(8).toProps();
    expect(typeof props.onMouseEnter).toBe("function");
    expect(props.style?.backgroundColor).toBe("#fff");
    expect(props.style?.padding).toBe("8px");
  });
});

// ── then() with interaction sources ──────────────────────────────────────────

describe("Modifier.then — interaction source merging", () => {
  it("then() inherits interaction source from left when right has none", () => {
    const source = new MutableInteractionSource();
    const merged = Modifier.hoverable(source).then(Modifier.background("#fff"));
    const props = merged.toProps();
    expect(typeof props.onMouseEnter).toBe("function");
  });

  it("then() prefers right-hand interaction source", () => {
    const a = new MutableInteractionSource();
    const b = new MutableInteractionSource();
    const merged = Modifier.hoverable(a).then(Modifier.hoverable(b));
    const props = merged.toProps();
    props.onMouseEnter!();
    expect(b.getInteractions()[0]?.type).toBe("hover.enter");
    expect(a.getInteractions()).toHaveLength(0);
  });

  it("then() merges flags from both sides", () => {
    const source = new MutableInteractionSource();
    const merged = Modifier.hoverable(source).then(Modifier.focusable(source));
    const props = merged.toProps();
    expect(typeof props.onMouseEnter).toBe("function");
    expect(typeof props.onFocus).toBe("function");
  });
});
