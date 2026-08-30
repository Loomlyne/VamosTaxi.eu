"use client";

// Presentation only. No @/lib/supabase. Plan 05-16 owns Server Actions.
// Not ported: startPasskey / verifying (no WebAuthn in V1).
// Not ported: surface="ops" (Phase 6). AuthFormProps has no surface prop.

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/core";
import { Input } from "@/components/forms";
import { Tabs } from "@/components/navigation";
import { Alert, ProgressIndicator } from "@/components/feedback";
import type { AuthFormProps, AuthSubmitPayload } from "./types";
import { isVerifiedPath } from "./types";
import "./AuthForm.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function AuthForm({
  mode,
  method,
  stage,
  banner,
  pending = false,
  fieldErrors,
  onModeChange,
  onMethodChange,
  onSubmit,
  onResend,
}: AuthFormProps) {
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [resent, setResent] = useState(false);

  const errors = { ...localErrors, ...fieldErrors };
  const verified = isVerifiedPath(mode, method);
  void verified;

  const heading =
    mode === "signup"
      ? tCommon("create-an-account")
      : mode === "forgot"
        ? tAuth("send-a-new-link")
        : tCommon("sign-in");

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) next.email = tCommon("check-the-email-address");
    if (mode !== "forgot" && method === "password") {
      if (!password) next.password = tCommon("password");
      else if (password.length < 8) next.password = tAuth("password-policy");
    }
    setLocalErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!validate()) return;
    let payload: AuthSubmitPayload;
    if (mode === "forgot") payload = { mode: "forgot", email: email.trim() };
    else if (mode === "signin" && method === "password") {
      payload = { mode: "signin", method: "password", email: email.trim(), password };
    } else if (mode === "signin") {
      payload = { mode: "signin", method: "magic", email: email.trim() };
    } else if (method === "password") {
      payload = {
        mode: "signup",
        method: "password",
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
    } else {
      payload = {
        mode: "signup",
        method: "magic",
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
    }
    onSubmit(payload);
  }

  if (stage === "sent") {
    return (
      <div data-af="1">
        <p className="sr-only" aria-live="polite">
          {tAuth("send-a-new-link")}
        </p>
        <h1>{tAuth("send-a-new-link")}</h1>
        <p>{tAuth("reset-links-work-once-and-only-for-a-short-while")}</p>
        <p>{email}</p>
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setResent(true);
            onResend?.();
          }}
        >
          {tAuth("send-a-new-link")}
        </Button>
        {resent ? <p>{tCommon("sent-again-just-now")}</p> : null}
        <Button variant="ghost" size="md" onClick={() => onModeChange("signin")}>
          {tCommon("sign-in")}
        </Button>
      </div>
    );
  }

  return (
    <form data-af="1" onSubmit={handleSubmit} noValidate>
      <p className="sr-only" aria-live="polite">
        {banner ?? stage}
      </p>
      {mode !== "forgot" ? (
        <Tabs
          variant="segmented"
          block
          value={mode}
          onChange={(v) => onModeChange(v as "signin" | "signup")}
          items={[
            { value: "signin", label: tCommon("sign-in") },
            { value: "signup", label: tCommon("create-an-account") },
          ]}
        />
      ) : null}
      <h1>{heading}</h1>
      <p>{tAuth("you-never-need-an-account-to-book-guest-checkout")}</p>
      {banner === "credentials" ? (
        <Alert tone="danger" title={tCommon("check-the-email-address")}>
          {tCommon("password")}
        </Alert>
      ) : null}
      {banner === "registered" ? (
        <Alert tone="info" title={tCommon("create-an-account")}>
          {tCommon("sign-in")}
        </Alert>
      ) : null}
      <Input
        id={emailId}
        type="email"
        autoComplete="email"
        label={tCommon("email")}
        placeholder={tCommon("enter-your-email-address")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      {mode === "signup" ? (
        <>
          <Input
            label={tCommon("first-name")}
            placeholder={tCommon("enter-your-first-name")}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={errors.firstName}
            autoComplete="given-name"
          />
          <Input
            label={tCommon("last-name")}
            placeholder={tCommon("enter-your-last-name")}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={errors.lastName}
            autoComplete="family-name"
          />
        </>
      ) : null}
      {mode !== "forgot" && method === "password" ? (
        <Input
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          label={tCommon("password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={mode === "signup" ? tAuth("password-policy") : undefined}
        />
      ) : null}
      {mode !== "forgot" ? (
        <button
          type="button"
          className="vt-af-link"
          onClick={() => onMethodChange(method === "password" ? "magic" : "password")}
        >
          {method === "password" ? tAuth("send-a-new-link") : tCommon("password")}
        </button>
      ) : null}
      {mode === "signin" && method === "password" ? (
        <button type="button" className="vt-af-link" onClick={() => onModeChange("forgot")}>
          {tAuth("send-a-new-link")}
        </button>
      ) : null}
      {mode === "forgot" ? (
        <button type="button" className="vt-af-link" onClick={() => onModeChange("signin")}>
          {tCommon("sign-in")}
        </button>
      ) : null}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? <ProgressIndicator size="sm" /> : heading}
      </Button>
    </form>
  );
}
