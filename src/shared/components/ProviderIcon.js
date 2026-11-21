"use client";

import PropTypes from "prop-types";

export default function ProviderIcon({
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
      style={{
        width: size,
        height: size,
        color: fallbackColor,
        fontSize: Math.max(10, Math.floor(size * 0.38)),
      }}
      title={alt}
    >
      {fallbackText}
    </span>
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  providerId: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
