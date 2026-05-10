import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";

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
}: CanvasProps): HTMLElement {
  const modProps = modifier?.toProps() ?? {};

  const canvas = jalvinCreateElement("canvas", {
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
  }, []) as HTMLCanvasElement;

  const drawFrame = () => {
    const cssWidth = Math.max(1, Math.floor(width ?? (canvas.clientWidth || 300)));
    const cssHeight = Math.max(1, Math.floor(height ?? (canvas.clientHeight || 150)));
    const dpr = Math.max(1, pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

    const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (clearBeforeDraw) ctx.clearRect(0, 0, cssWidth, cssHeight);
    draw?.(ctx, canvas);
  };

  // In vanilla mode, we trigger draw immediately. 
  // For dynamic resizing, we'd need ResizeObserver which we can set up here.
  if (typeof window !== "undefined") {
    requestAnimationFrame(drawFrame);
    if (width === undefined || height === undefined) {
      const observer = new ResizeObserver(() => drawFrame());
      observer.observe(canvas);
      // Note: No cleanup mechanism here for vanilla version yet
    }
  }

  return canvas;
}
