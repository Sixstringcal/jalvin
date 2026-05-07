// ─────────────────────────────────────────────────────────────────────────────
// Modifier — fluent builder for layout, spacing, and styling
//
// Fluent builder for layout, spacing, and styling. Every method returns a new
// (immutable) Modifier instance so chains can be safely split across
// variables.
//
// Example:
//   Modifier.fillMaxWidth().padding(16).background(Color.Surface)
// ─────────────────────────────────────────────────────────────────────────────

// DOM-compatible CSS properties — mirrors React's CSSProperties but has no React dependency.
export type CSSProperties = { [key: string]: string | number | undefined };

export class Modifier {
  readonly _styles: CSSProperties;
  readonly _classNames: ReadonlyArray<string>;

  private constructor(styles: CSSProperties = {}, classNames: string[] = []) {
    this._styles = styles;
    this._classNames = classNames;
  }

  // ── Static factory helpers ─────────────────────────────────────────────────

  static get Default(): Modifier { return new Modifier(); }

  static fillMaxWidth():  Modifier { return new Modifier().fillMaxWidth(); }
  static fillMaxHeight(): Modifier { return new Modifier().fillMaxHeight(); }
  static fillMaxSize():   Modifier { return new Modifier().fillMaxSize(); }
  static padding(v: number | string): Modifier { return new Modifier().padding(v); }
  static margin(v: number | string):  Modifier { return new Modifier().margin(v); }
  static background(c: string):       Modifier { return new Modifier().background(c); }
  static color(c: string):            Modifier { return new Modifier().color(c); }
  static width(v: number | string):   Modifier { return new Modifier().width(v); }
  static height(v: number | string):  Modifier { return new Modifier().height(v); }
  static size(v: number):             Modifier { return new Modifier().size(v); }
  static className(name: string):     Modifier { return new Modifier().className(name); }
  static border(v: string):           Modifier { return new Modifier().border(v); }
  static borderRadius(v: number | string): Modifier { return new Modifier().borderRadius(v); }
  static opacity(v: number):          Modifier { return new Modifier().opacity(v); }
  static cursor(v: string):           Modifier { return new Modifier().cursor(v); }
  static zIndex(v: number):           Modifier { return new Modifier().zIndex(v); }
  static overflow(v: "visible" | "hidden" | "scroll" | "auto"): Modifier { return new Modifier().overflow(v); }
  static whiteSpace(v: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line" | "break-spaces"): Modifier { return new Modifier().whiteSpace(v); }
  static marginTop(v: number | string):    Modifier { return new Modifier().marginTop(v); }
  static marginBottom(v: number | string): Modifier { return new Modifier().marginBottom(v); }
  static marginLeft(v: number | string):   Modifier { return new Modifier().marginLeft(v); }
  static marginRight(v: number | string):  Modifier { return new Modifier().marginRight(v); }

  // ── Fluent instance methods ────────────────────────────────────────────────

  private with(extra: CSSProperties): Modifier {
    return new Modifier({ ...this._styles, ...extra }, [...this._classNames]);
  }

  fillMaxWidth():  Modifier { return this.with({ width: "100%" }); }
  fillMaxHeight(): Modifier { return this.with({ height: "100%" }); }
  fillMaxSize():   Modifier { return this.with({ width: "100%", height: "100%" }); }

  padding(v: number | string): Modifier {
    return this.with({ padding: typeof v === "number" ? `${v}px` : v });
  }
  paddingHorizontal(v: number): Modifier {
    return this.with({ paddingLeft: `${v}px`, paddingRight: `${v}px` });
  }
  paddingVertical(v: number): Modifier {
    return this.with({ paddingTop: `${v}px`, paddingBottom: `${v}px` });
  }
  paddingTop(v: number):    Modifier { return this.with({ paddingTop: `${v}px` }); }
  paddingBottom(v: number): Modifier { return this.with({ paddingBottom: `${v}px` }); }
  paddingLeft(v: number):   Modifier { return this.with({ paddingLeft: `${v}px` }); }
  paddingRight(v: number):  Modifier { return this.with({ paddingRight: `${v}px` }); }

  margin(v: number | string): Modifier {
    return this.with({ margin: typeof v === "number" ? `${v}px` : v });
  }
  marginHorizontal(v: number): Modifier {
    return this.with({ marginLeft: `${v}px`, marginRight: `${v}px` });
  }
  marginVertical(v: number): Modifier {
    return this.with({ marginTop: `${v}px`, marginBottom: `${v}px` });
  }
  marginTop(v: number | string): Modifier {
    return this.with({ marginTop: typeof v === "number" ? `${v}px` : v });
  }
  marginBottom(v: number | string): Modifier {
    return this.with({ marginBottom: typeof v === "number" ? `${v}px` : v });
  }
  marginLeft(v: number | string): Modifier {
    return this.with({ marginLeft: typeof v === "number" ? `${v}px` : v });
  }
  marginRight(v: number | string): Modifier {
    return this.with({ marginRight: typeof v === "number" ? `${v}px` : v });
  }

  background(c: string): Modifier { return this.with({ backgroundColor: c }); }
  color(c: string):      Modifier { return this.with({ color: c }); }
  border(v: string):     Modifier { return this.with({ border: v }); }
  borderRadius(v: number | string): Modifier {
    return this.with({ borderRadius: typeof v === "number" ? `${v}px` : v });
  }
  outline(v: string):  Modifier { return this.with({ outline: v }); }
  boxShadow(v: string): Modifier { return this.with({ boxShadow: v }); }

  width(v: number | string): Modifier {
    return this.with({ width: typeof v === "number" ? `${v}px` : v });
  }
  height(v: number | string): Modifier {
    return this.with({ height: typeof v === "number" ? `${v}px` : v });
  }
  size(v: number): Modifier {
    return this.with({ width: `${v}px`, height: `${v}px` });
  }
  minWidth(v: number | string): Modifier {
    return this.with({ minWidth: typeof v === "number" ? `${v}px` : v });
  }
  maxWidth(v: number | string): Modifier {
    return this.with({ maxWidth: typeof v === "number" ? `${v}px` : v });
  }
  minHeight(v: number | string): Modifier {
    return this.with({ minHeight: typeof v === "number" ? `${v}px` : v });
  }

  opacity(v: number):  Modifier { return this.with({ opacity: v }); }
  cursor(v: string):   Modifier { return this.with({ cursor: v }); }
  zIndex(v: number):   Modifier { return this.with({ zIndex: v }); }
  overflow(v: "visible" | "hidden" | "scroll" | "auto"): Modifier {
    return this.with({ overflow: v });
  }
  overflowX(v: "visible" | "hidden" | "scroll" | "auto"): Modifier {
    return this.with({ overflowX: v });
  }
  overflowY(v: "visible" | "hidden" | "scroll" | "auto"): Modifier {
    return this.with({ overflowY: v });
  }
  whiteSpace(v: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line" | "break-spaces"): Modifier {
    return this.with({ whiteSpace: v });
  }
  position(v: "relative" | "absolute" | "fixed" | "sticky" | "static"): Modifier {
    return this.with({ position: v });
  }
  top(v: number | string):    Modifier { return this.with({ top: typeof v === "number" ? `${v}px` : v }); }
  bottom(v: number | string): Modifier { return this.with({ bottom: typeof v === "number" ? `${v}px` : v }); }
  left(v: number | string):   Modifier { return this.with({ left: typeof v === "number" ? `${v}px` : v }); }
  right(v: number | string):  Modifier { return this.with({ right: typeof v === "number" ? `${v}px` : v }); }

  flex(v: number): Modifier { return this.with({ flex: v }); }
  gap(v: number):  Modifier { return this.with({ gap: `${v}px` }); }

  fontSize(v: number | string): Modifier {
    return this.with({ fontSize: typeof v === "number" ? `${v}px` : v });
  }
  fontWeight(v: number | "bold" | "normal" | "light"): Modifier {
    return this.with({ fontWeight: v });
  }
  fontFamily(v: string): Modifier { return this.with({ fontFamily: v }); }
  textAlign(v: "left" | "center" | "right" | "justify"): Modifier {
    return this.with({ textAlign: v });
  }
  lineHeight(v: number | string): Modifier {
    return this.with({ lineHeight: typeof v === "number" ? `${v}px` : v });
  }
  letterSpacing(v: number | string): Modifier {
    return this.with({ letterSpacing: typeof v === "number" ? `${v}px` : v });
  }
  textDecoration(v: string): Modifier { return this.with({ textDecoration: v }); }

  userSelect(v: "none" | "text" | "all" | "auto"): Modifier {
    return this.with({ userSelect: v });
  }
  pointerEvents(v: "none" | "auto"): Modifier {
    return this.with({ pointerEvents: v });
  }
  transition(v: string): Modifier { return this.with({ transition: v }); }
  transform(v: string):  Modifier { return this.with({ transform: v }); }

  /** Append an additional CSS class name. */
  className(name: string): Modifier {
    return new Modifier(this._styles, [...this._classNames, name]);
  }

  /** Merge another Modifier on top of this one. */
  then(other: Modifier): Modifier {
    return new Modifier(
      { ...this._styles, ...other._styles },
      [...this._classNames, ...other._classNames]
    );
  }

  /** Extract style + className props. */
  toProps(): { style?: CSSProperties; className?: string } {
    const hasStyles = Object.keys(this._styles).length > 0;
    const hasClasses = this._classNames.length > 0;
    return {
      style: hasStyles ? this._styles : undefined,
      className: hasClasses ? this._classNames.join(" ") : undefined,
    };
  }
}

/** Apply a Modifier's styles and className to a DOM element. */
export function applyModifier(el: HTMLElement, mod: Modifier): void {
  const props = mod.toProps();
  if (props.className) el.className = props.className;
  if (props.style) {
    for (const [k, v] of Object.entries(props.style)) {
      if (v !== undefined) (el.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
}
