// packages/emails/src/PayLinkEmail.tsx
//
// Unpaid pay-link. Pay-first voucher, not a confirmation clone.
// Hex from design-system tokens — email clients cannot use var(--vt-*).
// Yellow is the PAY NOW fill only. Do not invent CHF.

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { EmailLocale, PayLinkExtraCode, PayLinkForEmail, PayLinkVehicle } from "./lib/types";
import { t } from "./lib/t";
import { formatPaidTotal } from "./ConfirmationEmail";

/** --vt-charcoal / --vt-charcoal-900 */
const CHARCOAL = "#1E1F1F";
/** --vt-grey / --vt-grey-200 */
const GREY = "#DEDEDE";
/** --vt-grey-50 — page */
const PAGE = "#F6F6F6";
/** --vt-grey-100 — recap well */
const INSET = "#ECECEC";
/** --vt-grey-300 — inverse muted */
const INVERSE_MUTED = "#C2C3C3";
/** --vt-yellow / --vt-yellow-400 — button fill only */
const YELLOW = "#FDC20B";
/** --vt-white */
const WHITE = "#FFFFFF";
/** --vt-charcoal-600 */
const MUTED = "#545756";

const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';

const DISPATCH_PHONE = "+41 79 626 70 82";
const WHATSAPP_HREF = "https://wa.me/41796267082";
const LOCK_HOURS = 24;

const VEHICLE_KEY: Record<PayLinkVehicle, string> = {
  economy: "payLink.vehicleEconomy",
  business: "payLink.vehicleBusiness",
  first: "payLink.vehicleFirst",
  van: "payLink.vehicleVan",
};

const EXTRA_KEY: Record<PayLinkExtraCode, string> = {
  child_seat: "payLink.extraChildSeat",
  oversized_luggage: "payLink.extraOversized",
  extra_stop: "payLink.extraStop",
};

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

function extraLabels(locale: EmailLocale, extras: PayLinkExtraCode[]): string[] {
  return extras.map((code) => t(locale, EXTRA_KEY[code]));
}

const labelStyle = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const valueStyle = {
  margin: "6px 0 0",
  fontSize: "16px",
  lineHeight: "24px",
  color: CHARCOAL,
};

export function PayLinkEmail({ link }: { link: PayLinkForEmail }) {
  const locale: EmailLocale = link.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const amount = formatPaidTotal(link.totalRappen);
  const extras = extraLabels(locale, link.extras);
  const vehicle = t(locale, VEHICLE_KEY[link.vehicleClass]);
  const hours = { hours: LOCK_HOURS };

  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{t(locale, "payLink.preheader", hours)}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: PAGE, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ backgroundColor: CHARCOAL, padding: "28px 32px 24px" }}>
            <Text
              style={{
                margin: 0,
                fontFamily: DISPLAY_FONT,
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: WHITE,
              }}
            >
              Vamos Taxi
            </Text>
            <Text
              style={{
                margin: "16px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "28px",
                lineHeight: "34px",
                fontWeight: 600,
                color: WHITE,
              }}
            >
              {t(locale, "payLink.headline")}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: "14px", color: INVERSE_MUTED }}>
              {t(locale, "payLink.referenceLabel")} {ltr(link.reference)}
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: "14px", color: INVERSE_MUTED }}>
              {t(locale, "payLink.unpaid")}
            </Text>
          </Section>

          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={labelStyle}>{t(locale, "payLink.amountLabel")}</Text>
            <Text
              style={{
                margin: "8px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "36px",
                lineHeight: "40px",
                fontWeight: 700,
                color: CHARCOAL,
              }}
            >
              {ltr(amount)}
            </Text>
            <Button
              href={link.payUrl}
              style={{
                backgroundColor: YELLOW,
                color: CHARCOAL,
                fontFamily: BODY_FONT,
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textDecoration: "none",
                padding: "16px 28px",
                marginTop: "24px",
                borderRadius: "999px",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
              }}
            >
              {t(locale, "payLink.payCta")}
            </Button>
            <Text style={{ margin: "16px 0 0", fontSize: "12px", color: MUTED }}>
              {t(locale, "payLink.linkLabel")}
            </Text>
            <Text style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: "20px", color: CHARCOAL, wordBreak: "break-all" }}>
              <Link href={link.payUrl} style={{ color: CHARCOAL, unicodeBidi: "isolate" }}>
                {link.payUrl}
              </Link>
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: "13px", color: MUTED }}>
              {t(locale, "payLink.holdLine", hours)}
            </Text>
          </Section>

          <Section style={{ backgroundColor: INSET, padding: "20px 32px 12px" }}>
              {link.pickupText || link.dropoffText ? (
                <Row>
                  {link.pickupText ? (
                    <Column style={{ width: "50%", paddingRight: dir === "rtl" ? "0" : "12px", paddingLeft: dir === "rtl" ? "12px" : "0", verticalAlign: "top" }}>
                      <Text style={labelStyle}>{t(locale, "fromLabel")}</Text>
                      <Text style={valueStyle}>{link.pickupText}</Text>
                    </Column>
                  ) : null}
                  {link.dropoffText ? (
                    <Column style={{ width: "50%", verticalAlign: "top" }}>
                      <Text style={labelStyle}>{t(locale, "toLabel")}</Text>
                      <Text style={valueStyle}>{link.dropoffText}</Text>
                    </Column>
                  ) : null}
                </Row>
              ) : null}
              {link.scheduledLocal ? (
                <Text style={{ margin: "16px 0 0", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "timeLabel")} {ltr(link.scheduledLocal)}
                  {link.flightNo ? <> · {ltr(link.flightNo)}</> : null}
                </Text>
              ) : null}
              <Text style={{ margin: "8px 0 12px", fontSize: "14px", color: CHARCOAL }}>
                {t(locale, "vehicleLabel")} {vehicle}
                {link.pax > 0 ? (
                  <>
                    {" · "}
                    {t(locale, "paxLine", { pax: link.pax, bags: link.bags })}
                  </>
                ) : null}
              </Text>
              {extras.length > 0 ? (
                <Text style={{ margin: "0 0 12px", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "payLink.extrasLabel")} {extras.join(" · ")}
                </Text>
              ) : null}
              {link.coupon ? (
                <Text style={{ margin: "0 0 12px", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "payLink.couponLabel")} {ltr(link.coupon)}
                </Text>
              ) : null}
            </Section>

          <Section style={{ padding: "8px 32px 8px" }}>
            {link.contactName ? (
              <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                {t(locale, "payLink.passengerLabel")} {link.contactName}
              </Text>
            ) : null}
            {link.contactPhone ? (
              <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                {t(locale, "payLink.phoneLabel")} {ltr(link.contactPhone)}
              </Text>
            ) : null}
            {link.companyName ? (
              <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                {t(locale, "payLink.companyLabel")} {link.companyName}
                {link.companyAddress ? ` · ${link.companyAddress}` : ""}
                {link.companyVat ? ` · ${link.companyVat}` : ""}
              </Text>
            ) : null}
            <Hr style={{ borderColor: GREY, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: "13px", color: MUTED }}>
              {t(locale, "dispatchPhone", { phone: DISPATCH_PHONE })}
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: "13px", color: MUTED }}>
              <Link href={WHATSAPP_HREF} style={{ color: MUTED }}>
                {t(locale, "payLink.whatsapp", { phone: DISPATCH_PHONE })}
              </Link>
            </Text>
          </Section>
          <Section style={{ padding: "8px 32px 32px" }}>
            <Text style={{ margin: 0, fontSize: "12px", color: MUTED }}>{t(locale, "payLink.footer")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function payLinkPlainText(link: PayLinkForEmail): string {
  const locale = link.locale;
  const extras = extraLabels(locale, link.extras);
  const hours = { hours: LOCK_HOURS };
  const lines = [
    t(locale, "payLink.headline"),
    `${t(locale, "payLink.referenceLabel")} ${link.reference}`,
    t(locale, "payLink.unpaid"),
    `${t(locale, "payLink.amountLabel")} ${formatPaidTotal(link.totalRappen)}`,
    t(locale, "payLink.payCta"),
    link.payUrl,
    t(locale, "payLink.holdLine", hours),
  ];
  if (link.pickupText) lines.push(`${t(locale, "fromLabel")}: ${link.pickupText}`);
  if (link.dropoffText) lines.push(`${t(locale, "toLabel")}: ${link.dropoffText}`);
  if (link.scheduledLocal) {
    lines.push(`${t(locale, "timeLabel")} ${link.scheduledLocal}`);
  }
  if (link.flightNo) lines.push(link.flightNo);
  lines.push(`${t(locale, "vehicleLabel")} ${t(locale, VEHICLE_KEY[link.vehicleClass])}`);
  if (link.pax > 0) lines.push(t(locale, "paxLine", { pax: link.pax, bags: link.bags }));
  if (extras.length > 0) lines.push(`${t(locale, "payLink.extrasLabel")} ${extras.join(" · ")}`);
  if (link.coupon) lines.push(`${t(locale, "payLink.couponLabel")} ${link.coupon}`);
  if (link.contactName) lines.push(`${t(locale, "payLink.passengerLabel")} ${link.contactName}`);
  if (link.contactPhone) lines.push(`${t(locale, "payLink.phoneLabel")} ${link.contactPhone}`);
  if (link.companyName) {
    lines.push(
      [t(locale, "payLink.companyLabel"), link.companyName, link.companyAddress, link.companyVat]
        .filter(Boolean)
        .join(" "),
    );
  }
  lines.push(t(locale, "dispatchPhone", { phone: DISPATCH_PHONE }));
  lines.push(t(locale, "payLink.whatsapp", { phone: DISPATCH_PHONE }));
  lines.push(WHATSAPP_HREF);
  lines.push(t(locale, "payLink.footer"));
  return lines.join("\n");
}

export function payLinkSubject(link: PayLinkForEmail): string {
  return t(link.locale, "payLink.subject", { reference: link.reference });
}
