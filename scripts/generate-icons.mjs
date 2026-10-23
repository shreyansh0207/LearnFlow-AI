// Generates PWA icons, the Apple touch icon, the favicon and iOS splash screens
// from one SVG source. Run with: npm run icons
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = (...p) => path.join(root, ...p);

const gradient = `
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f766e"/>
    <stop offset="0.5" stop-color="#155e75"/>
    <stop offset="1" stop-color="#4338ca"/>
  </linearGradient>`;

// The glyph is drawn in a 64x64 box; `scale` shrinks it toward the centre.
function glyph(scale) {
  const t = (1 - scale) * 32;
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M18 44c8 0 10-6 14-12s6-12 14-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <circle cx="18" cy="44" r="4.5" fill="#fff"/>
    <circle cx="46" cy="20" r="4.5" fill="#99f6e4"/>
  </g>`;
}

// "any" icons: rounded square on transparent background.
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${gradient}</defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>${glyph(1)}</svg>`;

// Maskable/Apple icons: full-bleed background, glyph inside the 80% safe zone.
const fullSvg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${gradient}</defs>
  <rect width="64" height="64" fill="url(#g)"/>${glyph(scale)}</svg>`;

function splashSvg(w, h) {
  const size = Math.round(Math.min(w, h) * 0.28);
  const x = Math.round((w - size) / 2);
  const y = Math.round((h - size) / 2 - h * 0.04);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${gradient}</defs>
    <rect width="${w}" height="${h}" fill="#f6f7f9"/>
    <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="url(#g)"/>${glyph(1)}
    </svg>
    <text x="50%" y="${y + size + Math.round(size * 0.32)}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif"
      font-size="${Math.round(size * 0.18)}" font-weight="600" fill="#0f172a">LearnFlow AI</text>
  </svg>`;
}

const render = (svg, size, file) => sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toFile(file);

// Portrait device sizes in physical pixels, with matching CSS media queries in layout.tsx.
export const SPLASH = [
  { w: 750, h: 1334 },
  { w: 1170, h: 2532 },
  { w: 1179, h: 2556 },
  { w: 1284, h: 2778 },
  { w: 1290, h: 2796 },
  { w: 1640, h: 2360 },
  { w: 2048, h: 2732 },
];

await mkdir(out("public", "icons"), { recursive: true });
await mkdir(out("public", "splash"), { recursive: true });

await Promise.all([
  render(anySvg, 192, out("public", "icons", "icon-192.png")),
  render(anySvg, 512, out("public", "icons", "icon-512.png")),
  render(fullSvg(0.62), 192, out("public", "icons", "maskable-192.png")),
  render(fullSvg(0.62), 512, out("public", "icons", "maskable-512.png")),
  render(fullSvg(0.8), 180, out("public", "apple-touch-icon.png")),
  render(anySvg, 64, out("src", "app", "icon.png")),
  ...SPLASH.map(({ w, h }) => sharp(Buffer.from(splashSvg(w, h))).png().toFile(out("public", "splash", `splash-${w}x${h}.png`))),
]);

console.log("Icons and splash screens generated.");
