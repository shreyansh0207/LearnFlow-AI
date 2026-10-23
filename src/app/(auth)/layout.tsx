import { Logo } from "@/components/brand";
import { SetupRequired } from "@/components/setup-required";
import { readDatabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const env = readDatabaseEnv();
  if (!env.ok) return <SetupRequired errors={env.errors} />;
  return (
    <div className="pt-safe pb-safe relative flex min-h-dvh flex-col items-center px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(15,118,110,0.14),transparent_70%)]" />
      <Logo className="relative" />
      <main id="main" className="relative mt-8 w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
