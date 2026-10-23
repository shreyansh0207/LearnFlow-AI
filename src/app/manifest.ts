import type { MetadataRoute } from "next";

export const THEME_COLOR = "#0f766e";
export const BACKGROUND_COLOR = "#f6f7f9";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LearnFlow AI",
    short_name: "LearnFlow",
    description: "Learn anything from zero with a personalised AI learning path, spaced revision and progress that remembers you.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ["education", "productivity"],
    lang: "en",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Daily review", short_name: "Review", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Continue learning", short_name: "Learn", url: "/learn", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
