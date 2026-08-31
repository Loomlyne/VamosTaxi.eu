"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Input } from "@/components/forms/Input";
import { Button } from "@/components/core";
import type { ChallengeTotp, StartTotpEnrol, VerifyTotpAndClaim } from "@/lib/ops/invite";

type OpsTotpEnrolProps = {
  startEnrol: StartTotpEnrol;
  challenge: ChallengeTotp;
  verifyAndClaim: VerifyTotpAndClaim;
};

export function OpsTotpEnrol({ startEnrol, challenge, verifyAndClaim }: OpsTotpEnrolProps) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [claimWarning, setClaimWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enrolFailed, setEnrolFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      // Abandoned-attempt branch: mfa.unenroll any stale unverified TOTP
      // factor, then mfa.enroll a fresh one. Re-entry must not accumulate
      // factors. QR + secret come from supabase.auth.mfa.enroll — no QR library.
      const enrolled = await startEnrol();
      if (cancelled) return;
      if (!enrolled.ok) {
        setEnrolFailed(true);
        return;
      }
      setFactorId(enrolled.factorId);
      setQrCode(enrolled.qrCode);
      setSecret(enrolled.secret);
      const challenged = await challenge(enrolled.factorId);
      if (cancelled) return;
      if (!challenged.ok) {
        setEnrolFailed(true);
        return;
      }
      setChallengeId(challenged.challengeId);
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [startEnrol, challenge]);

  async function refreshChallenge(id: string) {
    const challenged = await challenge(id);
    if (challenged.ok) setChallengeId(challenged.challengeId);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    setFailed(false);
    const result = await verifyAndClaim({ factorId, challengeId, code });
    if (!result.ok) {
      setFailed(true);
      setBusy(false);
      await refreshChallenge(factorId);
      return;
    }
    if (!result.claimed) setClaimWarning(true);
    router.replace("/ops");
  }

  return (
    <form className="ops-auth__form" onSubmit={onSubmit} noValidate data-ops-totp-enrol="">
      {enrolFailed ? <Alert tone="danger">{t("auth.enrol-failed")}</Alert> : null}
      {failed ? <Alert tone="danger">{t("mfa-failed")}</Alert> : null}
      {claimWarning ? <Alert tone="info">{t("auth.claim-incomplete")}</Alert> : null}
      {qrCode ? (
        <img
          src={qrCode}
          alt={t("auth.qr-alt")}
          style={{ inlineSize: "180px", blockSize: "180px" }}
        />
      ) : null}
      {secret ? (
        <div>
          <p style={{ marginBlock: 0 }}>{t("auth.secret-label")}</p>
          <p
            className="vt-dir-keep"
            data-totp-secret=""
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              userSelect: "all",
              marginBlock: 0,
            }}
          >
            {secret}
          </p>
        </div>
      ) : null}
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
