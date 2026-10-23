import { Logo } from "@/components/brand";
import { Alert, Card } from "@/components/ui";

/** Shown instead of a crash when required server configuration is missing. */
export function SetupRequired({ errors }: { errors: string[] }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Logo />
      <Card className="mt-6">
        <h1 className="text-xl font-semibold">Setup required</h1>
        <p className="mt-2 text-sm text-muted">
          LearnFlow can&apos;t connect to its database yet. An administrator needs to finish configuration before accounts and learning data can work.
        </p>
        <Alert kind="warn" className="mt-4" title="Missing configuration">
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Create a Neon Postgres database and copy its connection string.</li>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and set <code>DATABASE_URL</code>.</li>
          <li>Run <code>npm run db:migrate</code>, then restart the server. See README.md for the full guide.</li>
        </ol>
      </Card>
    </div>
  );
}
