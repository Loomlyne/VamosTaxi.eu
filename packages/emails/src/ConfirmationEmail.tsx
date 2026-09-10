// packages/emails/src/ConfirmationEmail.tsx
//
// One confirmation template (D-18). Hex values are resolved design-system
// tokens — email clients cannot use var(--vt-*).

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { BookingForEmail, EmailLocale, PayLinkExtraCode } from "./lib/types";
import { t } from "./lib/t";

/** --vt-charcoal / --vt-charcoal-900 */
const CHARCOAL = "#1E1F1F";
/** --vt-grey / --vt-grey-200 */
const GREY = "#DEDEDE";
/** --vt-yellow / --vt-yellow-400 — button fill only */
const YELLOW = "#FDC20B";
/** --vt-white */
const WHITE = "#FFFFFF";
/** --vt-charcoal-600 */
const MUTED = "#545756";

const DISPLAY_FONT = 'Qurova, Poppins, system-ui, sans-serif';
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';

const DISPATCH_PHONE = "+41 79 626 70 82";

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

/** Law 04: null total is the placeholder, never an invented figure. */
export function formatPaidTotal(totalRappen: number | null): string {
  if (totalRappen == null) return "CHF 000";
  const francs = totalRappen / 100;
  const fixed = francs.toFixed(2);
  const dot = fixed.indexOf(".");
  const whole = fixed.slice(0, dot);
  const frac = fixed.slice(dot + 1);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `CHF ${grouped}.${frac}`;
}

function firstLeg(booking: BookingForEmail) {
  return booking.legs[0];
}

const EXTRA_KEY: Record<PayLinkExtraCode, string> = {
  child_seat: "payLink.extraChildSeat",
  oversized_luggage: "payLink.extraOversized",
  extra_stop: "payLink.extraStop",
};

function extraLabels(locale: EmailLocale, extras: PayLinkExtraCode[] | undefined): string[] {
  if (!extras?.length) return [];
  return extras.map((code) => t(locale, EXTRA_KEY[code]));
}

export function ConfirmationEmail({ booking }: { booking: BookingForEmail }) {
  const locale: EmailLocale = booking.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const leg = firstLeg(booking);
  const amount = formatPaidTotal(booking.totalRappen);
  const extras = extraLabels(locale, booking.extras);

  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{t(locale, "preheader")}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ padding: "28px 32px 20px" }}>
            <Text style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "28px", fontWeight: 600, color: CHARCOAL }}>
              Vamos Taxi
            </Text>
          </Section>
          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>
          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "24px", fontWeight: 600, color: CHARCOAL }}>
              {t(locale, "headline")}
            </Text>
            <Text style={{ margin: "12px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "referenceLabel")} {ltr(booking.reference)}
            </Text>
            {leg ? (
              <>
                <Row style={{ marginTop: "20px" }}>
                  <Column>
                    <Text style={{ margin: 0, fontSize: "12px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {t(locale, "fromLabel")}
                    </Text>
                    <Text style={{ margin: "4px 0 0", fontSize: "16px", color: CHARCOAL }}>{leg.pickupText}</Text>
                  </Column>
                </Row>
                <Row>
                  <Column>
                    <Text style={{ margin: "16px 0 0", fontSize: "12px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {t(locale, "toLabel")}
                    </Text>
                    <Text style={{ margin: "4px 0 0", fontSize: "16px", color: CHARCOAL }}>{leg.dropoffText}</Text>
                  </Column>
                </Row>
                <Text style={{ margin: "16px 0 0", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "pickupDetail")}
                </Text>
                <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "timeLabel")} {ltr(leg.scheduledLocal)}
                  {leg.flightNo ? <> · {ltr(leg.flightNo)}</> : null}
                </Text>
                <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "vehicleLabel")} {leg.vehicleClassLabel}
                  {" · "}
                  {t(locale, "paxLine", { pax: leg.pax, bags: leg.bags })}
                </Text>
                {extras.length > 0 ? (
                  <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                    {t(locale, "payLink.extrasLabel")} {extras.join(" · ")}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Hr style={{ borderColor: GREY, margin: "24px 0" }} />
            <Text style={{ margin: 0, fontSize: "12px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t(locale, "paidTotal")}
            </Text>
            <Text style={{ margin: "4px 0 0", fontFamily: DISPLAY_FONT, fontSize: "22px", fontWeight: 700, color: CHARCOAL }}>
              {ltr(amount)}
            </Text>
            <Button
              href={booking.manageUrl}
              style={{
                backgroundColor: YELLOW,
                color: CHARCOAL,
                fontFamily: BODY_FONT,
                fontSize: "16px",
                fontWeight: 700,
                textDecoration: "none",
                padding: "14px 28px",
                marginTop: "24px",
              }}
            >
              {t(locale, "manageBooking")}
            </Button>
            <Text style={{ margin: "20px 0 0", fontSize: "13px", color: MUTED }}>
              {t(locale, "calendarNote")}
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: "13px", color: MUTED }}>
              {t(locale, "cancellationLine")}
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: "13px", color: MUTED }}>
              {t(locale, "dispatchPhone", { phone: DISPATCH_PHONE })}
            </Text>
          </Section>
          <Section style={{ padding: "8px 32px 32px" }}>
            <Text style={{ margin: 0, fontSize: "12px", color: MUTED }}>
              {t(locale, "footer")}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function confirmationPlainText(booking: BookingForEmail): string {
  const locale = booking.locale;
  const leg = firstLeg(booking);
  const lines = [
    t(locale, "headline"),
    `${t(locale, "referenceLabel")} ${booking.reference}`,
  ];
  if (leg) {
    lines.push(`${t(locale, "fromLabel")}: ${leg.pickupText}`);
    lines.push(`${t(locale, "toLabel")}: ${leg.dropoffText}`);
    lines.push(t(locale, "pickupDetail"));
    lines.push(`${t(locale, "timeLabel")} ${leg.scheduledLocal}`);
    if (leg.flightNo) lines.push(leg.flightNo);
    lines.push(`${t(locale, "vehicleLabel")} ${leg.vehicleClassLabel}`);
    lines.push(t(locale, "paxLine", { pax: leg.pax, bags: leg.bags }));
    const extras = extraLabels(locale, booking.extras);
    if (extras.length > 0) {
      lines.push(`${t(locale, "payLink.extrasLabel")} ${extras.join(" · ")}`);
    }
  }
  lines.push(`${t(locale, "paidTotal")} ${formatPaidTotal(booking.totalRappen)}`);
  lines.push(booking.manageUrl);
  lines.push(t(locale, "calendarNote"));
  lines.push(t(locale, "cancellationLine"));
  lines.push(t(locale, "dispatchPhone", { phone: DISPATCH_PHONE }));
  lines.push(t(locale, "footer"));
  return lines.join("\n");
}

export function confirmationSubject(booking: BookingForEmail): string {
  return t(booking.locale, "subject", { reference: booking.reference });
}
