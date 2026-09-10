// packages/emails/src/OpsMustFixEmail.tsx
//
// D-55 / D-75 ops must-fix. PayLink envelope. No legal invention, no CHF,
// no auto-cancel copy beyond "the trip stays".

import type { ReactNode } from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { formatPickup } from "./PayLinkEmail";

const CHARCOAL = "#1E1F1F";
const GREY = "#DEDEDE";
const MUTED = "#545756";
const YELLOW = "#FDC20B";
const WHITE = "#FFFFFF";
const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';
const LOGO = "https://vamostaxi.site/brand/logo/wordmark-email.png";

const kicker = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const place = {
  margin: "4px 0 0",
  fontSize: "16px",
  lineHeight: "22px",
  fontWeight: 600,
  color: CHARCOAL,
};

export type OpsMustFixKind = "off-road" | "overlap";

export type OpsMustFixTrip = {
  reference: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
};

export type OpsMustFixForEmail = {
  locale: EmailLocale;
  kind: OpsMustFixKind;
  trips: OpsMustFixTrip[];
};

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

function Fact({
  label,
  children,
  first,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <Row>
      <Column style={{ paddingTop: first ? 0 : 16 }}>
        <Text style={kicker}>{label}</Text>
        <Text style={place}>{children}</Text>
      </Column>
    </Row>
  );
}

function refs(payload: OpsMustFixForEmail): string {
  return payload.trips.map((trip) => trip.reference).filter(Boolean).join(", ");
}

function headlineKey(kind: OpsMustFixKind): string {
  return kind === "overlap" ? "opsMustFix.overlapHeadline" : "opsMustFix.offRoadHeadline";
}

function bodyKey(kind: OpsMustFixKind): string {
  return kind === "overlap" ? "opsMustFix.overlapBody" : "opsMustFix.offRoadBody";
}

export function OpsMustFixEmail({ payload }: { payload: OpsMustFixForEmail }) {
  const locale = payload.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const reference = refs(payload);

  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{t(locale, headlineKey(payload.kind))}</Preview>
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
              {t(locale, headlineKey(payload.kind))}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED, lineHeight: "22px" }}>
              {t(locale, bodyKey(payload.kind))}
            </Text>
            {reference ? (
              <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED }}>
                {t(locale, "referenceLabel")} {ltr(reference)}
              </Text>
            ) : null}
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>

          {payload.trips.map((trip, index) => {
            const when = trip.scheduledLocal ? formatPickup(trip.scheduledLocal, locale) : "";
            return (
              <Section
                key={`${trip.reference}-${index}`}
                style={{ backgroundColor: WHITE, padding: "24px 32px 8px" }}
              >
                <Fact label={t(locale, "referenceLabel")} first>
                  {ltr(trip.reference)}
                </Fact>
                {trip.pickupText ? (
                  <Fact label={t(locale, "fromLabel")}>{trip.pickupText}</Fact>
                ) : null}
                {trip.dropoffText ? (
                  <Fact label={t(locale, "toLabel")}>{trip.dropoffText}</Fact>
                ) : null}
                {when ? <Fact label={t(locale, "timeLabel")}>{ltr(when)}</Fact> : null}
              </Section>
            );
          })}

          <Section style={{ backgroundColor: WHITE, padding: "8px 32px 32px" }} />
        </Container>
      </Body>
    </Html>
  );
}

export function opsMustFixPlainText(payload: OpsMustFixForEmail): string {
  const locale = payload.locale;
  const lines = [t(locale, headlineKey(payload.kind)), t(locale, bodyKey(payload.kind))];
  for (const trip of payload.trips) {
    lines.push(`${t(locale, "referenceLabel")} ${trip.reference}`);
    if (trip.pickupText) lines.push(`${t(locale, "fromLabel")}: ${trip.pickupText}`);
    if (trip.dropoffText) lines.push(`${t(locale, "toLabel")}: ${trip.dropoffText}`);
    if (trip.scheduledLocal) {
      lines.push(`${t(locale, "timeLabel")} ${formatPickup(trip.scheduledLocal, locale)}`);
    }
  }
  return lines.join("\n");
}

export function opsMustFixSubject(payload: OpsMustFixForEmail): string {
  const reference = refs(payload) || "Needs attention";
  return t(payload.locale, "opsMustFix.subject", { reference });
}
