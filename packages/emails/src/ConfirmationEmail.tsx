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
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { BookingForEmail, EmailLocale, EmailMoney, EmailMoneyLine } from "./lib/types";
import { paxBagsLine, t } from "./lib/t";
import { extraNames } from "./lib/extras";
import { formatPickup } from "./lib/pickup-time";
import {
  BODY_FONT,
  CHARCOAL,
  DISPLAY_FONT,
  GREY,
  LOGO,
  MUTED,
  WHITE,
  YELLOW,
} from "./chrome";
import { ltrText, PHONE_DISPLAY } from "./layout";

const DISPATCH_PHONE = PHONE_DISPLAY;

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

/**
 * The approved `dispatchPhone` line with the phone in a left-to-right island, so Arabic reads
 * `+41 79 626 70 82` (261002 F1). `t()` with no values leaves `{phone}` in place; the text
 * around it is the message as written.
 */
function dispatchLine(locale: EmailLocale) {
  const template = t(locale, "dispatchPhone");
  const at = template.indexOf("{phone}");
  if (at < 0) return t(locale, "dispatchPhone", { phone: DISPATCH_PHONE });
  return (
    <>
      {template.slice(0, at)}
      {ltr(DISPATCH_PHONE)}
      {template.slice(at + "{phone}".length)}
    </>
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

/** Signed CHF amount; negative rows (voucher) read `−CHF 10.00`. */
function signedChf(rappen: number): string {
  return rappen < 0 ? `\u2212${formatPaidTotal(-rappen)}` : formatPaidTotal(rappen);
}

/** Presentment amount in the customer's currency, minor units to major. */
export function formatMinor(amountMinor: number, currency: string): string {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  return `${currency} ${(amountMinor / 10 ** digits).toFixed(digits)}`;
}

function moneyRowLabel(locale: EmailLocale, line: EmailMoneyLine, vatRateBps: number): string {
  switch (line.kind) {
    case "fare":
      return t(locale, "money.fare", { class: line.label });
    case "coupon":
      return t(locale, "money.voucher", { code: line.label });
    case "vat":
      return t(locale, "money.vat", { rate: formatRate(vatRateBps) });
    default:
      return line.label;
  }
}

/**
 * The booking stores VAT in tenths of a percent (settings.vat_rate_bps: 81 is
 * 8.1 %, see apps/web/lib/checkout/vat.ts). 81 -> "8.1", 80 -> "8". Never hard-coded.
 */
function formatRate(stored: number): string {
  return String(Number((stored / 10).toFixed(2)));
}

function presentmentLine(locale: EmailLocale, money: EmailMoney): string | null {
  if (!money.presentment || money.presentment.currency.toUpperCase() === "CHF") return null;
  return t(locale, "money.presented", {
    paid: formatMinor(money.presentment.amountMinor, money.presentment.currency),
    currency: money.presentment.currency,
    received: formatPaidTotal(money.chargedRappen),
  });
}

const labelStyle = { margin: 0, fontSize: "14px", color: CHARCOAL } as const;
const figureStyle = { margin: 0, fontFamily: DISPLAY_FONT, fontSize: "14px", color: CHARCOAL, textAlign: "end" } as const;

function MoneyBlock({ locale, money }: { locale: EmailLocale; money: EmailMoney }) {
  const note = presentmentLine(locale, money);
  return (
    <>
      {money.lines.map((line, i) => (
        <Row key={i} style={{ borderBottom: `1px solid ${GREY}` }}>
          <Column style={{ padding: "8px 0" }}>
            <Text style={labelStyle}>{moneyRowLabel(locale, line, money.vatRateBps)}</Text>
          </Column>
          <Column style={{ padding: "8px 0", width: "40%" }}>
            <Text style={figureStyle}>{ltr(signedChf(line.amountRappen))}</Text>
          </Column>
        </Row>
      ))}
      <Row style={{ borderTop: `2px solid ${CHARCOAL}` }}>
        <Column style={{ padding: "10px 0 0" }}>
          <Text style={{ ...labelStyle, fontWeight: 700 }}>{t(locale, "money.total")}</Text>
        </Column>
        <Column style={{ padding: "10px 0 0", width: "40%" }}>
          <Text style={{ ...figureStyle, fontSize: "22px", fontWeight: 700 }}>
            {ltr(formatPaidTotal(money.chargedRappen))}
          </Text>
        </Column>
      </Row>
      {note ? <Text style={{ margin: "8px 0 0", fontSize: "13px", color: MUTED }}>{note}</Text> : null}
    </>
  );
}

export function ConfirmationEmail({ booking }: { booking: BookingForEmail }) {
  const locale: EmailLocale = booking.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const leg = firstLeg(booking);
  const amount = formatPaidTotal(booking.money?.chargedRappen ?? booking.totalRappen);
  const extras = extraNames(locale, booking.extras);

  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{t(locale, "preheader")}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ padding: "28px 32px 20px" }}>
            <Img
              src={LOGO}
              width={216}
              height={30}
              alt="Vamos Taxi"
              style={{ display: "block", border: "0", outline: "none", width: "216px", height: "30px" }}
            />
          </Section>
          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>
          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "24px", fontWeight: 600, color: CHARCOAL }}>
              {t(locale, "statusWord")}
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
                  {t(locale, "timeLabel")} {ltr(formatPickup(leg.scheduledLocal, locale))}
                  {leg.flightNo ? <> · {ltr(leg.flightNo)}</> : null}
                </Text>
                <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                  {t(locale, "vehicleLabel")} {leg.vehicleClassLabel}
                  {" · "}
                  {paxBagsLine(locale, leg.pax, leg.bags)}
                </Text>
                {extras.length > 0 ? (
                  <Text style={{ margin: "8px 0 0", fontSize: "14px", color: CHARCOAL }}>
                    {t(locale, "payLink.extrasLabel")} {extras.join(" · ")}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Hr style={{ borderColor: GREY, margin: "24px 0" }} />
            {booking.money ? (
              <MoneyBlock locale={locale} money={booking.money} />
            ) : (
              <>
                <Text style={{ margin: 0, fontSize: "12px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t(locale, "paidTotal")}
                </Text>
                <Text style={{ margin: "4px 0 0", fontFamily: DISPLAY_FONT, fontSize: "22px", fontWeight: 700, color: CHARCOAL }}>
                  {ltr(amount)}
                </Text>
              </>
            )}
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
              {dispatchLine(locale)}
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
    t(locale, "statusWord"),
    `${t(locale, "referenceLabel")} ${booking.reference}`,
  ];
  if (leg) {
    lines.push(`${t(locale, "fromLabel")}: ${leg.pickupText}`);
    lines.push(`${t(locale, "toLabel")}: ${leg.dropoffText}`);
    lines.push(t(locale, "pickupDetail"));
    lines.push(`${t(locale, "timeLabel")} ${formatPickup(leg.scheduledLocal, locale)}`);
    if (leg.flightNo) lines.push(leg.flightNo);
    lines.push(`${t(locale, "vehicleLabel")} ${leg.vehicleClassLabel}`);
    lines.push(paxBagsLine(locale, leg.pax, leg.bags));
    const extras = extraNames(locale, booking.extras);
    if (extras.length > 0) {
      lines.push(`${t(locale, "payLink.extrasLabel")} ${extras.join(" · ")}`);
    }
  }
  if (booking.money) {
    for (const line of booking.money.lines) {
      lines.push(`${moneyRowLabel(locale, line, booking.money.vatRateBps)}: ${signedChf(line.amountRappen)}`);
    }
    lines.push(`${t(locale, "money.total")}: ${formatPaidTotal(booking.money.chargedRappen)}`);
    const note = presentmentLine(locale, booking.money);
    if (note) lines.push(note);
  } else {
    lines.push(`${t(locale, "paidTotal")} ${formatPaidTotal(booking.totalRappen)}`);
  }
  lines.push(booking.manageUrl);
  lines.push(t(locale, "calendarNote"));
  lines.push(t(locale, "cancellationLine"));
  // Arabic only: the phone between LRI and PDI so it reads left to right; en/de/fr unchanged.
  lines.push(t(locale, "dispatchPhone", { phone: ltrText(locale, DISPATCH_PHONE) }));
  lines.push(t(locale, "footer"));
  return lines.join("\n");
}

export function confirmationSubject(booking: BookingForEmail): string {
  return t(booking.locale, "subject", { reference: booking.reference });
}
