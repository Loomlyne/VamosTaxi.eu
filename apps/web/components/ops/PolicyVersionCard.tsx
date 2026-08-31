import "./PolicyVersionCard.css";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/core";
import type { CancellationTier, PolicyVersionRow } from "@/lib/ops/settings";

function formatEffective(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(iso));
}

export async function PolicyVersionCard({
  current,
  history,
}: {
  current: PolicyVersionRow | null;
  history: PolicyVersionRow[];
}) {
  const t = await getTranslations("ops");
  const locale = await getLocale();

  function numberWithUnit(value: number, unit: "hours" | "minutes" | "days" | "percent"): string {
    if (unit === "hours") return t("settings-policy-value-hours", { n: value });
    if (unit === "minutes") return t("settings-policy-value-minutes", { n: value });
    if (unit === "days") return t("settings-policy-value-days", { n: value });
    return t("settings-policy-value-percent", { n: value });
  }

  function field(label: string, value: number | null, unit: "hours" | "minutes" | "days" | "percent") {
    return (
      <div>
        <dt className="ops-policy__dt">{label}</dt>
        <dd className="ops-policy__dd">
          {value === null ? (
            <span data-tok>{label}</span>
          ) : (
            <span className="vt-dir-keep">{numberWithUnit(value, unit)}</span>
          )}
        </dd>
      </div>
    );
  }

  function tierLine(tier: CancellationTier, index: number) {
    if (tier.kind === "window") {
      return (
        <li key={index}>
          <span className="vt-dir-keep">
            {t("settings-policy-tier-window", {
              hours: tier.fromHoursBefore,
              percent: tier.refundPercent,
            })}
          </span>
        </li>
      );
    }
    if (tier.kind === "no_show") {
      return (
        <li key={index}>
          <span className="vt-dir-keep">
            {t("settings-policy-tier-no-show", { percent: tier.refundPercent })}
          </span>
        </li>
      );
    }
    return (
      <li key={index}>
        <span data-tok>{t("settings-policy-tier-unknown")}</span>
      </li>
    );
  }

  return (
    <div className="ops-policy">
      <section className="ops-policy__card" data-policy-card="1">
        <div>
          <h2 className="ops-policy__title">{t("settings-policy-title")}</h2>
          <p className="ops-policy__lede">{t("settings-policy-lede")}</p>
        </div>

        {current ? (
          <>
            <div className="ops-policy__meta">
              <Badge tone="neutral">{t("settings-policy-current")}</Badge>
              <span className="vt-dir-keep">{current.slug}</span>
              <span>{current.label}</span>
              <span className="vt-dir-keep">{formatEffective(current.effective_from, locale)}</span>
            </div>

            <dl className="ops-policy__dl">
              {field(t("settings-policy-free-cancel"), current.free_cancel_hours, "hours")}
              {field(t("settings-policy-modification"), current.modification_deadline_hours, "hours")}
              {field(t("settings-policy-min-advance"), current.min_advance_minutes, "minutes")}
              {field(t("settings-policy-airport-wait"), current.airport_waiting_minutes, "minutes")}
              {field(t("settings-policy-city-wait"), current.city_waiting_minutes, "minutes")}
              {field(t("settings-policy-manage-link"), current.manage_link_validity_days, "days")}
              {field(t("settings-policy-round-trip"), current.round_trip_discount_percent, "percent")}
              {field(t("settings-policy-quote-lock"), current.quote_lock_minutes, "minutes")}
              {field(t("settings-policy-checkout"), current.checkout_window_minutes, "minutes")}
              <div>
                <dt className="ops-policy__dt">{t("settings-policy-night-window")}</dt>
                <dd className="ops-policy__dd">
                  {current.night_window_start && current.night_window_end ? (
                    <span className="vt-dir-keep">
                      {current.night_window_start}–{current.night_window_end} {current.night_window_tz}
                    </span>
                  ) : (
                    <span data-tok>{t("settings-policy-night-window")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="ops-policy__dt">{t("settings-policy-doc")}</dt>
                <dd className="ops-policy__dd">
                  {current.policy_doc_slug ? (
                    <span className="vt-dir-keep">{current.policy_doc_slug}</span>
                  ) : (
                    <span data-tok>{t("settings-policy-doc")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="ops-policy__dt">{t("settings-policy-doc-version")}</dt>
                <dd className="ops-policy__dd">
                  {current.policy_doc_version ? (
                    <span className="vt-dir-keep">{current.policy_doc_version}</span>
                  ) : (
                    <span data-tok>{t("settings-policy-doc-version")}</span>
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="ops-policy__title">{t("settings-policy-tiers")}</h3>
              <ol className="ops-policy__tiers">
                {current.cancellation_tiers.map((tier, index) => tierLine(tier, index))}
              </ol>
            </div>
          </>
        ) : (
          <p>
            <span data-tok>{t("settings-policy-none")}</span>
          </p>
        )}
      </section>

      <section className="ops-policy__card">
        <h2 className="ops-policy__title">{t("settings-policy-history")}</h2>
        <ol className="ops-policy__history">
          {history.map((row) => (
            <li key={row.id} className="ops-policy__history-item">
              <span className="vt-dir-keep">{row.slug}</span>
              <span>{row.label}</span>
              <span className="vt-dir-keep">{formatEffective(row.effective_from, locale)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
