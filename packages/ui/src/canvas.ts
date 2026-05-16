import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";
import type { VNode } from "@jalvin/runtime";

export interface CanvasProps {
  modifier?: Modifier;
  /** CSS pixel width of the canvas drawing surface. */
  width?: number;
  /** CSS pixel height of the canvas drawing surface. */
  height?: number;
  /** Draw callback, invoked after the backing canvas is sized and scaled for DPR. */
  draw?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
  /** Clear the visible canvas area before running draw(). */
  clearBeforeDraw?: boolean;
  /** Override devicePixelRatio used for backing-store scaling. */
  pixelRatio?: number;
  className?: string;
}

function joinClassNames(...classNames: Array<string | undefined>): string | undefined {
  const value = classNames.filter(Boolean).join(" ").trim();
  return value.length > 0 ? value : undefined;
}

/** Canvas drawing surface. */
export function Canvas({
  modifier,
  width,
  height,
  draw,
  clearBeforeDraw = true,
  pixelRatio,
  className,
}: CanvasProps): VNode {
  const modProps = modifier?.toProps() ?? {};

  // jalvinCreateElement returns a VNode, not a real DOM element.
  // The patch system sets vnode.el to the real HTMLCanvasElement after mount.
  // requestAnimationFrame fires after the current synchronous patch completes,
  // so vnode.el is guaranteed to be set by the time drawFrame runs.
  const vnode = jalvinCreateElement("canvas", {
    className: joinClassNames(modProps.className, className),
    onMouseEnter: modProps.onMouseEnter,
    onMouseLeave: modProps.onMouseLeave,
    onFocus: modProps.onFocus,
    onBlur: modProps.onBlur,
    onMouseDown: modProps.onMouseDown,
    onMouseUp: modProps.onMouseUp,
    onTouchStart: modProps.onTouchStart,
    onTouchEnd: modProps.onTouchEnd,
    onTouchCancel: modProps.onTouchCancel,
    style: {
      width: width !== undefined ? `${width}px` : undefined,
      height: height !== undefined ? `${height}px` : undefined,
      ...modProps.style,
    },
  }, []);

  if (typeof window !== "undefined") {
    requestAnimationFrame(() => {
      // Access the real DOM element via vnode.el, set by the patch system on mount.
      const el = vnode.el as HTMLCanvasElement | undefined;
      if (!el || typeof el.getContext !== "function") return;

      const cssWidth = Math.max(1, Math.floor(width ?? (el.clientWidth || 300)));
      const cssHeight = Math.max(1, Math.floor(height ?? (el.clientHeight || 150)));
      const dpr = Math.max(1, pixelRatio ?? (window.devicePixelRatio || 1));

      const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
      const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));
      if (el.width !== backingWidth) el.width = backingWidth;
      if (el.height !== backingHeight) el.height = backingHeight;

      const ctx = el.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (clearBeforeDraw) ctx.clearRect(0, 0, cssWidth, cssHeight);
      draw?.(ctx, el);

      // ResizeObserver for fluid-width canvases (width/height not explicitly set)
      if (width === undefined || height === undefined) {
        const observer = new ResizeObserver(() => {
          const rEl = vnode.el as HTMLCanvasElement | undefined;
          if (!rEl) return;
          const rw = Math.max(1, Math.floor(rEl.clientWidth || 300));
          const rh = Math.max(1, Math.floor(rEl.clientHeight || 150));
          const rDpr = Math.max(1, window.devicePixelRatio || 1);
          if (rEl.width !== Math.floor(rw * rDpr)) rEl.width = Math.floor(rw * rDpr);
          if (rEl.height !== Math.floor(rh * rDpr)) rEl.height = Math.floor(rh * rDpr);
          const rCtx = rEl.getContext("2d");
          if (!rCtx) return;
          rCtx.setTransform(rDpr, 0, 0, rDpr, 0, 0);
          if (clearBeforeDraw) rCtx.clearRect(0, 0, rw, rh);
          draw?.(rCtx, rEl);
        });
        observer.observe(el);
      }
    });
  }

  return vnode;
}
