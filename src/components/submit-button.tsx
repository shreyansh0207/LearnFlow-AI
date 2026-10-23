"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui";

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
