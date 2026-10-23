import { ButtonLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="text-center">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">This page doesn&apos;t exist, or it belongs to a different account.</p>
        <ButtonLink href="/dashboard" className="mt-5">
          Go to dashboard
        </ButtonLink>
      </Card>
    </div>
  );
}
