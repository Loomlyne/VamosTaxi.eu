"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import { Checkbox, Radio } from "@/components/forms";
import { localePath } from "@/lib/checkout/steps";
import "./account-choice.css";

export type AccountChoiceValue = "guest" | "signin" | "create";

export type AccountChoiceProps = {
  value: AccountChoiceValue;
  onChange: (v: AccountChoiceValue) => void;
  /** The guest-accounts switch. On: the guest expansion shows Text 2. Off: nothing (D-09). */
  guestAccountsOn: boolean;
  /** When false the Create an account option is not rendered (revision blocker 3). */
  createAvailable: boolean;
  createConsent: boolean;
  onCreateConsent: (b: boolean) => void;
  createConsentError: string | null;
  /** Line under the group (PAY rules). */
  error: string | null;
  disabled: boolean;
  /** The expansion for "signin". */
  children?: ReactNode;
};

const OPTIONS: {
  value: AccountChoiceValue;
  icon: IconName;
  title: "acctGuestTitle" | "acctSignInTitle" | "acctCreateTitle";
  desc: "acctGuestDesc" | "acctSignInDesc" | "acctCreateDesc";
}[] = [
  { value: "guest", icon: "user", title: "acctGuestTitle", desc: "acctGuestDesc" },
  { value: "signin", icon: "log-in", title: "acctSignInTitle", desc: "acctSignInDesc" },
  { value: "create", icon: "user-plus", title: "acctCreateTitle", desc: "acctCreateDesc" },
];

/**
 * Three-way choice at the top of checkout section 2 (26.5 D-01): guest, sign in, create.
 * Guest never has a tick box (D-13). Create has one, labelled with the approved Text 1
 * (D-11), and it never disables the option or PAY (D-12): the host names what is missing
 * when PAY is pressed unticked. Built once with every state (UI-SPEC "States").
 */
export function AccountChoice({
  value,
  onChange,
  guestAccountsOn,
  createAvailable,
  createConsent,
  onCreateConsent,
  createConsentError,
  error,
  disabled,
  children,
}: AccountChoiceProps) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const uid = useId();
  const kickerId = `${uid}-kicker`;
  const errorId = `${uid}-error`;
  const consentErrorId = `${uid}-consent-error`;
  const name = `${uid}-choice`;

  const options = OPTIONS.filter((o) => createAvailable || o.value !== "create");
  const active: AccountChoiceValue = !createAvailable && value === "create" ? "guest" : value;
  // 26.2 audit U06-16: English links carry no `/en` (which answers 308).
  const termsHref = localePath(locale, "/terms");
  const privacyHref = localePath(locale, "/privacy");

  return (
    <div data-acct-choice="1">
      <p id={kickerId} data-acct-kicker="1">
        {t("acctKicker")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={kickerId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        data-acct-options="1"
      >
        {options.map((o) => (
          <div
            key={o.value}
            data-acct-option={o.value}
            data-selected={active === o.value ? "true" : "false"}
            data-disabled={disabled ? "true" : "false"}
          >
            <Radio
              name={name}
              value={o.value}
              checked={active === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              label={
                <span data-acct-title="1">
                  <Icon name={o.icon} size={20} />
                  {t(o.title)}
                </span>
              }
              description={t(o.desc)}
            />
          </div>
        ))}
      </div>

      {error ? (
        <p id={errorId} data-acct-error="1" role="alert">
          <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
          <span>{error}</span>
        </p>
      ) : null}

      <div data-acct-expansion={active}>
        {active === "guest" && guestAccountsOn ? (
          <p data-acct-note="guest">{t("acctGuestNotice")}</p>
        ) : null}

        {active === "signin" ? children : null}

        {active === "create" ? (
          <>
            <p data-acct-note="create">{t("acctCreateLine")}</p>
            <div data-acct-consent="1">
              <Checkbox
                checked={createConsent}
                onChange={(e) => onCreateConsent(e.target.checked)}
                disabled={disabled}
                invalid={Boolean(createConsentError)}
                aria-describedby={createConsentError ? consentErrorId : undefined}
                label={t.rich("acctCreateNotice", {
                  terms: (c) => (
                    <a href={termsHref} target="_blank" rel="noopener">
                      {c}
                    </a>
                  ),
                  privacy: (c) => (
                    <a href={privacyHref} target="_blank" rel="noopener">
                      {c}
                    </a>
                  ),
                })}
              />
              {createConsentError ? (
                <p id={consentErrorId} data-acct-error="1">
                  <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
                  <span>{createConsentError}</span>
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
