import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8", className)}>
      <defs>
        <linearGradient id="lf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="0.5" stopColor="#155e75" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lf-g)" />
      <path d="M18 44c8 0 10-6 14-12s6-12 14-12" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="18" cy="44" r="4.5" fill="#fff" />
      <circle cx="46" cy="20" r="4.5" fill="#99f6e4" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight text-ink", className)} aria-label="LearnFlow AI home">
      <LogoMark />
      <span>
        LearnFlow <span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}
