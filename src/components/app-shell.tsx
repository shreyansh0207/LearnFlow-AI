"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChartLine,
  GraduationCap,
  History,
  House,
  Layers,
  Library,
  MessageCircle,
  RotateCcw,
  Search,
  Settings,
  StickyNote,
  User,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { InstallButton } from "@/components/pwa/install";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/learning", label: "My Learning", icon: BookOpen },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/review", label: "Review", icon: RotateCcw },
  { href: "/profile", label: "Profile", icon: User },
];

const SECONDARY = [
  { href: "/explore", label: "Explore any topic", icon: Search },
  { href: "/tutor", label: "AI Tutor", icon: MessageCircle },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/notes", label: "Notes & bookmarks", icon: StickyNote },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/history", label: "History", icon: History },
  { href: "/library", label: "Knowledge library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/learn") return pathname === "/learn" || pathname.startsWith("/lesson") || pathname.startsWith("/quiz");
  if (href === "/learning") return pathname === "/learning" || pathname.startsWith("/journeys");
  if (href === "/explore") return pathname === "/explore" || pathname.startsWith("/topics");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, displayName }: { children: ReactNode; displayName: string }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <nav aria-label="Main" className="mt-6 flex-1 space-y-0.5 overflow-y-auto">
          {[...PRIMARY.slice(0, 4), ...SECONDARY].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive(pathname, href) ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon aria-hidden className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border pt-3">
          <InstallButton className="w-full justify-start" />
          <Link
            href="/profile"
            className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-surface-2", isActive(pathname, "/profile") && "bg-primary-soft")}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate font-medium">{displayName}</span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Logo href="/dashboard" />
            <div className="flex items-center gap-1">
              <InstallButton compact />
              <Link href="/explore" aria-label="Explore any topic" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
                <Search aria-hidden className="size-5" />
              </Link>
              <Link href="/tutor" aria-label="AI Tutor" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
                <MessageCircle aria-hidden className="size-5" />
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="mb-bottom-nav mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:mb-0 lg:px-10 lg:py-10">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
          <ul className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5">
            {PRIMARY.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted")}
                  >
                    <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export const MORE_LINKS = SECONDARY;
