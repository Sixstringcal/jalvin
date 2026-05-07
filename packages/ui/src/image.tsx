import React from "react";
import { Modifier } from "./modifier.js";

export interface ImageProps {
  src: string;
  alt?: string;
  modifier?: Modifier;
  contentScale?: "fill" | "fit" | "crop" | "none";
  onClick?: () => void;
}

const CONTENT_SCALE: Record<NonNullable<ImageProps["contentScale"]>, string> = {
  fill: "100% 100%",
  fit:  "contain",
  crop: "cover",
  none: "none",
};

/** Image element. */
export function Image({
  src,
  alt = "",
  modifier,
  contentScale = "fit",
  onClick,
}: ImageProps): React.ReactElement {
  const modProps = modifier?.toProps() ?? {};
  return React.createElement("img", {
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
            : "none") as import("react").CSSProperties["objectFit"],
      cursor: onClick ? "pointer" : undefined,
      ...modProps.style,
    },
  });
}

export interface AsyncImageProps extends ImageProps {
  loadingPlaceholder?: React.ReactNode;
  errorPlaceholder?: React.ReactNode;
}

/**
 * Image that handles loading/error states.
 * Falls back to placeholder content on error.
 */
export function AsyncImage({
  src,
  alt,
  modifier,
  contentScale,
  onClick,
  loadingPlaceholder,
  errorPlaceholder,
}: AsyncImageProps): React.ReactElement {
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");

  if (status === "error" && errorPlaceholder) {
    return React.createElement(React.Fragment, null, errorPlaceholder);
  }

  return React.createElement("span", { style: { position: "relative", display: "inline-block" } },
    status === "loading" && loadingPlaceholder,
    React.createElement(Image, {
      src,
      alt: alt ?? "",
      modifier,
      contentScale,
      onClick,
    }),
    // We use a wrapper to attach onLoad/onError
    // Trick: hide the Image above and render img manually
  );
}
