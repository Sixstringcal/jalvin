import { Modifier } from "./modifier.js";
import { jalvinCreateElement } from "@jalvin/runtime";
import { mutableStateOf } from "@jalvin/runtime";

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
}: ImageProps): HTMLElement {
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
  loadingPlaceholder?: Node;
  errorPlaceholder?: Node;
}

/**
 * Image that handles loading/error states.
 */
export function AsyncImage({
  src,
  alt,
  modifier,
  contentScale,
  onClick,
  loadingPlaceholder,
  errorPlaceholder,
}: AsyncImageProps): HTMLElement {
  const status = mutableStateOf<"loading" | "ok" | "error">("loading");
  
  const container = jalvinCreateElement("span", { 
    style: { position: "relative", display: "inline-block" } 
  }, []);

  const img = new window.Image();
  img.src = src;
  img.alt = alt ?? "";
  img.onload = () => { status.value = "ok"; };
  img.onerror = () => { status.value = "error"; };

  // Simple reactive container update
  // In a full implementation, the render loop handles this.
  // For AsyncImage, we'll manually manage the internal switch.
  
  const update = () => {
    container.innerHTML = "";
    if (status.value === "error" && errorPlaceholder) {
      container.appendChild(errorPlaceholder);
    } else {
      if (status.value === "loading" && loadingPlaceholder) {
        container.appendChild(loadingPlaceholder);
      }
      container.appendChild(Image({ src, alt, modifier, contentScale, onClick }));
    }
  };

  // Subscribe to status changes manually for this internal reactivity
  (status as any).subscribers?.add(update);
  update();

  return container;
}
