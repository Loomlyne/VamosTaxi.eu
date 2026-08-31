"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Input } from "@/components/forms/Input";
import { Button } from "@/components/core";
import { StepIndicator } from "@/components/navigation/StepIndicator";
import { OpsTotpEnrol } from "./OpsTotpEnrol";
import type {
  ChallengeTotp,
  EstablishInviteSession,
  SetInvitePassword,
  StartTotpEnrol,
  VerifyTotpAndClaim,
} from "@/lib/ops/invite";

export type OpsAcceptInviteProps = {
  establishSession: EstablishInviteSession;
  setPassword: SetInvitePassword;
  startEnrol: StartTotpEnrol;
  challenge: ChallengeTotp;
  verifyAndClaim: VerifyTotpAndClaim;
};

export function OpsAcceptInvite({
  establishSession,
  setPassword,
  startEnrol,
  challenge,
  verifyAndClaim,
}: OpsAcceptInviteProps) {
  const t = useTranslations("ops");
  const [step, setStep] = useState<0 | 1>(0);
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const fromHash = new URLSearchParams(hash);
    const accessToken = fromHash.get("access_token");
    const refreshToken = fromHash.get("refresh_token");
    const code = new URLSearchParams(window.location.search).get("code");
    if (accessToken && refreshToken) {
      void establishSession({ accessToken, refreshToken }).then(() => {
        history.replaceState(null, "", window.location.pathname);
      });
    } else if (code) {
      void establishSession({ code });
    }
  }, [establishSession]);

  async function onSubmitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPasswordError = password.length >= 8 ? null : t("at-least-8-characters");
    const nextConfirmError =
      confirm.length === 0 ? t("required") : password === confirm ? null : t("auth.passwords-must-match");
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFailed(false);
    if (nextPasswordError || nextConfirmError) return;

    setBusy(true);
    const result = await setPassword(password);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setStep(1);
  }

  const steps = [
    t("auth.step-password"),
    t("auth.step-scan"),
    t("auth.step-confirm"),
  ];

  return (
    <div data-ops-accept-invite="" data-ops-step={step === 0 ? "password" : "enrol"}>
      <StepIndicator steps={steps} current={step === 0 ? 0 : 1} completedLabel={t("auth.completed")} />
      {step === 0 ? (
        <form className="ops-auth__form" onSubmit={onSubmitPassword} noValidate>
          {failed ? <Alert tone="danger">{t("credential-failed")}</Alert> : null}
          <div className="ops-auth__fields">
            <Input
              label={t("new-password")}
              hint={t("at-least-8-characters")}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              error={passwordError ?? undefined}
              onChange={(event) => setPasswordValue(event.target.value)}
            />
            <Input
              label={t("auth.confirm-password")}
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirm}
              error={confirmError ?? undefined}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" block disabled={busy} sentenceCase>
            {t("auth.step-password")}
          </Button>
        </form>
      ) : (
        <OpsTotpEnrol startEnrol={startEnrol} challenge={challenge} verifyAndClaim={verifyAndClaim} />
      )}
    </div>
  );
}
