"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Input } from "@/components/forms/Input";
import { Button } from "@/components/core";
import {
  staffListVerifiedFactor,
  staffMfaChallenge,
  staffMfaVerify,
} from "@/lib/auth/staff-ops";

function safeNext(value: string | null): string {
  if (!value) return "/ops";
  if (!value.startsWith("/")) return "/ops";
  if (value.startsWith("//") || value.includes("://")) return "/ops";
  return value;
}

export function OpsMfaChallengeForm() {
  const t = useTranslations("ops");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const listed = await staffListVerifiedFactor();
      if (cancelled) return;
      if (!listed.enrolled) {
        router.replace("/ops/accept-invite");
        return;
      }
      setFactorId(listed.factorId);
      const challenged = await staffMfaChallenge(listed.factorId);
      if (cancelled) return;
      if (!challenged.ok) {
        setFailed(true);
        return;
      }
      setChallengeId(challenged.challengeId);
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function refreshChallenge(id: string) {
    const challenged = await staffMfaChallenge(id);
    if (challenged.ok) setChallengeId(challenged.challengeId);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    setFailed(false);
    const result = await staffMfaVerify({
      factorId,
      challengeId,
      code,
      next: safeNext(searchParams.get("next")),
    });
    if (!result.ok) {
      setFailed(true);
      setBusy(false);
      await refreshChallenge(factorId);
      return;
    }
    router.replace(result.href);
  }

  return (
    <form className="ops-auth__form" onSubmit={onSubmit} noValidate>
      {failed ? <Alert tone="danger">{t("mfa-failed")}</Alert> : null}
      <div className="ops-auth__fields">
        <Input
          className="vt-dir-keep"
          label={t("authentication-code")}
          hint={t("enter-the-code-from-your-app")}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          name="code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
        />
      </div>
      <Button type="submit" variant="primary" size="lg" block disabled={busy || !challengeId} sentenceCase>
        {t("verify-code")}
      </Button>
    </form>
  );
}
