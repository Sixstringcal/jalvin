import { describe, it, expect, beforeEach } from "vitest";
import { patch } from "../dom.js";
import type { VNode } from "../dom.js";

/** Build a plain VNode without going through jalvinCreateElement. */
function el(tag: string, props: Record<string, any> = {}, ...children: (VNode | string)[]): VNode {
  return { tag, props, children };
}

describe("patch() — key-based component identity", () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  // ── baseline: tag change always replaces ──────────────────────────────────

  it("replaces DOM node when tag changes (baseline)", () => {
    const v1 = el("div");
    const v2 = el("span");
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node2!.tagName).toBe("SPAN");
    expect(node1).not.toBe(node2);
  });

  // ── same tag, no key → morph ──────────────────────────────────────────────

  it("morphs in place when same tag and no key", () => {
    const v1 = el("div", { id: "old" });
    const v2 = el("div", { id: "new" });
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).toBe(node2);
    expect((node2 as HTMLElement).id).toBe("new");
  });

  // ── same tag, different keys → replace ───────────────────────────────────

  it("replaces DOM node when same tag but different keys", () => {
    const v1 = el("div", { key: "view-a" });
    const v2 = el("div", { key: "view-b" });
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).not.toBe(node2);
  });

  it("replaces entire subtree when root key changes", () => {
    const v1 = el("div", { key: "a" }, el("input", { id: "login-input" }));
    const v2 = el("div", { key: "b" }, el("button", { id: "submit-btn" }));
    patch(container, v1, null);
    expect(container.querySelector("#login-input")).not.toBeNull();
    patch(container, v2, v1);
    expect(container.querySelector("#login-input")).toBeNull();
    expect(container.querySelector("#submit-btn")).not.toBeNull();
  });

  // ── same tag, matching keys → morph ──────────────────────────────────────

  it("morphs in place when same tag and matching keys", () => {
    const v1 = el("div", { key: "view-a", id: "before" });
    const v2 = el("div", { key: "view-a", id: "after" });
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).toBe(node2);
    expect((node2 as HTMLElement).id).toBe("after");
  });

  it("updates children in place when key is unchanged", () => {
    const v1 = el("div", { key: "home" }, el("span", {}, "old text"));
    const v2 = el("div", { key: "home" }, el("span", {}, "new text"));
    patch(container, v1, null);
    const root1 = container.firstElementChild;
    patch(container, v2, v1);
    const root2 = container.firstElementChild;
    expect(root1).toBe(root2);
    expect(root2!.querySelector("span")!.textContent).toBe("new text");
  });

  // ── partial key presence → morph (no confident identity) ─────────────────

  it("morphs when only the new VNode carries a key", () => {
    const v1 = el("div");
    const v2 = el("div", { key: "view-b" });
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).toBe(node2);
  });

  it("morphs when only the old VNode carried a key", () => {
    const v1 = el("div", { key: "view-a" });
    const v2 = el("div");
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).toBe(node2);
  });

  // ── key works for non-div tags too ───────────────────────────────────────

  it("replaces keyed sections even when both are <section>", () => {
    const v1 = el("section", { key: "panel-1" });
    const v2 = el("section", { key: "panel-2" });
    patch(container, v1, null);
    const node1 = container.firstElementChild;
    patch(container, v2, v1);
    const node2 = container.firstElementChild;
    expect(node1).not.toBe(node2);
    expect(node2!.tagName).toBe("SECTION");
  });
});
