import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaProvider, INSTALL_CAPTURE_SCRIPT } from "@/components/pwa/pwa-provider";
import { PwaStatusBar } from "@/components/pwa/status-bar";
import { siteUrl } from "@/lib/env";

// iOS launch screens: physical size → CSS size and pixel ratio.
const SPLASH = [
  { w: 750, h: 1334, dw: 375, dh: 667, r: 2 },
  { w: 1170, h: 2532, dw: 390, dh: 844, r: 3 },
  { w: 1179, h: 2556, dw: 393, dh: 852, r: 3 },
  { w: 1284, h: 2778, dw: 428, dh: 926, r: 3 },
  { w: 1290, h: 2796, dw: 430, dh: 932, r: 3 },
  { w: 1640, h: 2360, dw: 820, dh: 1180, r: 2 },
  { w: 2048, h: 2732, dw: 1024, dh: 1366, r: 2 },
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "LearnFlow AI — Learn anything from zero", template: "%s · LearnFlow AI" },
  description: "A personalised AI learning companion: structured roadmaps, adaptive lessons, spaced revision and progress that remembers you.",
  applicationName: "LearnFlow AI",
  appleWebApp: {
    capable: true,
    title: "LearnFlow",
    statusBarStyle: "default",
    startupImage: SPLASH.map((s) => ({
      url: `/splash/splash-${s.w}x${s.h}.png`,
      media: `(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`,
    })),
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Captures the install prompt before React hydrates, so it is never missed. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <PwaProvider>
          <PwaStatusBar />
          {children}
        </PwaProvider>
      </body>
    </html>
  );
}
