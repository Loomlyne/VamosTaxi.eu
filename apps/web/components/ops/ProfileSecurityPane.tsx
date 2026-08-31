"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { changeOwnEmail, changeOwnPassword } from "@/app/[locale]/(ops)/ops/profile/actions";
import { Alert } from "@/components/feedback/Alert";
import { Button } from "@/components/core";
import { Input } from "@/components/forms";

export type EnrolledFactor = {
  id: string;
  status: string;
  factorType: string;
};

export function ProfileSecurityPane({
  email,
  factors,
  securePasswordChange,
  confirmationsEnabled,
}: {
  email: string;
  factors: EnrolledFactor[];
  securePasswordChange: boolean;
  confirmationsEnabled: boolean;
}) {
  const t = useTranslations("ops.profileScreen.security");
  const [, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [nextEmail, setNextEmail] = useState(email);
  const [notice, setNotice] = useState<string | null>(null);

  const totp = factors.filter((factor) => factor.factorType === "totp");

  function copyFor(key: string): string {
    if (key === "saved") return t("saved");
    if (key === "profile.security.password-short") return t("password-short", { n: 8 });
    if (key === "profile.security.password-same") return t("password-same");
    if (key === "profile.security.reauth-needed") return t("reauth-needed");
    return t("error");
  }

  return (
    <section className="ops-profile__card" data-testid="profile-security">
      <div>
        <h2 className="ops-profile__card-title">{t("title")}</h2>
        <p className="ops-profile__card-sub">{t("lede")}</p>
      </div>

      {notice ? (
        <Alert tone={notice === "saved" ? "success" : "danger"} title={notice === "saved" ? t("saved") : t("error")}>
          {copyFor(notice)}
        </Alert>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await changeOwnPassword(password);
            setNotice(result.ok ? "saved" : result.key);
            if (result.ok) setPassword("");
          });
        }}
      >
        <Input
          label={t("password")}
          type="password"
          autoComplete="new-password"
          value={password}
          hint={securePasswordChange ? t("password-reauth") : t("password-local")}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="ops-profile__actions" style={{ marginBlockStart: 12 }}>
          <Button type="submit">{t("password-save")}</Button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await changeOwnEmail(nextEmail);
            setNotice(result.ok ? "saved" : result.key);
          });
        }}
      >
        <Input
          label={t("email")}
          type="email"
          className="vt-dir-keep"
          value={nextEmail}
          hint={confirmationsEnabled ? t("email-confirm") : t("email-local")}
          onChange={(event) => setNextEmail(event.target.value)}
        />
        <div className="ops-profile__actions" style={{ marginBlockStart: 12 }}>
          <Button type="submit">{t("email-save")}</Button>
        </div>
      </form>

      <div>
        <h3 className="ops-profile__card-title">{t("factors")}</h3>
        {totp.length === 0 ? (
          <p className="ops-profile__hint">{t("factors-none")}</p>
        ) : (
          <ul className="ops-profile__factors">
            {totp.map((factor) => (
              <li key={factor.id} className="vt-dir-keep">
                {t("factor-totp")} · {factor.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="ops-profile__refusals">
        <li>{t("noResetMfa")}</li>
        <li>{t("noPasskey")}</li>
        <li>{t("noDelete")}</li>
      </ul>
    </section>
  );
}
