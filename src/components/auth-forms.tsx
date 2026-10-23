"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { changePassword, requestPasswordReset, resetPassword, signIn, signUp, type FormState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Input, Label } from "@/components/ui";
import { clearDeviceLearningData } from "@/lib/saved-lessons";

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-danger">
      {msg}
    </p>
  );
}

function PasswordInput({ name, autoComplete, error, label = "Password" }: { name: string; autoComplete: string; error?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
        >
          {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        </button>
      </div>
      <FieldError id={`${name}-error`} msg={error} />
    </div>
  );
}

/** Full navigation after sign-in so the next request carries the new session cookie. */
function useRedirectOnSuccess(state: FormState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
}

function Status({ state }: { state: FormState }) {
  if (state?.error) return <Alert kind="error">{state.error}</Alert>;
  if (state?.message) return <Alert kind="success">{state.message}</Alert>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  useRedirectOnSuccess(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Status state={state} />
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.values?.email} key={state?.values?.email} aria-invalid={Boolean(state?.fieldErrors?.email)} />
        <FieldError id="email-error" msg={state?.fieldErrors?.email} />
      </div>
      <PasswordInput name="password" autoComplete="current-password" error={state?.fieldErrors?.password} />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signUp, null);
  useRedirectOnSuccess(state);
  if (state?.message) return <Status state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Status state={state} />
      <div>
        <Label htmlFor="displayName">Your name <span className="font-normal text-muted">(optional)</span></Label>
        <Input id="displayName" name="displayName" autoComplete="given-name" maxLength={80} defaultValue={state?.values?.displayName} key={state?.values?.displayName} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.values?.email} key={state?.values?.email} aria-invalid={Boolean(state?.fieldErrors?.email)} />
        <FieldError id="email-error" msg={state?.fieldErrors?.email} />
      </div>
      <PasswordInput name="password" autoComplete="new-password" error={state?.fieldErrors?.password} />
      <p className="text-xs text-muted">At least 8 characters.</p>
      <SubmitButton className="w-full" size="lg" pendingText="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-xs text-muted">
        By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Status state={state} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <FieldError id="email-error" msg={state?.fieldErrors?.email} />
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, null);
  useRedirectOnSuccess(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Status state={state} />
      <PasswordInput name="password" autoComplete="new-password" label="New password" error={state?.fieldErrors?.password} />
      <PasswordInput name="confirm" autoComplete="new-password" label="Confirm new password" error={state?.fieldErrors?.confirm} />
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">
        Update password
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Status state={state} />
      <PasswordInput name="current" autoComplete="current-password" label="Current password" error={state?.fieldErrors?.current} />
      <PasswordInput name="password" autoComplete="new-password" label="New password" error={state?.fieldErrors?.password} />
      <PasswordInput name="confirm" autoComplete="new-password" label="Confirm new password" error={state?.fieldErrors?.confirm} />
      <SubmitButton pendingText="Saving…">Change password</SubmitButton>
    </form>
  );
}

/** Clears offline lesson copies and pending sync data on this device, then signs out on the server. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" onSubmit={() => clearDeviceLearningData()}>
      <Button type="submit" variant="secondary" className={className}>
        <LogOut aria-hidden className="size-4" /> Sign out
      </Button>
    </form>
  );
}
