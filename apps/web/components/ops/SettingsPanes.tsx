"use client";

import "./SettingsPanes.css";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import { Counter, Input, Select, Switch } from "@/components/forms";
import type { SettingsInput, SettingsRow } from "@/lib/ops/settings";

type UpdateSettingsResult =
  | { ok: true }
  | { ok: false; field?: string; copyId: string };

export type SettingsPane = "company" | "locale" | "payments" | "notifications" | "dispatch";

const PANES: { id: SettingsPane; icon: IconName; labelKey: string; hintKey: string }[] = [
  { id: "company", icon: "briefcase", labelKey: "settings-pane-company", hintKey: "settings-pane-company-hint" },
  { id: "locale", icon: "globe", labelKey: "settings-pane-locale", hintKey: "settings-pane-locale-hint" },
  { id: "payments", icon: "credit-card", labelKey: "settings-pane-payments", hintKey: "settings-pane-payments-hint" },
  {
    id: "notifications",
    icon: "bell",
    labelKey: "settings-pane-notifications",
    hintKey: "settings-pane-notifications-hint",
  },
  { id: "dispatch", icon: "car", labelKey: "settings-pane-dispatch", hintKey: "settings-pane-dispatch-hint" },
];

const LANGS = [
  { value: "en", labelKey: "settings-lang-en" },
  { value: "de", labelKey: "settings-lang-de" },
  { value: "fr", labelKey: "settings-lang-fr" },
  { value: "ar", labelKey: "settings-lang-ar" },
] as const;

const CURRENCIES = ["CHF", "EUR", "USD", "AED"] as const;

function toInput(row: SettingsRow): SettingsInput {
  return {
    company: row.company,
    address: row.address,
    uid_number: row.uid_number,
    phone: row.phone,
    email: row.email,
    default_lang: row.default_lang,
    default_currency: row.default_currency,
    accepts_cash: row.accepts_cash,
    accepts_card: row.accepts_card,
    accepts_twint: row.accepts_twint,
    accepts_invoice: row.accepts_invoice,
    email_confirmation: row.email_confirmation,
    email_reminder: row.email_reminder,
    sms_reminder: row.sms_reminder,
    ops_alerts: row.ops_alerts,
    chauffeur_turnaround_minutes: row.chauffeur_turnaround_minutes,
  };
}

function sameDraft(a: SettingsInput, b: SettingsInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function paneDirty(id: SettingsPane, draft: SettingsInput, saved: SettingsInput): boolean {
  const keys: Record<SettingsPane, (keyof SettingsInput)[]> = {
    company: ["company", "address", "uid_number", "phone", "email"],
    locale: ["default_lang", "default_currency"],
    payments: ["accepts_cash", "accepts_card", "accepts_twint", "accepts_invoice"],
    notifications: ["email_confirmation", "email_reminder", "sms_reminder", "ops_alerts"],
    dispatch: ["chauffeur_turnaround_minutes"],
  };
  return keys[id].some((key) => draft[key] !== saved[key]);
}

type Props = {
  settings: SettingsRow;
  pane: SettingsPane;
  updateSettings: (input: SettingsInput) => Promise<UpdateSettingsResult>;
};

export function SettingsPanes({ settings, pane, updateSettings }: Props) {
  const t = useTranslations("ops");
  const router = useRouter();
  const saved = useMemo(() => toInput(settings), [settings]);
  const [draft, setDraft] = useState<SettingsInput>(saved);
  const [fieldError, setFieldError] = useState<{ field: string; copyId: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = !sameDraft(draft, saved);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const patch = (over: Partial<SettingsInput>) => {
    setJustSaved(false);
    setFieldError(null);
    setFormError(null);
    setDraft((prev) => ({ ...prev, ...over }));
  };

  const pickPane = (next: SettingsPane, event: MouseEvent<HTMLButtonElement>) => {
    if (next === pane) return;
    if (dirty && !window.confirm(t("settings-unsaved-leave"))) {
      event.preventDefault();
      return;
    }
    router.push(`/ops/settings?pane=${next}`);
  };

  const onDiscard = () => {
    setDraft(saved);
    setFieldError(null);
    setFormError(null);
    setJustSaved(false);
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);
    const result = await updateSettings(draft);
    if (!result.ok) {
      if (result.field) setFieldError({ field: result.field, copyId: result.copyId });
      else setFormError(result.copyId);
      return;
    }
    setJustSaved(true);
    router.refresh();
  };

  const errorFor = (field: string) =>
    fieldError?.field === field ? t(fieldError.copyId) : undefined;

  return (
    <form className="ops-settings" onSubmit={onSave} data-pane={pane}>
      <header className="ops-settings__head">
        <div className="ops-settings__head-copy">
          <h1 className="ops-settings__title">{t("settings")}</h1>
          <p className="ops-settings__subtitle">{t("settings-subtitle")}</p>
        </div>
        <div className="ops-settings__actions">
          {justSaved && !dirty ? <span className="ops-settings__saved">{t("saved")}</span> : null}
          {dirty ? (
            <Button type="button" size="md" variant="secondary" onClick={onDiscard}>
              {t("discard")}
            </Button>
          ) : null}
          <Button type="submit" size="md" disabled={!dirty}>
            {t("save-changes")}
          </Button>
        </div>
      </header>

      {formError ? <Alert tone="danger">{t(formError)}</Alert> : null}

      <div className="ops-settings__grid">
        <nav className="ops-settings__rail" aria-label={t("settings")}>
          {PANES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ops-settings__item"
              data-on={pane === item.id ? "1" : "0"}
              data-pane-id={item.id}
              onClick={(event) => pickPane(item.id, event)}
              title={t(item.labelKey)}
            >
              <Icon name={item.icon} size={18} color="currentColor" />
              <span className="ops-settings__item-copy">
                <span className="ops-settings__item-label">{t(item.labelKey)}</span>
                <span className="ops-settings__item-hint">{t(item.hintKey)}</span>
              </span>
              {paneDirty(item.id, draft, saved) ? (
                <span className="ops-settings__dot" title={t("unsaved-changes")} aria-label={t("unsaved-changes")} />
              ) : null}
            </button>
          ))}
        </nav>

        <div>
          {pane === "company" ? (
            <section className="ops-settings__card">
              <div>
                <h2 className="ops-settings__card-title">{t("settings-company")}</h2>
                <p className="ops-settings__card-sub">{t("settings-company-sub")}</p>
              </div>
              <Input
                size="md"
                label={t("settings-legal-name")}
                value={draft.company}
                onChange={(e) => patch({ company: e.target.value })}
              />
              {draft.address === "" ? (
                <p className="ops-settings__gap">
                  <span data-tok>{t("settings-gap-address")}</span>
                </p>
              ) : null}
              <Input
                size="md"
                label={t("settings-address")}
                value={draft.address}
                onChange={(e) => patch({ address: e.target.value })}
              />
              <div className="ops-settings__row">
                <div>
                  {draft.uid_number === "" ? (
                    <p className="ops-settings__gap">
                      <span data-tok>{t("settings-gap-uid")}</span>
                    </p>
                  ) : null}
                  <Input
                    size="md"
                    label={t("settings-uid")}
                    value={draft.uid_number}
                    error={errorFor("uid_number")}
                    onChange={(e) => patch({ uid_number: e.target.value })}
                    className="vt-dir-keep"
                  />
                </div>
                <Input
                  size="md"
                  label={t("settings-phone")}
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
                <Input
                  size="md"
                  label={t("email")}
                  type="email"
                  value={draft.email}
                  error={errorFor("email")}
                  onChange={(e) => patch({ email: e.target.value })}
                />
              </div>
              <p className="ops-settings__hint">{t("settings-company-note")}</p>
            </section>
          ) : null}

          {pane === "locale" ? (
            <section className="ops-settings__card">
              <div>
                <h2 className="ops-settings__card-title">{t("settings-locale")}</h2>
                <p className="ops-settings__card-sub">{t("settings-locale-sub")}</p>
              </div>
              <div className="ops-settings__row">
                <Select
                  size="md"
                  icon="globe"
                  label={t("settings-default-lang")}
                  value={draft.default_lang}
                  options={LANGS.map((lang) => ({ value: lang.value, label: t(lang.labelKey) }))}
                  onChange={(e) =>
                    patch({ default_lang: e.target.value as SettingsInput["default_lang"] })
                  }
                  error={errorFor("default_lang")}
                />
                <Select
                  size="md"
                  icon="banknote"
                  label={t("settings-default-currency")}
                  value={draft.default_currency}
                  options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  onChange={(e) =>
                    patch({
                      default_currency: e.target.value as SettingsInput["default_currency"],
                    })
                  }
                  error={errorFor("default_currency")}
                />
              </div>
              <div className="ops-settings__published">
                <span>{t("settings-published-languages")}</span>
                <span className="ops-settings__chips">
                  {LANGS.map((lang) => (
                    <span key={lang.value} className="ops-settings__chip">
                      {lang.value.toUpperCase()}
                    </span>
                  ))}
                </span>
                <p className="ops-settings__hint">{t("settings-published-hint")}</p>
              </div>
              <p className="ops-settings__hint">{t("settings-locale-note")}</p>
            </section>
          ) : null}

          {pane === "payments" ? (
            <section className="ops-settings__card">
              <div>
                <h2 className="ops-settings__card-title">{t("settings-payments")}</h2>
                <p className="ops-settings__card-sub">{t("settings-payments-sub")}</p>
              </div>
              {(
                [
                  ["accepts_cash", "settings-cash", "settings-cash-hint"],
                  ["accepts_card", "settings-card", "settings-card-hint"],
                  ["accepts_twint", "settings-twint", "settings-twint-hint"],
                  ["accepts_invoice", "settings-invoice", "settings-invoice-hint"],
                ] as const
              ).map(([key, labelKey, hintKey]) => (
                <div key={key} className="ops-settings__switch-row">
                  <span className="ops-settings__switch-copy">
                    <span className="ops-settings__switch-label">{t(labelKey)}</span>
                    <span className="ops-settings__switch-hint">{t(hintKey)}</span>
                  </span>
                  <Switch
                    checked={draft[key]}
                    aria-label={t(labelKey)}
                    onChange={(e) => patch({ [key]: e.target.checked })}
                  />
                </div>
              ))}
              <p className="ops-settings__hint">{t("settings-payments-note")}</p>
            </section>
          ) : null}

          {pane === "notifications" ? (
            <section className="ops-settings__card">
              <div>
                <h2 className="ops-settings__card-title">{t("settings-notifications")}</h2>
                <p className="ops-settings__card-sub">{t("settings-notifications-sub")}</p>
              </div>
              {(
                [
                  ["email_confirmation", "settings-email-confirm", "settings-email-confirm-hint"],
                  ["email_reminder", "settings-email-reminder", "settings-email-reminder-hint"],
                  ["sms_reminder", "settings-sms-reminder", "settings-sms-reminder-hint"],
                  ["ops_alerts", "settings-ops-alerts", "settings-ops-alerts-hint"],
                ] as const
              ).map(([key, labelKey, hintKey]) => (
                <div key={key} className="ops-settings__switch-row">
                  <span className="ops-settings__switch-copy">
                    <span className="ops-settings__switch-label">{t(labelKey)}</span>
                    <span className="ops-settings__switch-hint">{t(hintKey)}</span>
                  </span>
                  <Switch
                    checked={draft[key]}
                    aria-label={t(labelKey)}
                    onChange={(e) => patch({ [key]: e.target.checked })}
                  />
                </div>
              ))}
              <p className="ops-settings__hint">{t("settings-notifications-note")}</p>
            </section>
          ) : null}

          {pane === "dispatch" ? (
            <section className="ops-settings__card">
              <div>
                <h2 className="ops-settings__card-title">{t("settings-dispatch")}</h2>
                <p className="ops-settings__card-sub">{t("settings-dispatch-sub")}</p>
              </div>
              <Counter
                label={t("settings-turnaround")}
                value={draft.chauffeur_turnaround_minutes}
                min={0}
                max={1440}
                onChange={(value) => patch({ chauffeur_turnaround_minutes: value })}
                decrementLabel={t("settings-turnaround-fewer")}
                incrementLabel={t("settings-turnaround-more")}
                error={errorFor("chauffeur_turnaround_minutes")}
              />
              <p className="ops-settings__hint">{t("settings-dispatch-hint")}</p>
            </section>
          ) : null}
        </div>
      </div>
    </form>
  );
}
