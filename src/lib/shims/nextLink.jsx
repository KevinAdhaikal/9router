import React from "react";
import { Link as WouterLink } from "wouter";

export default function Link({ href, children, prefetch, replace, scroll, shallow, ...props }) {
  return (
    <WouterLink href={href || "#"} {...props}>
      {children}
    </WouterLink>
  );
}
