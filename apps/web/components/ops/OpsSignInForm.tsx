"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Input } from "@/components/forms/Input";
import { Button } from "@/components/core";

export function OpsSignInForm() {
  const t = useTranslations("ops");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmailError = email.trim() ? null : t("required");
    const nextPasswordError = password ? null : t("required");
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFailed(false);
    if (nextEmailError || nextPasswordError) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          locale,
          mode: "signin",
          method: "password",
          email: email.trim(),
          password,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const ok = Boolean(data && typeof data === "object" && "ok" in data && data.ok === true);
      if (!ok) {
        setFailed(true);
        return;
      }
      window.location.replace("/");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ops-auth__form" onSubmit={onSubmit} noValidate>
      {failed ? <Alert tone="danger">{t("credential-failed")}</Alert> : null}
      <div className="ops-auth__fields">
        <Input
          label={t("email")}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          error={emailError ?? undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label={t("password")}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          error={passwordError ?? undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" variant="primary" size="lg" block disabled={busy} sentenceCase>
        {t("staff-sign-in")}
      </Button>
    </form>
  );
}
