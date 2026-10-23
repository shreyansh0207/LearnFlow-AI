import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <article className="prose-lesson mx-auto max-w-3xl px-4 py-12 text-[15px] sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="text-sm text-muted">Template — review with your legal adviser and fill in the bracketed details before launch. Last updated: [date].</p>

      <h3>Who we are</h3>
      <p>LearnFlow AI (&quot;LearnFlow&quot;, &quot;we&quot;) is operated by [company name, address]. Contact: [privacy email].</p>

      <h3>What we collect</h3>
      <ul>
        <li><strong>Account data:</strong> email address, password (stored only as a secure hash by our authentication provider), display name and timezone.</li>
        <li><strong>Learning data:</strong> the subjects, goals and preferences you enter; generated curricula and lessons; lesson sessions and study time; quiz answers and scores; mastery estimates; review history; notes, bookmarks and tutor conversations.</li>
        <li><strong>Technical data:</strong> standard server logs (IP address, browser type, timestamps) used for security and reliability.</li>
      </ul>

      <h3>How we use it</h3>
      <ul>
        <li>To provide the service: personalise your roadmap, lessons, quizzes, reviews and recommendations.</li>
        <li>To keep the service secure, prevent abuse and enforce usage limits.</li>
        <li>We do not sell your personal data and we do not use it for advertising.</li>
      </ul>

      <h3>AI processing</h3>
      <p>
        To generate lessons, quizzes and tutor replies, we send the relevant learning context (for example your subject, goal, recent topics and quiz results) to our AI provider, Google (Gemini API), which processes it on our behalf under its terms. Only what&apos;s needed is sent: topic titles, levels, scores and the concepts you missed — never your password, email or private notes. Do not enter sensitive personal information into the tutor.
      </p>

      <h3>Knowledge catalog and topic requests</h3>
      <p>
        When you search for something to learn, we record the normalised topic (for example &quot;underwater photography&quot;) with a running count, so we can see which subjects people want and improve the catalog. These records are anonymous and are not linked to your account. If your search leads to a new topic being added to the shared catalog, only the topic itself (never your goal or history) becomes visible to other learners.
      </p>

      <h3>External sources</h3>
      <p>
        To ground curricula in reliable material, the server sends the topic name (never your personal data) to public reference services such as Wikipedia and OpenAlex, and stores the titles, links and short attributed snippets they return.
      </p>

      <h3>Storage and security</h3>
      <p>
        Data is stored in a PostgreSQL database hosted by Neon ([region]), including your account and sign-in sessions. Passwords are stored only as salted scrypt hashes. Row-level security ensures each account can access only its own records. Connections are encrypted with HTTPS. Lessons you choose to &quot;save for offline&quot; are stored only on your device and removed when you sign out.
      </p>

      <h3>Retention and deletion</h3>
      <p>
        We keep your data while your account is active. You can delete your account at any time from Settings; this permanently deletes your account and all learning data. Backups are purged within [30] days.
      </p>

      <h3>Your rights</h3>
      <p>Depending on where you live, you may have rights to access, correct, export or delete your data, and to object to processing. Contact [privacy email] to exercise them.</p>

      <h3>Children</h3>
      <p>LearnFlow is not directed to children under [13/16]. If you believe a child has provided us data, contact us and we will delete it.</p>

      <h3>Changes</h3>
      <p>We will notify you of material changes by email or in the app.</p>
    </article>
  );
}
