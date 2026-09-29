"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Icon } from "@/components/core";
import { Input } from "@/components/forms";
import { useCheckoutForm } from "../CheckoutForm";
import { LegalLines, OrderSummary } from "./SummaryRail";
import { SectionCard } from "./SectionCard";

/**
 * Section 3 (D-16, D-18, D-02). Phone and tablet carry the summary and the legal lines
 * here (the rail's content); desktop keeps only the method note and the voucher. No wallet
 * buttons, no card fields, no emailed-link option: payment happens on Stripe's page.
 */
export function PaymentSection({ desktop }: { desktop: boolean }) {
  const t = useTranslations("checkout");
  const f = useCheckoutForm();

  const voucherMessage = f.voucherError ? t(f.voucherError) : null;

  return (
    <SectionCard n={3} title={t("payment")} id="co-section-payment">
      {f.notice === "back" ? (
        <Alert tone="info" data-co-back-notice>
          {t("backFromStripe")}
        </Alert>
      ) : null}

      {desktop ? null : (
        <div id="co-summary" className="vt-co__section-summary">
          <OrderSummary />
        </div>
      )}

      <fieldset className="vt-co__fieldset" disabled={f.paying}>
        <p className="vt-co__method" data-co-method>
          <Icon name="lock" size={18} color="var(--vt-text-muted)" />
          <span>{t("methodNote")}</span>
        </p>

        <div className="vt-co__voucher" data-co-voucher data-state={f.voucherApplied ? "applied" : f.voucherOpen ? "open" : "closed"}>
          {f.voucherApplied ? (
            <div className="vt-co__voucher-applied">
              <p className="vt-co__voucher-line" data-co-voucher-applied>
                <Icon name="ticket" size={18} color="var(--vt-success)" />
                <span>{t("voucherApplied", { code: f.voucher ?? "" })}</span>
              </p>
              <Button variant="ghost" size="md" onClick={f.removeVoucher} data-co-voucher-remove>
                {t("removeVoucher")}
              </Button>
            </div>
          ) : f.voucherOpen ? (
            <div className="vt-co__voucher-form">
              <Input
                label={t("voucherCode")}
                size="lg"
                value={f.voucherDraft}
                error={voucherMessage ?? undefined}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => f.setVoucherDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    f.applyVoucher();
                  }
                }}
              />
              <Button
                variant="secondary"
                size="lg"
                onClick={f.applyVoucher}
                disabled={f.voucherDraft.trim() === "" || (f.voucher !== null && f.price.kind === "updating")}
                data-co-voucher-apply
              >
                {t("applyVoucher")}
              </Button>
            </div>
          ) : (
            <button type="button" className="vt-co__link vt-co__link--block" onClick={() => f.setVoucherOpen(true)} data-co-voucher-open>
              {t("haveVoucher")}
            </button>
          )}
        </div>
      </fieldset>

      {desktop ? null : <LegalLines />}
    </SectionCard>
  );
}

/** UI-SPEC "Return and expiry states": an info Alert at the top of the page. */
export function TopNotice() {
  const t = useTranslations("checkout");
  const f = useCheckoutForm();
  const expiredBooking = f.notice === "expired";
  if (!expiredBooking && !f.quoteExpired) return null;
  return (
    <div className="vt-co__notice" data-co-top-notice data-kind={expiredBooking ? "expired-booking" : "quote-expired"}>
      <Alert tone="info" role="status">
        {expiredBooking ? t("expiredBooking") : t("quoteExpired")}
      </Alert>
      <Button size="lg" onClick={f.seeCurrentPrices} data-co-see-prices>
        {t("seeCurrentPrices")}
      </Button>
    </div>
  );
}
