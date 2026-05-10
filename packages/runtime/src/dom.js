export function createElement(tag, props, children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "style" && value && typeof value === "object") {
            Object.assign(el.style, value);
        }
        else if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (key === "className") {
            el.className = value;
        }
        else {
            el[key] = value;
        }
    }
    for (const child of children) {
        if (child) {
            el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        }
    }
    return el;
}
//# sourceMappingURL=dom.js.map