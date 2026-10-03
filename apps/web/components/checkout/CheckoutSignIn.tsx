"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import { Button } from "@/components/core";
import { Alert } from "@/components/feedback";
import { Input } from "@/components/forms";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import {
  emailProblem,
  requestCodeSignIn,
  requestSignInLink,
  type FetchLike,
} from "./account-sign-in-api";
import { localePath } from "@/lib/checkout/steps";
import "./account-choice.css";

export type CheckoutSignInStage = "form" | "sent";

/** Dev gallery only: start the component in a state that is otherwise reached by pressing. */
export type CheckoutSignInPreview =
  | "sending"
  | "resent"
  | "rate-limited"
  | "send-failed"
  | "code-error";

export type CheckoutSignInProps = {
  email: string;
  onEmail: (v: string) => void;
  locale: string;
  returnTo: string;
  turnstileSiteKey: string | undefined;
  stage: CheckoutSignInStage;
  onStage: (s: CheckoutSignInStage) => void;
  onSignedIn: () => void;
  /** PAY rule 2: "Open the sign-in link we sent, then pay." Shown under the sent heading. */
  payBlockError: string | null;
  disabled: boolean;
  /** Host stash hook for the "More ways to sign in" link. */
  onMoreWays?: () => void;
  /** Tests and the dev gallery answer here instead of /api/auth. */
  fetchImpl?: FetchLike;
  previewState?: CheckoutSignInPreview;
};

type LinkStatus = "idle" | "sending" | "rate" | "failed";
type ResendStatus = "idle" | "sending" | "done" | "rate" | "failed";
type CodeStatus = "idle" | "signing" | "invalid" | "rate" | "failed";

// Outside production a missing site key means "no challenge" so the dev gallery can drive
// the whole flow against a mocked fetch. Production builds inline NODE_ENV, so this is dead there.
const DEV_TOKEN = "dev-token";

/**
 * The sign-in block of the account choice (26.5 D-03, D-04): stage `form` asks for the
 * email and sends the link; stage `sent` is one neutral view that never says whether an
 * account exists. Same component for the Sign in option and the known-email path.
 */
export function CheckoutSignIn({
  email,
  onEmail,
  locale,
  returnTo,
  turnstileSiteKey,
  stage,
  onStage,
  onSignedIn,
  payBlockError,
  disabled,
  onMoreWays,
  fetchImpl,
  previewState,
}: CheckoutSignInProps) {
  const t = useTranslations("checkout");
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  const noChallenge = !turnstileSiteKey && process.env.NODE_ENV !== "production";

  const [linkStatus, setLinkStatus] = useState<LinkStatus>(
    previewState === "sending" ? "sending" : previewState === "rate-limited" && stage === "form" ? "rate" : previewState === "send-failed" ? "failed" : "idle",
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formToken, setFormToken] = useState<string | null>(noChallenge ? DEV_TOKEN : null);
  const [formNonce, setFormNonce] = useState(0);

  const [resend, setResend] = useState<ResendStatus>(
    previewState === "resent" ? "done" : previewState === "rate-limited" && stage === "sent" ? "rate" : "idle",
  );
  const [sentToken, setSentToken] = useState<string | null>(noChallenge ? DEV_TOKEN : null);
  const [sentNonce, setSentNonce] = useState(0);

  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<CodeStatus>(previewState === "code-error" ? "invalid" : "idle");

  const headingRef = useRef<HTMLParagraphElement>(null);
  const emailBoxRef = useRef<HTMLDivElement>(null);
  const refocusEmail = useRef(false);

  // Focus follows the stage: heading on `sent` (announced by its live region), the email
  // field, selected, when the customer chose "Use a different email".
  useEffect(() => {
    if (stage === "sent") headingRef.current?.focus();
    if (stage === "form" && refocusEmail.current) {
      refocusEmail.current = false;
      const field = emailBoxRef.current?.querySelector("input");
      field?.focus();
      field?.select();
    }
  }, [stage]);

  const link = (token: string | null) => requestSignInLink(doFetch, { locale, returnTo, email: email.trim(), turnstileToken: token ?? "" });

  async function send() {
    const problem = emailProblem(email);
    if (problem) {
      setEmailError(problem === "empty" ? t("enter-an-email-address") : t("errEmailCheck"));
      return;
    }
    setEmailError(null);
    setLinkStatus("sending");
    const result = await link(formToken);
    // each send consumes its token
    setFormNonce((n) => n + 1);
    if (!noChallenge) setFormToken(null);
    if (result === "sent") {
      setLinkStatus("idle");
      setResend("idle");
      onStage("sent");
    } else {
      setLinkStatus(result === "rate_limited" ? "rate" : "failed");
    }
  }

  async function sendAnother() {
    setResend("sending");
    const result = await link(sentToken);
    setSentNonce((n) => n + 1);
    if (!noChallenge) setSentToken(null);
    setResend(result === "sent" ? "done" : result === "rate_limited" ? "rate" : "failed");
  }

  async function signInWithCode() {
    setCodeStatus("signing");
    const result = await requestCodeSignIn(doFetch, { locale, email: email.trim(), code: code.trim() });
    if (result === "ok") {
      setCodeStatus("idle");
      onSignedIn();
    } else {
      setCodeStatus(result === "invalid" ? "invalid" : result === "rate_limited" ? "rate" : "failed");
    }
  }

  const busy = disabled || linkStatus === "sending" || codeStatus === "signing" || resend === "sending";

  if (stage === "form") {
    return (
      <div data-acct-signin="form">
        {linkStatus === "failed" ? (
          <Alert tone="danger" role="alert">
            {t("acctSendFailed")}
          </Alert>
        ) : null}
        {noChallenge ? null : (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            action="account"
            onToken={setFormToken}
            resetNonce={formNonce}
          />
        )}
        <div data-acct-row="1">
          <div data-acct-grow="1" ref={emailBoxRef}>
            <Input
              type="email"
              size="lg"
              icon="mail"
              label={t("contactEmail")}
              hint={t("acctEmailHint")}
              error={emailError ?? undefined}
              value={email}
              onChange={(e) => {
                onEmail(e.target.value);
                setEmailError(null);
                if (linkStatus === "rate" || linkStatus === "failed") setLinkStatus("idle");
              }}
              autoComplete="email"
              inputMode="email"
              disabled={busy}
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            onClick={send}
            disabled={busy}
            aria-busy={linkStatus === "sending" || undefined}
            data-acct-action="1"
          >
            {linkStatus === "sending" ? t("acctSending") : t("acctSendLink")}
          </Button>
        </div>
        {linkStatus === "rate" ? (
          <p data-acct-error="1" role="alert">
            <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
            <span>{t("acctRateLimit")}</span>
          </p>
        ) : null}
        <a
          data-acct-link="1"
          // 26.2 audit U06-16: English links carry no `/en` (which answers 308).
          href={`${localePath(locale, "/sign-in")}?returnTo=${encodeURIComponent(returnTo)}`}
          onClick={onMoreWays}
        >
          {t("acctMoreWays")}
        </a>
      </div>
    );
  }

  // Stage `sent`. One view for every address: nothing here branches on what the server knows.
  return (
    <div data-acct-signin="sent">
      <div role="status" aria-live="polite">
        <p ref={headingRef} tabIndex={-1} data-acct-sent-heading="1">
          <Icon name="mail" size={20} />
          <span>{t("acctSentHeading")}</span>
        </p>
      </div>
      {payBlockError ? (
        <p data-acct-error="1" role="alert">
          <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
          <span>{payBlockError}</span>
        </p>
      ) : null}
      <p data-acct-note="sent">
        {t.rich("acctSentTo", { email, addr: (c) => <span className="vt-dir-keep">{c}</span> })}
      </p>
      <p data-acct-body="1">{t("acctSentBody")}</p>

      <p data-acct-kicker-small="1">{t("acctCodeKicker")}</p>
      {/* Code sign-in: removed by the passwords-off job (D-03, checker rec. 6). */}
      <div data-acct-row="1">
        <div data-acct-grow="1">
          <Input
            size="lg"
            label={t("acctCodeLabel", { digits: "6" })}
            hint={t("acctCodeHint")}
            error={codeStatus === "invalid" ? t("acctCodeError", { digits: "6" }) : undefined}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              if (codeStatus !== "signing") setCodeStatus("idle");
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={busy}
            data-acct-code="1"
            className="vt-dir-keep"
          />
        </div>
        <Button
          variant="secondary"
          size="lg"
          onClick={signInWithCode}
          disabled={busy || code.length !== 6}
          aria-busy={codeStatus === "signing" || undefined}
          data-acct-action="1"
        >
          {codeStatus === "signing" ? t("acctCodeSigningIn") : t("acctCodeSignIn")}
        </Button>
      </div>
      {codeStatus === "rate" ? (
        <p data-acct-error="1" role="alert">
          <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
          <span>{t("acctRateLimit")}</span>
        </p>
      ) : null}
      {codeStatus === "failed" ? (
        <Alert tone="danger" role="alert">
          {t("acctSendFailed")}
        </Alert>
      ) : null}

      {noChallenge ? null : (
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          action="account"
          onToken={setSentToken}
          resetNonce={sentNonce}
        />
      )}
      <Button
        variant="ghost"
        size="md"
        onClick={sendAnother}
        disabled={busy || !sentToken}
        aria-busy={resend === "sending" || undefined}
      >
        {t("acctResend")}
      </Button>
      {resend === "done" ? (
        <p data-acct-ok="1" role="status">
          <Icon name="check" size={16} color="var(--vt-success)" />
          <span>{t("acctResent")}</span>
        </p>
      ) : null}
      {resend === "rate" ? (
        <p data-acct-error="1" role="alert">
          <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
          <span>{t("acctRateLimit")}</span>
        </p>
      ) : null}
      {resend === "failed" ? (
        <Alert tone="danger" role="alert">
          {t("acctSendFailed")}
        </Alert>
      ) : null}

      <button
        type="button"
        data-acct-link="1"
        disabled={disabled}
        onClick={() => {
          refocusEmail.current = true;
          setCode("");
          setCodeStatus("idle");
          onStage("form");
        }}
      >
        {t("acctUseDifferent")}
      </button>
      <p data-acct-note="hint">{t("acctSentHint")}</p>
    </div>
  );
}
