import React from "react";

export default function Image({ src, alt, width, height, className, priority, unoptimized, ...props }) {
  // If src is an imported object with .src, use that
  const resolvedSrc = typeof src === "object" && src?.src ? src.src : src;
  return (
    <img
      src={resolvedSrc}
      alt={alt || ""}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
      {...props}
    />
  );
}
