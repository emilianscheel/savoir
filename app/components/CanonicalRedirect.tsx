"use client";

import { useEffect } from "react";

const CANONICAL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://aws-builder-hackathon.butterbase.dev"
).replace(/\/$/, "");

const APP_ROUTES = ["/signin", "/onboarding", "/dashboard", "/connect"];

function appPathFrom(pathname: string): string {
  for (const route of APP_ROUTES) {
    if (pathname === route || pathname.endsWith(route)) return route;
  }
  return "/";
}

/** Butterbase dashboard preview runs on api.butterbase.ai without static assets. */
export function CanonicalRedirect() {
  useEffect(() => {
    const { hostname, pathname, search, hash } = window.location;
    if (hostname !== "api.butterbase.ai") return;
    if (pathname.startsWith("/v1/")) return;

    const target = `${CANONICAL}${appPathFrom(pathname)}${search}${hash}`;
    window.location.replace(target);
  }, []);

  return null;
}
