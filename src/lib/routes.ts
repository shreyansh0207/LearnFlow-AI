export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/journeys",
  "/learning",
  "/library",
  "/learn",
  "/lesson",
  "/quiz",
  "/tutor",
  "/review",
  "/flashcards",
  "/notes",
  "/progress",
  "/history",
  "/profile",
  "/settings",
  "/explore",
  "/topics",
  "/admin",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
