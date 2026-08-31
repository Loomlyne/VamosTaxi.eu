"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateOwnProfile } from "@/app/[locale]/(ops)/ops/profile/actions";
import { Alert } from "@/components/feedback/Alert";
import { Button, Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import { Input, Select, Switch } from "@/components/forms";
import { OpsPhotoField } from "@/components/ops/OpsPhotoField";
import type { OwnProfile, ProfileInput, StaffLang } from "@/lib/ops/staff";
import { ProfileSecurityPane, type EnrolledFactor } from "./ProfileSecurityPane";
import "./ProfilePanes.css";

export type ProfilePane = "personal" | "preferences" | "security";

const PANES: { id: ProfilePane; icon: IconName; labelKey: string; hintKey: string }[] = [
  { id: "personal", icon: "user", labelKey: "pane-personal", hintKey: "pane-personal-hint" },
  { id: "preferences", icon: "globe", labelKey: "pane-preferences", hintKey: "pane-preferences-hint" },
  { id: "security", icon: "shield-check", labelKey: "pane-security", hintKey: "pane-security-hint" },
];

const LANGS: { value: StaffLang; labelKey: string }[] = [
  { value: "en", labelKey: "lang-en" },
  { value: "de", labelKey: "lang-de" },
  { value: "fr", labelKey: "lang-fr" },
  { value: "ar", labelKey: "lang-ar" },
];

function toInput(row: OwnProfile): ProfileInput {
  return {
    fullName: row.fullName,
    phone: row.phone,
    lang: row.lang,
    digestEmail: row.digestEmail,
    avatarPath: row.avatarPath,
  };
}

export function ProfilePanes({
  profile,
  email,
  factors,
  securePasswordChange,
  confirmationsEnabled,
}: {
  profile: OwnProfile;
  email: string;
  factors: EnrolledFactor[];
  securePasswordChange: boolean;
  confirmationsEnabled: boolean;
}) {
  const t = useTranslations("ops.profileScreen");
  const router = useRouter();
  const [pane, setPane] = useState<ProfilePane>("personal");
  const [draft, setDraft] = useState<ProfileInput>(() => toInput(profile));
  const [saved, setSaved] = useState<ProfileInput>(() => toInput(profile));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"saved" | string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  function patch(partial: Partial<ProfileInput>) {
    setDraft((current) => ({ ...current, ...partial }));
    setNotice(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await updateOwnProfile(draft);
    setBusy(false);
    if (!result.ok) {
      setNotice(result.key);
      return;
    }
    setSaved(draft);
    setNotice("saved");
    router.refresh();
  }

  return (
    <div className="ops-profile" data-page="ops-profile">
      <header className="ops-profile__head">
        <div className="ops-profile__head-copy">
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        {pane !== "security" ? (
          <div className="ops-profile__actions">
            {notice === "saved" ? <span className="ops-profile__saved">{t("saved")}</span> : null}
            <Button type="submit" form="ops-profile-form" disabled={!dirty || busy}>
              {t("save")}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="ops-profile__grid">
        <nav className="ops-profile__rail" aria-label={t("title")}>
          {PANES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ops-profile__item"
              data-on={pane === item.id ? "1" : undefined}
              onClick={() => setPane(item.id)}
            >
              <Icon name={item.icon} size={16} />
              <span className="ops-profile__item-copy">
                <span className="ops-profile__item-label">{t(item.labelKey)}</span>
                <span className="ops-profile__item-hint">{t(item.hintKey)}</span>
              </span>
            </button>
          ))}
        </nav>

        {pane === "security" ? (
          <ProfileSecurityPane
            email={email}
            factors={factors}
            securePasswordChange={securePasswordChange}
            confirmationsEnabled={confirmationsEnabled}
          />
        ) : (
          <form id="ops-profile-form" className="ops-profile__card" onSubmit={onSave}>
            {notice && notice !== "saved" ? (
              <Alert tone="danger" title={t("error")}>
                {notice === "staff-invalid-lang" ? t("error-lang") : t("error")}
              </Alert>
            ) : null}

            {pane === "personal" ? (
              <>
                <div>
                  <h2 className="ops-profile__card-title">{t("pane-personal")}</h2>
                  <p className="ops-profile__card-sub">{t("pane-personal-hint")}</p>
                </div>
                <OpsPhotoField
                  kind="staff"
                  recordId={profile.userId}
                  value={draft.avatarPath}
                  fallback={draft.fullName}
                  onChange={(key) => patch({ avatarPath: key })}
                />
                <Input
                  label={t("full-name")}
                  value={draft.fullName}
                  onChange={(event) => patch({ fullName: event.target.value })}
                />
                <Input
                  label={t("phone")}
                  value={draft.phone}
                  onChange={(event) => patch({ phone: event.target.value })}
                />
              </>
            ) : null}

            {pane === "preferences" ? (
              <>
                <div>
                  <h2 className="ops-profile__card-title">{t("pane-preferences")}</h2>
                  <p className="ops-profile__card-sub">{t("pane-preferences-hint")}</p>
                </div>
                <Select
                  label={t("lang")}
                  hint={t("lang-hint")}
                  value={draft.lang}
                  options={LANGS.map((lang) => ({ value: lang.value, label: t(lang.labelKey) }))}
                  onChange={(event) => patch({ lang: event.target.value as StaffLang })}
                />
                <Switch
                  label={t("digest")}
                  checked={draft.digestEmail}
                  onChange={(event) => patch({ digestEmail: event.target.checked })}
                />
                <p className="ops-profile__hint">{t("digest-hint")}</p>
              </>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
