"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { createNote, deleteNote, updateNote } from "@/app/actions/notes";
import { Alert, Button, Textarea } from "@/components/ui";
import { formatRelative } from "@/lib/learning/dates";

export type NoteItem = { id: string; body: string; updated_at: string; topicTitle?: string | null };

function NoteRow({ note }: { note: NoteItem }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="rounded-xl border border-border p-3">
      {note.topicTitle && <p className="mb-1 text-xs font-medium text-primary">{note.topicTitle}</p>}
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit note" maxLength={20000} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateNote(note.id, text);
                  if (res.error) setError(res.error);
                  else setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.body}</p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {!editing && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{formatRelative(note.updated_at)}</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 hover:bg-surface-2" aria-label="Edit note">
              <Pencil aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this note?")) start(async () => void (await deleteNote(note.id)));
              }}
              className="rounded-lg p-1.5 hover:bg-danger-soft hover:text-danger"
              aria-label="Delete note"
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

export function NotesPanel({ topicId, notes, placeholder = "Write a note…" }: { topicId: string | null; notes: NoteItem[]; placeholder?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createNote({ topicId, body: text });
            if (res.error) setError(res.error);
            else {
              setText("");
              setError(null);
            }
          });
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="New note" maxLength={20000} />
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>
          {pending ? "Saving…" : "Save note"}
        </Button>
      </form>
      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
