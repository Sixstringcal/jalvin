// ─────────────────────────────────────────────────────────────────────────────
// Jalvin DOM Runtime — Virtual DOM and Patching
// ─────────────────────────────────────────────────────────────────────────────

export interface VNode {
  tag: string;
  props: Record<string, any>;
  children: Array<VNode | string>;
  el?: Node; // The real DOM node, populated during patch
}

/**
 * Creates a Virtual DOM Node instead of a real element.
 */
export function jalvinCreateElement(
  tag: string | Function,
  props: Record<string, any> | null,
  ...children: any[]
): VNode | any {
  if (typeof tag === "function") {
    // We expect components to return VNodes directly now.
    return (tag as any)(props || {}, children);
  }

  // Flatten children
  const flatChildren: Array<VNode | string> = [];
  const append = (child: any) => {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) {
      child.forEach(append);
    } else if (typeof child === "object" && child.tag) {
      // It's a VNode
      flatChildren.push(child);
    } else if (typeof child === "object" && typeof child.nodeType === "number") {
      // Fallback for native DOM nodes (try to avoid this, but support it if necessary)
      flatChildren.push(child as any);
    } else {
      // Primitives to strings
      flatChildren.push(String(child));
    }
  };

  const childrenArray = Array.isArray(children[0]) && children.length === 1 
    ? children[0] 
    : children;
    
  if (Array.isArray(childrenArray)) {
    childrenArray.forEach(append);
  } else {
    append(childrenArray);
  }

  return { tag: tag as string, props: props || {}, children: flatChildren };
}

/**
 * A basic diffing algorithm to update the DOM without recreating it.
 */
export function patch(parentEl: HTMLElement, newVNode: VNode | string | null, oldVNode?: VNode | string | null, index = 0): void {
  const child = parentEl.childNodes[index];

  if (!oldVNode) {
    // ADD: Node doesn't exist, append it.
    if (newVNode !== null) {
      parentEl.appendChild(createDOMNode(newVNode));
    }
  } else if (!newVNode) {
    // REMOVE: Node exists but new one doesn't. Remove it.
    if (child) parentEl.removeChild(child);
  } else if (changed(newVNode, oldVNode)) {
    // REPLACE: Node type changed entirely.
    if (child) {
      parentEl.replaceChild(createDOMNode(newVNode), child);
    } else {
      parentEl.appendChild(createDOMNode(newVNode));
    }
  } else if (typeof newVNode === "object" && typeof oldVNode === "object" && newVNode.tag === oldVNode.tag) {
    // UPDATE: Same tag, update props and children.
    if (!child) return;

    // Guard: native DOM node (e.g. a stray TextNode) — sync text and bail, no VNode children to recurse.
    if ((newVNode as any).nodeType !== undefined) {
      if ((newVNode as any).nodeType === 3 && child.nodeType === 3) {
        const newText = (newVNode as any).data ?? "";
        if ((child as any).data !== newText) (child as any).data = newText;
      }
      return;
    }

    const el = child as HTMLElement;
    newVNode.el = el;
    updateProps(el, newVNode.props, oldVNode.props);

    // Recursively patch children.
    const newLength = newVNode.children.length;
    const oldLength = oldVNode.children.length;
    const max = Math.max(newLength, oldLength);
    
    // We iterate backwards when removing children to avoid index shifting issues,
    // but a simpler approach for basic patching is forward iteration, then trim.
    for (let i = 0; i < max; i++) {
      patch(el, newVNode.children[i] ?? null, oldVNode.children[i] ?? null, i);
    }
    
    // Trim excess children if old length was greater
    while (el.childNodes.length > newLength) {
      el.removeChild(el.lastChild!);
    }
  }
}

function createDOMNode(vnode: VNode | string): Node {
  if (typeof vnode === "string") {
    return document.createTextNode(vnode);
  }
  
  if (vnode.tag === undefined) {
      // Must be a native DOM node that snuck in
      return vnode as unknown as Node;
  }

  const el = document.createElement(vnode.tag);
  vnode.el = el;

  updateProps(el, vnode.props, {});

  for (const child of vnode.children) {
    el.appendChild(createDOMNode(child));
  }

  return el;
}

function changed(node1: VNode | string, node2: VNode | string): boolean {
  if (typeof node1 !== typeof node2) return true;
  if (typeof node1 === "string" && node1 !== node2) return true;
  if (typeof node1 === "object" && typeof node2 === "object") {
    const nt1 = (node1 as any).nodeType;
    const nt2 = (node2 as any).nodeType;
    if (nt1 !== undefined || nt2 !== undefined) {
      if (nt1 !== nt2) return true;
      if (nt1 === 3) return (node1 as any).data !== (node2 as any).data;
      return false;
    }
    if (node1.tag !== node2.tag) return true;
    // Different keys = different component identity — force full replacement even when tags match.
    // This handles the case where Box/Column/Row all compile to <div> but represent distinct views.
    const k1 = node1.props?.key;
    const k2 = node2.props?.key;
    if (k1 !== undefined && k2 !== undefined && k1 !== k2) return true;
  }
  return false;
}

function updateProps(el: HTMLElement, newProps: Record<string, any>, oldProps: Record<string, any>) {
  // Remove old props
  for (const key in oldProps) {
    if (!(key in newProps)) {
      if (key === "style") {
        el.style.cssText = "";
      } else if (key.startsWith("on")) {
        // We handle event listeners via a unified dispatcher to easily update them
        removeEvent(el, key);
      } else if (key === "className") {
        el.className = "";
      } else {
        (el as any)[key] = undefined;
      }
    }
  }

  // Set new props
  for (const key in newProps) {
    const value = newProps[key];
    const oldValue = oldProps[key];
    
    if (value === oldValue) continue;

    if (key === "style") {
      if (typeof value === "object") {
        // Clear previous style first to handle removed properties
        el.style.cssText = "";
        Object.assign(el.style, value);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      updateEvent(el, key, value);
    } else if (key === "className") {
      el.className = String(value ?? "");
    } else {
      (el as any)[key] = value;
    }
  }
}

// Global event registry for elements so we can easily swap listeners without removing/re-adding DOM listeners constantly.
const eventRegistry = new WeakMap<HTMLElement, Record<string, Function>>();

function getRegistry(el: HTMLElement) {
  let reg = eventRegistry.get(el);
  if (!reg) {
    reg = {};
    eventRegistry.set(el, reg);
  }
  return reg;
}

function updateEvent(el: HTMLElement, propKey: string, handler: Function) {
  const eventName = propKey.slice(2).toLowerCase();
  const reg = getRegistry(el);
  
  if (!reg[eventName]) {
    // Add real DOM listener once
    el.addEventListener(eventName, (e) => {
      const currentHandler = getRegistry(el)[eventName];
      if (currentHandler) {
          // Wrap the native event with React-like synthetic structure for compatibility with existing UI code
          currentHandler(e);
      }
    });
  }
  
  // Just update the stored reference
  reg[eventName] = handler;
}

function removeEvent(el: HTMLElement, propKey: string) {
  const eventName = propKey.slice(2).toLowerCase();
  const reg = getRegistry(el);
  if (reg[eventName]) {
    delete reg[eventName];
  }
}

