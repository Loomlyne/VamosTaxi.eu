"use client";

import { useState, useTransition } from "react";
import { AuthForm } from "@/components/auth";
import type {
  AuthBanner,
  AuthMethod,
  AuthMode,
  AuthStage,
  AuthSubmitPayload,
} from "@/components/auth/types";
import {
  requestOtpAction,
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  type AuthActionResult,
} from "@/lib/auth/actions";

export function SignInClient({
  locale,
  initialMode = "signin",
  initialBanner = null,
}: {
  locale: string;
  initialMode?: AuthMode;
  initialBanner?: AuthBanner;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [method, setMethod] = useState<AuthMethod>("password");
  const [stage, setStage] = useState<AuthStage>("form");
  const [banner, setBanner] = useState<AuthBanner>(initialBanner);
  const [pending, startTransition] = useTransition();
  const [lastPayload, setLastPayload] = useState<AuthSubmitPayload | null>(null);

  function applyResult(result: AuthActionResult): void {
    if ("ok" in result) return;
    if (result.stage === "sent") {
      setStage("sent");
      setBanner(null);
      return;
    }
    setStage("form");
    setBanner(result.banner);
  }

  function submit(payload: AuthSubmitPayload): void {
    setLastPayload(payload);
    startTransition(async () => {
      let result: AuthActionResult;
      if (payload.mode === "forgot") {
        result = await requestPasswordResetAction(payload.email, locale);
      } else if (payload.mode === "signup" && payload.method === "password") {
        result = await signUpAction(payload, locale);
      } else if (payload.method === "magic") {
        result = await requestOtpAction(payload, locale);
      } else {
        result = await signInAction(payload, locale);
      }
      applyResult(result);
    });
  }

  return (
    <AuthForm
      mode={mode}
      method={method}
      stage={stage}
      banner={banner}
      pending={pending}
      onModeChange={(next) => {
        setMode(next);
        setStage("form");
        setBanner(null);
      }}
      onMethodChange={setMethod}
      onSubmit={submit}
      onResend={() => {
        if (lastPayload) submit(lastPayload);
      }}
    />
  );
}
