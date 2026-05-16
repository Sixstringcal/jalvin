import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";
import { MutableStateFlow, remember, collectAsState, DisposableEffect } from "@jalvin/runtime";
import type { VNode } from "@jalvin/runtime";

export interface ImageProps {
  src: string;
  alt?: string;
  modifier?: Modifier;
  contentScale?: "fill" | "fit" | "crop" | "none";
  onClick?: () => void;
}

/** Image element. */
export function Image({
  src,
  alt = "",
  modifier,
  contentScale = "fit",
  onClick,
}: ImageProps): VNode {
  const modProps = modifier?.toProps() ?? {};
  return jalvinCreateElement("img", {
    src,
    alt,
    onClick,
    ...modProps,
    style: {
      objectFit: (contentScale === "fill"
        ? "fill"
        : contentScale === "fit"
          ? "contain"
          : contentScale === "crop"
            ? "cover"
            : "none"),
      cursor: onClick ? "pointer" : undefined,
      ...modProps.style,
    },
  }, []);
}

export interface AsyncImageProps extends ImageProps {
  loadingPlaceholder?: VNode;
  errorPlaceholder?: VNode;
}

/**
 * Image that handles loading/error states.
 * Must be called within a composable context (inside render() or a component fun).
 */
export function AsyncImage({
  src,
  alt,
  modifier,
  contentScale,
  onClick,
  loadingPlaceholder,
  errorPlaceholder,
}: AsyncImageProps): VNode {
  // remember() ensures the MutableStateFlow persists across re-renders of the parent
  const status = remember(() => new MutableStateFlow<"loading" | "ok" | "error">("loading"));

  // collectAsState() subscribes to status and triggers parent re-render on change
  const currentStatus = collectAsState(status);

  // DisposableEffect re-runs whenever src changes, kicks off the load and resets status
  DisposableEffect([src], () => {
    status.value = "loading";
    const img = new window.Image();
    img.onload = () => { status.value = "ok"; };
    img.onerror = () => { status.value = "error"; };
    img.src = src;
    return () => { img.onload = null; img.onerror = null; };
  });

  if (currentStatus === "error" && errorPlaceholder) {
    return errorPlaceholder;
  }
  if (currentStatus === "loading" && loadingPlaceholder) {
    return loadingPlaceholder;
  }
  return Image({ src, alt, modifier, contentScale, onClick });
}
