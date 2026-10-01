// packages/emails/src/TripChangePayEmail.tsx
//
// 26.2 P6: a dearer change of places or time on a paid trip (a class change alone keeps P1's
// ClassChangePayEmail). The customer pays the difference on Stripe's page within 24 hours; then the
// trip changes by itself. Wording approved by the owner word for word in four languages (D14,
// .planning/decisions/2026-10-01-p6-paid-trip-edit.md): subject, heading, the text with one sentence
// per changed field (New pickup, New destination, New pickup time, New class, in that order) and the
// button — nothing else is said. Same light chrome as P1's mail. Amounts through the shared money
// formatter; never a typed CHF figure.

import type { ReactNode } from "react";
import { Body, Button, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import { formatPaidTotal } from "./ConfirmationEmail";
import { BODY_FONT, CHARCOAL, DISPLAY_FONT, GREY, LOGO, WHITE, YELLOW } from "./chrome";
import { formatPickup } from "./lib/pickup-time";
import { t } from "./lib/t";
import type { EmailLocale } from "./lib/types";

export type TripChangePayForEmail = {
  reference: string;
  locale: EmailLocale;
  /** Only what changed. scheduledLocal is the Zurich wall clock "YYYY-MM-DDTHH:MM". */
  changes: { pickup?: string; dropoff?: string; scheduledLocal?: string; className?: string };
  newTotalRappen: number | null;
  paidRappen: number | null;
  differenceRappen: number | null;
  /** The Stripe page for the difference (open 24 hours). */
  payUrl: string;
};

const NS = "tripChangePay";

type Money = { newTotal: string; paid: string; difference: string };

function money(mail: TripChangePayForEmail): Money {
  return {
    newTotal: formatPaidTotal(mail.newTotalRappen),
    paid: formatPaidTotal(mail.paidRappen),
    difference: formatPaidTotal(mail.differenceRappen),
  };
}

/** The changed fields as [message key, value], in the approved order. */
function changeLines(mail: TripChangePayForEmail): Array<[string, string]> {
  const c = mail.changes;
  const out: Array<[string, string]> = [];
  if (c.pickup) out.push(["pickup", c.pickup]);
  if (c.dropoff) out.push(["dropoff", c.dropoff]);
  if (c.scheduledLocal) out.push(["time", formatPickup(c.scheduledLocal, mail.locale)]);
  if (c.className) out.push(["class", c.className]);
  return out;
}

/** The four approved lines with this booking's values. */
export function tripChangePayCopy(mail: TripChangePayForEmail): {
  subject: string;
  heading: string;
  text: string;
  button: string;
} {
  const v = { reference: mail.reference, ...money(mail) };
  const sentences = changeLines(mail).map(([key, value]) => `${t(mail.locale, `${NS}.${key}`, { value })}.`);
  return {
    subject: t(mail.locale, `${NS}.subject`, v),
    heading: t(mail.locale, `${NS}.heading`, v),
    text: [t(mail.locale, `${NS}.intro`, v), ...sentences, t(mail.locale, `${NS}.money`, v)].join(" "),
    button: t(mail.locale, `${NS}.button`, v),
  };
}

function ltr(value: string, key: string): ReactNode {
  return (
    <span key={key} style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

/** A template with each value in a left-to-right island (references, places and CHF never flip in Arabic). */
function islands(template: string, values: Record<string, string>, prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let n = 0;
  for (const m of template.matchAll(/\{([a-zA-Z]+)\}/g)) {
    const name = m[1]!;
    if (!Object.prototype.hasOwnProperty.call(values, name)) continue;
    const index = m.index ?? 0;
    if (index > at) out.push(template.slice(at, index));
    out.push(ltr(values[name]!, `${prefix}${n++}`));
    at = index + m[0].length;
  }
  if (at < template.length) out.push(template.slice(at));
  return out;
}

/** t() with no values leaves the {placeholders} in place. */
function raw(locale: EmailLocale, key: string): string {
  return t(locale, `${NS}.${key}`);
}

function textNodes(mail: TripChangePayForEmail): ReactNode[] {
  const locale = mail.locale;
  const out: ReactNode[] = [...islands(raw(locale, "intro"), { reference: mail.reference }, "i")];
  changeLines(mail).forEach(([key, value], i) => {
    out.push(" ");
    out.push(...islands(raw(locale, key), { value }, `l${i}-`));
    out.push(".");
  });
  out.push(" ");
  out.push(...islands(raw(locale, "money"), money(mail), "m"));
  return out;
}

export function TripChangePayEmail({ mail }: { mail: TripChangePayForEmail }) {
  const locale = mail.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const copy = tripChangePayCopy(mail);
  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{copy.heading}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 20px" }}>
            <Img
              src={LOGO}
              width={216}
              height={30}
              alt="Vamos Taxi"
              style={{ display: "block", border: "0", outline: "none", width: "216px", height: "30px" }}
            />
            <Text
              style={{
                margin: "20px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "28px",
                lineHeight: "34px",
                fontWeight: 600,
                color: CHARCOAL,
              }}
            >
              {copy.heading}
            </Text>
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>&nbsp;</Section>

          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 32px" }}>
            <Text style={{ margin: 0, fontSize: "16px", lineHeight: "26px", color: CHARCOAL }}>{textNodes(mail)}</Text>
            <Button
              href={mail.payUrl}
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
              {copy.button}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function tripChangePayPlainText(mail: TripChangePayForEmail): string {
  const copy = tripChangePayCopy(mail);
  return [copy.heading, copy.text, copy.button, mail.payUrl].join("\n\n");
}

export function tripChangePaySubject(mail: TripChangePayForEmail): string {
  return tripChangePayCopy(mail).subject;
}
