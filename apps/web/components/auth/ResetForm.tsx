"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/core";
import { Input } from "@/components/forms";
import { ProgressIndicator } from "@/components/feedback";
import type { ResetFormProps } from "./types";
import "./ResetForm.css";

export function ResetForm({
  stage,
  email,
  pending = false,
  fieldErrors,
  onSubmit,
}: ResetFormProps) {
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const errors = { ...local, ...fieldErrors };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (password.length < 8) next.password = tAuth("password-policy");
    if (confirm !== password) next.confirm = tAuth("both-entries-match");
    setLocal(next);
    if (Object.keys(next).length) return;
    onSubmit(password);
  }

  if (stage === "saved") {
    return (
      <div data-rf="1">
        <p className="sr-only" aria-live="polite">
          {tAuth("password-updated")}
        </p>
        <h1>{tAuth("password-updated")}</h1>
        <p>{tAuth("you-are-signed-in-on-this-device-use-the-new-pas")}</p>
        <Button variant="primary" size="lg" href="/sign-in">
          {tCommon("sign-in")}
        </Button>
      </div>
    );
  }

  if (stage === "expired") {
    return (
      <div data-rf="1">
        <p className="sr-only" aria-live="polite">
          {tAuth("this-link-has-expired")}
        </p>
        <h1>{tAuth("this-link-has-expired")}</h1>
        {/* Law 02: mock used --vt-yellow-600/700 here; charcoal instruction instead. */}
        <p>{tAuth("reset-links-work-once-and-only-for-a-short-while")}</p>
        <Button variant="primary" size="lg" href="/sign-in">
          {tAuth("send-a-new-link")}
        </Button>
      </div>
    );
  }

  return (
    <form data-rf="1" onSubmit={handleSubmit} noValidate>
      <p className="sr-only" aria-live="polite">
        {tAuth("save-new-password")}
      </p>
      <h1>{tAuth("save-new-password")}</h1>
      <p>{tAuth("choose-something-you-dont-use-anywhere-else-it-r")}</p>
      <Input label={tCommon("email")} value={email} readOnly />
      <Input
        type="password"
        autoComplete="new-password"
        label={tCommon("password")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={tAuth("password-policy")}
      />
      <Input
        type="password"
        autoComplete="new-password"
        label={tAuth("confirm-new-password")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      {/* Law 02: mock strength hint used banned yellow; charcoal only. */}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? <ProgressIndicator size="sm" /> : tAuth("save-new-password")}
      </Button>
    </form>
  );
}
