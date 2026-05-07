import React from "react";
import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// TextDecoration
// ---------------------------------------------------------------------------

export class TextDecoration {
  static readonly None = new TextDecoration(0);
  static readonly Underline = new TextDecoration(1);
  static readonly LineThrough = new TextDecoration(2);

  private constructor(readonly mask: number) {}

  /** Combine two decorations (e.g. Underline + LineThrough). */
  plus(other: TextDecoration): TextDecoration {
    return new TextDecoration(this.mask | other.mask);
  }

  toCSSValue(): string | undefined {
    const parts: string[] = [];
    if (this.mask & 1) parts.push("underline");
    if (this.mask & 2) parts.push("line-through");
    return parts.length ? parts.join(" ") : undefined;
  }
}

// ---------------------------------------------------------------------------
// SpanStyle
// ---------------------------------------------------------------------------

export interface SpanStyle {
  color?: string;
  fontSize?: string;
  fontWeight?: number | "bold" | "normal";
  fontStyle?: "italic" | "normal";
  fontFamily?: string;
  letterSpacing?: string;
  background?: string;
  textDecoration?: TextDecoration;
}

export function spanStyleToCSS(styles: SpanStyle[]): CSSProperties {
  const css: CSSProperties = {};
  for (const s of styles) {
    if (s.color !== undefined) css.color = s.color;
    if (s.fontSize !== undefined) css.fontSize = s.fontSize;
    if (s.fontWeight !== undefined) css.fontWeight = s.fontWeight;
    if (s.fontStyle !== undefined) css.fontStyle = s.fontStyle;
    if (s.fontFamily !== undefined) css.fontFamily = s.fontFamily;
    if (s.letterSpacing !== undefined) css.letterSpacing = s.letterSpacing;
    if (s.background !== undefined) css.backgroundColor = s.background;
    if (s.textDecoration !== undefined) {
      const v = s.textDecoration.toCSSValue();
      if (v) css.textDecoration = v;
    }
  }
  return css;
}

// ---------------------------------------------------------------------------
// TextLinkStyles
// ---------------------------------------------------------------------------

export interface TextLinkStyles {
  style?: SpanStyle;
  focusedStyle?: SpanStyle;
  hoveredStyle?: SpanStyle;
  pressedStyle?: SpanStyle;
}

// ---------------------------------------------------------------------------
// LinkAnnotation
// ---------------------------------------------------------------------------

export type LinkAnnotation =
  | { readonly type: "url"; readonly url: string; readonly styles?: TextLinkStyles }
  | { readonly type: "clickable"; readonly tag: string; readonly styles?: TextLinkStyles; readonly onClick: (tag: string) => void };

export const LinkAnnotation = {
  Url(url: string, styles?: TextLinkStyles): LinkAnnotation {
    return { type: "url", url, styles };
  },
  Clickable(tag: string, onClick: (tag: string) => void, styles?: TextLinkStyles): LinkAnnotation {
    return { type: "clickable", tag, styles, onClick };
  },
} as const;

// ---------------------------------------------------------------------------
// AnnotatedString
// ---------------------------------------------------------------------------

export interface StringRange<T> {
  item: T;
  start: number;
  end: number;
}

export interface AnnotatedString {
  readonly text: string;
  readonly spanStyles: ReadonlyArray<StringRange<SpanStyle>>;
  readonly linkAnnotations: ReadonlyArray<StringRange<LinkAnnotation>>;
}

// ---------------------------------------------------------------------------
// AnnotatedString builder
// ---------------------------------------------------------------------------

class AnnotatedStringBuilder {
  private _text = "";
  private readonly _spanStyles: StringRange<SpanStyle>[] = [];
  private readonly _linkAnnotations: StringRange<LinkAnnotation>[] = [];

  private readonly _styleStack: Array<{ style: SpanStyle; start: number }> = [];
  private readonly _linkStack: Array<{ link: LinkAnnotation; start: number }> = [];

  // -- append ---------------------------------------------------------------

  append(text: string): this;
  append(annotated: AnnotatedString): this;
  append(value: string | AnnotatedString): this {
    if (typeof value === "string") {
      this._text += value;
    } else {
      const offset = this._text.length;
      this._text += value.text;
      for (const s of value.spanStyles) {
        this._spanStyles.push({ item: s.item, start: s.start + offset, end: s.end + offset });
      }
      for (const l of value.linkAnnotations) {
        this._linkAnnotations.push({ item: l.item, start: l.start + offset, end: l.end + offset });
      }
    }
    return this;
  }

  // -- withStyle ------------------------------------------------------------

  withStyle(style: SpanStyle, block: () => void): this {
    this.pushStyle(style);
    block();
    this.pop();
    return this;
  }

  pushStyle(style: SpanStyle): this {
    this._styleStack.push({ style, start: this._text.length });
    return this;
  }

  // -- withLink -------------------------------------------------------------

  withLink(link: LinkAnnotation, block: () => void): this {
    this.pushLink(link);
    block();
    this.popLink();
    return this;
  }

  private pushLink(link: LinkAnnotation): void {
    this._linkStack.push({ link, start: this._text.length });
  }

  private popLink(): void {
    const entry = this._linkStack.pop();
    if (entry) {
      this._linkAnnotations.push({ item: entry.link, start: entry.start, end: this._text.length });
    }
  }

  // -- pushStringAnnotation / addStyle / addLink  ---------------------------

  pushStringAnnotation(tag: string, annotation: string): this {
    // Stored as a clickable with no-op handler so it can be queried later;
    // consumers who need click handling should use withLink / addLink instead.
    this.pushLink(LinkAnnotation.Clickable(tag, () => {}) );
    return this;
  }

  addStyle(style: SpanStyle, start: number, end: number): this {
    this._spanStyles.push({ item: style, start, end });
    return this;
  }

  addLink(link: LinkAnnotation, start: number, end: number): this {
    this._linkAnnotations.push({ item: link, start, end });
    return this;
  }

  // -- pop ------------------------------------------------------------------

  pop(): this {
    const styleEntry = this._styleStack.pop();
    if (styleEntry) {
      this._spanStyles.push({ item: styleEntry.style, start: styleEntry.start, end: this._text.length });
    }
    return this;
  }

  // -- build ----------------------------------------------------------------

  build(): AnnotatedString {
    // Flush any unclosed spans/links
    while (this._styleStack.length) this.pop();
    while (this._linkStack.length) this.popLink();

    return {
      text: this._text,
      spanStyles: this._spanStyles.slice(),
      linkAnnotations: this._linkAnnotations.slice(),
    };
  }
}

/** Build an AnnotatedString using a fluent builder block. */
export function buildAnnotatedString(block: (builder: AnnotatedStringBuilder) => void): AnnotatedString {
  const builder = new AnnotatedStringBuilder();
  block(builder);
  return builder.build();
}

// ---------------------------------------------------------------------------
// Rendering helper — converts AnnotatedString to React nodes
// ---------------------------------------------------------------------------

/** Default link style applied when the link has no explicit SpanStyle. */
const defaultLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
};

export function renderAnnotatedString(ann: AnnotatedString): React.ReactNode[] {
  const { text, spanStyles, linkAnnotations } = ann;

  // Collect all segment boundaries
  const positions = new Set<number>([0, text.length]);
  for (const s of spanStyles) {
    positions.add(s.start);
    positions.add(s.end);
  }
  for (const l of linkAnnotations) {
    positions.add(l.start);
    positions.add(l.end);
  }

  const sorted = Array.from(positions).sort((a, b) => a - b);

  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1] as number;
    const segment = text.slice(start, end);
    if (!segment) return null;

    // All spans whose range fully covers this segment
    const activeSpans = spanStyles.filter(s => s.start <= start && s.end >= end).map(s => s.item);
    const activeLinks = linkAnnotations.filter(l => l.start <= start && l.end >= end);

    const css = spanStyleToCSS(activeSpans);

    if (activeLinks.length > 0) {
      const link = activeLinks[0]!.item;

      if (link.type === "url") {
        const linkStyle = link.styles?.style;
        const appliedStyle: CSSProperties = linkStyle
          ? { ...defaultLinkStyle, ...spanStyleToCSS([linkStyle]), ...css }
          : { ...defaultLinkStyle, ...css };

        return React.createElement("a", {
          key: start,
          href: link.url,
          target: "_blank",
          rel: "noopener noreferrer",
          style: appliedStyle,
        }, segment);
      }

      if (link.type === "clickable") {
        const linkStyle = link.styles?.style;
        const appliedStyle: CSSProperties = linkStyle
          ? { ...defaultLinkStyle, ...spanStyleToCSS([linkStyle]), ...css }
          : { ...defaultLinkStyle, ...css };

        return React.createElement("span", {
          key: start,
          role: "link",
          tabIndex: 0,
          style: appliedStyle,
          onClick: () => link.onClick(link.tag),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") link.onClick(link.tag);
          },
        }, segment);
      }
    }

    if (Object.keys(css).length > 0) {
      return React.createElement("span", { key: start, style: css }, segment);
    }

    return segment;
  }).filter(Boolean);
}
