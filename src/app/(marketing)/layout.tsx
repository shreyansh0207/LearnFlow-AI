import Link from "next/link";
import { Logo } from "@/components/brand";
import { InstallButton } from "@/components/pwa/install";
import { ButtonLink } from "@/components/ui";
import { getOptionalUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/features" className="hover:text-ink">Features</Link>
            <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
            <Link href="/install" className="hover:text-ink">Get the app</Link>
          </nav>
          <div className="flex items-center gap-2">
            <InstallButton compact className="hidden sm:inline-flex" />
            {user ? (
              <ButtonLink href="/dashboard" size="sm">Open app</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm">Log in</ButtonLink>
                <ButtonLink href="/signup" size="sm">Start free</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="pb-safe border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted sm:grid-cols-[1fr_auto] sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm">Learn anything from zero. Follow your own path. Remember what matters.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2">
            <Link href="/features" className="hover:text-ink">Features</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/install" className="hover:text-ink">Install the app</Link>
            <Link href="/login" className="hover:text-ink">Log in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
