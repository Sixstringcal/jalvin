import React from "react";
import { Modifier } from "./modifier.js";

export interface CanvasProps extends Omit<React.CanvasHTMLAttributes<HTMLCanvasElement>, "children" | "style" | "width" | "height"> {
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
}

function joinClassNames(...classNames: Array<string | undefined>): string | undefined {
  const value = classNames.filter(Boolean).join(" ").trim();
  return value.length > 0 ? value : undefined;
}

/** Canvas drawing surface — analogous to Compose's Canvas. */
export function Canvas({
  modifier,
  width,
  height,
  draw,
  clearBeforeDraw = true,
  pixelRatio,
  className,
  ...domProps
}: CanvasProps): React.ReactElement {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const modProps = modifier?.toProps() ?? {};

  const drawFrame = React.useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;

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
  }, [clearBeforeDraw, draw, height, pixelRatio, width]);

  React.useLayoutEffect(() => {
    drawFrame();
  }, [drawFrame]);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width !== undefined || height !== undefined || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      drawFrame();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawFrame, height, width]);

  return React.createElement("canvas", {
    ref,
    ...domProps,
    className: joinClassNames(modProps.className, className),
    style: {
      width: width !== undefined ? `${width}px` : undefined,
      height: height !== undefined ? `${height}px` : undefined,
      ...modProps.style,
    } as React.CSSProperties,
  });
}