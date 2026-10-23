"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>LearnFlow hit an unexpected error</h1>
        <p style={{ color: "#5b6678" }}>Your saved progress is safe. Please try again.</p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", borderRadius: 10, border: 0, background: "#0f766e", color: "#fff" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
