import { useLocation, useParams } from "wouter";

export function usePathname() {
  const [location] = useLocation();
  return location;
}

export function useRouter() {
  const [, setLocation] = useLocation();
  return {
    push: (url) => setLocation(url),
    replace: (url) => setLocation(url, { replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: () => {},
  };
}

export function useSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function notFound() {
  return null;
}

export { useParams };
