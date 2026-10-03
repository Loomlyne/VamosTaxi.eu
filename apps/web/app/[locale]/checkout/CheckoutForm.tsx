"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { chfRappenToDisplay } from "@/lib/fx/format";
import { useFx } from "@/lib/fx/use-fx";
import { useVamosLocale } from "@/lib/locale-shim";
import { airportByName } from "@/lib/checkout/trip-editor-rules";
import { geoLocale } from "@/lib/checkout/geo-locale";
import { tripIsQuotable, type QuoteResult } from "@/lib/checkout/checkout-quote";
import type { ChargeLine } from "@/lib/checkout/checkout-charge";
import { extraLabel, type ExtraNames } from "@/lib/checkout/extra-label";
import {
  buildIntentBody,
  checkoutReturnPath,
  isStripeCheckoutUrl,
  readReturnStash,
  sameSelectionAsResumed,
  signInHref,
  writeReturnStash,
  type CompanyInput,
  type ContactInput,
} from "@/lib/checkout/pay-flow";
import {
  firstSectionError,
  type AccountPayField,
  type PayErrorKey,
  type PayField,
} from "@/lib/checkout/pay-validate";
import { accountIntentBlock, mapAccountCode } from "@/lib/checkout/account-pay";
import { payIdemAfter, payIdemFor, type PayIdem } from "@/lib/checkout/pay-idempotency";
import { lockForVoucher, signVoucherLock, type VoucherLock } from "@/lib/checkout/voucher-lock";
import type { AccountChoiceValue } from "@/components/checkout/AccountChoice";
import type { CheckoutSignInStage } from "@/components/checkout/CheckoutSignIn";
import { useQuoteLabel } from "@/lib/checkout/quote-label";
import { buildTripQuery, normaliseFlight, parseTripQuery, type Trip } from "@/lib/checkout/trip-url";
import { finishPathFrom } from "@/lib/auth/finish-path";
import { useCheckoutFlow } from "./CheckoutPage";
import { useCheckoutSettings } from "./CheckoutSettings";


export type ExtraItem = { code: string; amountRappen: number; names: ExtraNames };

export type PriceState =
  | { kind: "idle" }
  | { kind: "updating" }
  | { kind: "ok"; lines: ChargeLine[]; netRappen: number; vatRappen: number; chargedRappen: number }
  | { kind: "error"; code: string };

export type PayStatus = "idle" | "loading" | "error";

type ResumeOpen = {
  state: "open";
  url: string;
  booking_id: string;
  quote_id: string;
  trip_query: string;
  contact: { name: string; email: string; phone: string };
  company: { name: string; address: string; vat: string };
  note: string;
  class: string | null;
  extra_codes: string[];
  coupon: string | null;
  charged_rappen: number;
};
type ResumeExpired = Omit<ResumeOpen, "state" | "url"> & { state: "expired" };
type ResumeAnswer =
  | { state: "none" }
  | { state: "purged" }
  | { state: "paid"; reference: string }
  | ResumeOpen
  | ResumeExpired;

/** A Turnstile challenge the server asked for during a re-quote from the page body. */
export type PageChallenge = { text: string; next: Trip };

export type CheckoutForm = {
  // contact (never in the URL or in localStorage)
  contact: ContactInput;
  setContact: (patch: Partial<ContactInput>) => void;
  signedInEmail: string | null;
  signInHref: string;
  /** Called on the sign-in click: parks voucher, company and note in this tab. */
  stashForSignIn: () => void;
  // account choice (26.5)
  accountChoice: AccountChoiceValue;
  changeAccountChoice: (v: AccountChoiceValue) => void;
  createConsent: boolean;
  setCreateConsent: (on: boolean) => void;
  createConsentError: string | null;
  createHidden: boolean;
  accountError: string | null;
  signInStage: CheckoutSignInStage;
  onSignInStage: (s: CheckoutSignInStage) => void;
  sentBlockError: string | null;
  returnPath: string;
  refreshSignedIn: () => void;
  accountResetNonce: number;
  setAccountTurnstile: (token: string | null) => void;
  // flight
  airport: boolean;
  flight: string;
  setFlight: (value: string) => void;
  flightBlur: () => void;
  flightError: string | null;
  // extras
  extras: ExtraItem[];
  ticked: string[];
  toggleExtra: (code: string, on: boolean) => void;
  extraName: (item: ExtraItem) => string;
  // company + note
  companyOpen: boolean;
  setCompanyOpen: (open: boolean) => void;
  company: CompanyInput;
  setCompany: (patch: Partial<CompanyInput>) => void;
  noteOpen: boolean;
  setNoteOpen: (open: boolean) => void;
  note: string;
  setNote: (value: string) => void;
  // voucher
  voucherOpen: boolean;
  setVoucherOpen: (open: boolean) => void;
  voucherDraft: string;
  setVoucherDraft: (value: string) => void;
  voucher: string | null;
  voucherApplied: boolean;
  voucherError: "couponNotFound" | "couponNoLongerValid" | null;
  applyVoucher: () => void;
  removeVoucher: () => void;
  // price (server only)
  price: PriceState;
  /** The formatted screen total, or the words that stand in for it. */
  totalView: { total: string | null; note: string | null };
  displayAmount: (rappen: number) => { major: number | null; currency: "CHF" | "EUR" | "USD" | "AED" };
  // PAY
  fieldErrors: Partial<Record<PayField, PayErrorKey>>;
  payStatus: PayStatus;
  payError: string | null;
  liveMessage: string;
  pay: () => void;
  paying: boolean;
  payDisabled: boolean;
  // return and expiry
  notice: "back" | "expired" | null;
  quoteExpired: boolean;
  seeCurrentPrices: () => void;
  challenge: PageChallenge | null;
  submitChallengeToken: (token: string | null) => void;
  challengeText: string;
};

const FormContext = createContext<CheckoutForm | null>(null);

export function useCheckoutForm(): CheckoutForm {
  const value = useContext(FormContext);
  if (!value) throw new Error("useCheckoutForm requires CheckoutFormProvider");
  return value;
}

const FIELD_SELECTOR: Record<PayField | AccountPayField, string> = {
  class: "#co-section-class [data-co-class][data-eligible='true'] button, #co-section-class",
  firstName: '[data-co-contact] input[autocomplete="given-name"]',
  lastName: '[data-co-contact] input[autocomplete="family-name"]',
  email: '[data-co-contact] input[autocomplete="email"]',
  mobile: "[data-co-contact] [data-vt-phone] input",
  flight: "[data-co-s2-flight] input",
  companyName: "[data-co-company-name] input",
  account: "[data-co-account] input[type=radio]:checked, [data-co-account]",
  accountSent: "[data-co-account] [data-acct-sent-heading]",
  accountConsent: "[data-co-account] [data-acct-consent] input[type=checkbox]",
};

function scrollAndFocus(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (!el.hasAttribute("tabindex") && !/^(input|button|textarea|select|a)$/i.test(el.tagName)) {
    el.setAttribute("tabindex", "-1");
  }
  el.focus({ preventScroll: true });
}

function splitName(full: string): { first: string; last: string } {
  const t = full.trim();
  const at = t.indexOf(" ");
  return at < 0 ? { first: t, last: "" } : { first: t.slice(0, at), last: t.slice(at + 1).trim() };
}

export function CheckoutFormProvider({ children }: { children: ReactNode }) {
  const flow = useCheckoutFlow();
  const t = useTranslations("checkout");
  const label = useQuoteLabel();
  const { cur } = useVamosLocale();
  const fx = useFx();
  const settings = useCheckoutSettings();
  const { trip, quote, phase, selectedClass, locale } = flow;

  const [contact, setContactState] = useState<ContactInput>({ firstName: "", lastName: "", email: "", mobile: "" });
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [accountChoice, setAccountChoice] = useState<AccountChoiceValue>("guest"); // owner: guest preselected
  const [createConsent, setCreateConsent] = useState(false);
  const [signInStage, setSignInStage] = useState<CheckoutSignInStage>("form");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [createConsentError, setCreateConsentError] = useState<string | null>(null);
  const [sentBlockError, setSentBlockError] = useState<string | null>(null);
  const [createHidden, setCreateHidden] = useState(false);
  const [accountTurnstile, setAccountTurnstile] = useState<string | null>(null);
  const [accountResetNonce, setAccountResetNonce] = useState(0);
  // 26.2 audit U06-21: when "create an account" goes away (hidden after an answer, or switched
  // off), the held choice follows what the radio group shows, so PAY never sends "create".
  const createAvailable = settings.accountCreateAvailable && !createHidden;
  useEffect(() => {
    if (!createAvailable && accountChoice === "create") setAccountChoice("guest");
  }, [createAvailable, accountChoice]);
  const [flight, setFlightState] = useState(trip.flightDisplay ?? "");
  const [flightError, setFlightError] = useState<string | null>(null);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [ticked, setTicked] = useState<string[]>(trip.extras);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [company, setCompanyState] = useState<CompanyInput>({ name: "", address: "", vat: "" });
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherDraft, setVoucherDraft] = useState("");
  const [voucher, setVoucher] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<CheckoutForm["voucherError"]>(null);
  const [price, setPrice] = useState<PriceState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PayField, PayErrorKey>>>({});
  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [notice, setNotice] = useState<"back" | "expired" | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [challenge, setChallenge] = useState<PageChallenge | null>(null);
  const [resume, setResume] = useState<ResumeOpen | ResumeExpired | null>(null);

  const priceSeq = useRef(0);
  const requoteTries = useRef(0);
  const started = useRef(false);
  const idem = useRef<PayIdem | null>(null);
  // The lock re-signed with the voucher in it (U11-1); the price call and PAY both send it.
  const voucherLock = useRef<VoucherLock | null>(null);
  const tripRef = useRef(trip);
  const contactRef = useRef(contact);
  contactRef.current = contact;
  tripRef.current = trip;

  // Airport status comes from the pickup place only (D-09), never from a flight being present.
  const [airportLookup, setAirportLookup] = useState<{ key: string; isAirport: boolean } | null>(null);
  const placeKey = trip.fid && trip.gs ? `${trip.fid}|${trip.gs}` : null;
  useEffect(() => {
    if (!placeKey || !trip.fid || !trip.gs) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/geo/retrieve?mapbox_id=${encodeURIComponent(trip.fid as string)}` +
            `&session_token=${encodeURIComponent(trip.gs as string)}` +
            `&locale=${encodeURIComponent(geoLocale(locale))}`,
          { credentials: "same-origin" },
        );
        const json = (await res.json()) as { place?: { isAirport?: boolean } | null };
        if (alive && typeof json.place?.isAirport === "boolean") {
          setAirportLookup({ key: placeKey, isAirport: json.place.isAirport });
        }
      } catch {
        // the name test stays as the hint
      }
    })();
    return () => {
      alive = false;
    };
  }, [placeKey]);
  const airport =
    airportLookup && airportLookup.key === placeKey ? airportLookup.isAirport : airportByName(trip.from ?? "");

  // Codes the live book actually has. Until it is read nothing is priced.
  const tickedValid = useMemo(
    () => (catalogReady ? ticked.filter((code) => extras.some((e) => e.code === code)) : []),
    [catalogReady, ticked, extras],
  );

  const displayAmount = useCallback(
    (rappen: number) => {
      const shown = chfRappenToDisplay(rappen, cur, fx.rates?.rates ?? null);
      return { major: shown.major, currency: shown.currency };
    },
    [cur, fx.rates],
  );

  const setContact = useCallback((patch: Partial<ContactInput>) => {
    setContactState((prev) => ({ ...prev, ...patch }));
    if ("email" in patch) {
      // The tick belongs to the e-mail it was given for (checker rec. 5, T-26.5-31).
      setCreateConsent(false);
      setCreateConsentError(null);
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      if ("firstName" in patch) delete next.firstName;
      if ("lastName" in patch) delete next.lastName;
      if ("email" in patch) delete next.email;
      if ("mobile" in patch) delete next.mobile;
      return next;
    });
  }, []);

  const setCompany = useCallback((patch: Partial<CompanyInput>) => {
    setCompanyState((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) => {
      const { companyName: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }, []);

  // ── Extras catalogue (D-14/D-35): names from data, never a hard-coded map ─────────────
  const loadExtras = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/extras", { credentials: "same-origin" });
      const json = (await res.json()) as {
        ok?: boolean;
        extras?: { code?: unknown; amount_rappen?: unknown; names?: ExtraNames }[];
      };
      if (!res.ok || json.ok !== true) {
        // 26.2 audit U11-6: a 503 outage keeps the extras already loaded; wiping them would
        // silently drop what the customer ticked. The next price/requote asks again.
        setCatalogReady(true);
        return;
      }
      const list: ExtraItem[] = [];
      for (const row of json.extras ?? []) {
        if (typeof row.code !== "string") continue;
        const amount = typeof row.amount_rappen === "number" ? row.amount_rappen : Number(row.amount_rappen);
        if (!Number.isFinite(amount) || amount < 0) continue;
        list.push({ code: row.code, amountRappen: Math.trunc(amount), names: row.names ?? null });
      }
      setExtras(list);
    } catch {
      // network failure: same as an outage — keep what is loaded
    }
    setCatalogReady(true);
  }, []);

  // ── Requote from the page body; a challenge shows where the customer is ──────────────
  const requoteTrip = useCallback(
    async (next: Trip, token?: string | null) => {
      const result = await flow.applyTrip(next, token);
      if (result.kind === "ok") {
        setChallenge(null);
        setQuoteExpired(false);
        return result;
      }
      if (result.challenge) {
        const text = (result.i18nKey ? label(result.i18nKey, result.params ?? undefined) : "") || t("quoteGeneric");
        setChallenge({ text, next });
      } else {
        setChallenge(null);
      }
      return result;
    },
    [flow, label, t],
  );

  const submitChallengeToken = useCallback(
    (token: string | null) => {
      if (!token || !challenge) return;
      const next = challenge.next;
      void (async () => {
        // One re-sign with the solved token. A flight edit that still fails says so on the flight field.
        const result = await requoteTrip(next, token);
        if (result.kind === "error" && !result.challenge && (next.flight ?? null) !== (tripRef.current.flight ?? null)) {
          setFlightError((result.i18nKey ? label(result.i18nKey, result.params ?? undefined) : "") || t("quoteGeneric"));
        }
      })();
    },
    [challenge, requoteTrip, label, t],
  );

  // Signed-in state comes only from the server session (T-26.5-28). Prefill fills empty
  // fields only, from this customer's own row (D-01, T-26.5-30).
  const refreshSignedIn = useCallback(
    async (announceIt = true) => {
      try {
        const res = await fetch("/api/checkout/me", { credentials: "same-origin" });
        const me = (await res.json()) as {
          signed_in?: boolean;
          finish_required?: boolean;
          email?: string;
          first_name?: string;
          last_name?: string;
          phone?: string;
        };
        // 27.1 (27 D-37): an account the sign-in link made finishes (name, the tick) before it can pay.
        if (me.signed_in && me.finish_required) {
          window.location.replace(finishPathFrom(window.location.pathname, window.location.search));
          return;
        }
        if (me.signed_in && me.email) {
          setSignedInEmail(me.email);
          const next = {
            firstName: contactRef.current.firstName || me.first_name || "",
            lastName: contactRef.current.lastName || me.last_name || "",
            email: contactRef.current.email || me.email || "",
            mobile: contactRef.current.mobile || (me.phone ?? ""),
          };
          setContactState(next);
          if (announceIt) {
            setLiveMessage(t("signedInAs", { email: me.email }));
            const missing = !next.firstName
              ? FIELD_SELECTOR.firstName
              : !next.lastName
                ? FIELD_SELECTOR.lastName
                : !next.mobile
                  ? FIELD_SELECTOR.mobile
                  : "[data-co-pay]";
            window.setTimeout(() => scrollAndFocus(missing), 50);
          }
        }
      } catch {
        // guest: nothing to prefill
      }
    },
    [t],
  );

  // The tab that started a sign-in picks the session up when the customer comes back to it (D-07).
  useEffect(() => {
    if (signedInEmail) return;
    const onFocus = () => void refreshSignedIn();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [signedInEmail, refreshSignedIn]);

  // ── Mount: catalogue, signed-in prefill, sign-in return stash, resume ─────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadExtras();

    const stash = readReturnStash(window.sessionStorage);
    if (stash) {
      if (stash.voucher) {
        setVoucher(stash.voucher);
        setVoucherDraft(stash.voucher);
        setVoucherOpen(true);
      }
      if (stash.company.name || stash.company.address || stash.company.vat) {
        setCompanyState(stash.company);
        setCompanyOpen(true);
      }
      if (stash.note) {
        setNote(stash.note);
        setNoteOpen(true);
      }
    }

    void refreshSignedIn(false);

    const resumeId = trip.resume;
    if (!resumeId) return;
    void (async () => {
      let answer: ResumeAnswer | null = null;
      try {
        const res = await fetch(`/api/checkout/resume?quote=${encodeURIComponent(resumeId)}`, {
          credentials: "same-origin",
        });
        answer = (await res.json()) as ResumeAnswer;
      } catch {
        answer = null;
      }
      const quotable = tripIsQuotable(tripRef.current);
      if (!answer || answer.state === "none" || answer.state === "purged") {
        // D-16 / G2: this browser cannot resume that booking, so it must not pass the other
        // browser's quote id on. The link keeps the trip, class and extras (D-16a).
        const kept = buildTripQuery(tripRef.current);
        if (window.location.search.replace(/^\?/, "") !== kept) {
          window.history.replaceState(window.history.state, "", `${window.location.pathname}?${kept}`);
        }
      }
      if (!answer || answer.state === "none") {
        if (!quotable) flow.resumeFailed();
        return;
      }
      if (answer.state === "paid") {
        window.location.assign(`/confirmation/${encodeURIComponent(answer.reference)}`);
        return;
      }
      if (answer.state === "purged") {
        setNotice("expired");
        if (!quotable) flow.resumeFailed();
        return;
      }
      // open or expired: refill everything
      const { first, last } = splitName(answer.contact.name);
      setContactState({ firstName: first, lastName: last, email: answer.contact.email, mobile: answer.contact.phone });
      setCreateConsent(false);
      setCompanyState({ name: answer.company.name, address: answer.company.address, vat: answer.company.vat });
      setCompanyOpen(Boolean(answer.company.name || answer.company.address || answer.company.vat));
      setNote(answer.note);
      setNoteOpen(Boolean(answer.note));
      setTicked(answer.extra_codes);
      if (answer.coupon) {
        setVoucher(answer.coupon);
        setVoucherDraft(answer.coupon);
        setVoucherOpen(true);
      }
      setResume(answer);
      flow.setResumeBookingId(answer.booking_id);
      setNotice(answer.state === "open" ? "back" : "expired");
      if (!quotable) {
        const parsed = parseTripQuery(new URLSearchParams(answer.trip_query)).trip;
        const restored: Trip = { ...parsed, class: answer.class, extras: answer.extra_codes, resume: resumeId, pay: tripRef.current.pay };
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${buildTripQuery(restored, { resume: true, pay: true })}`);
        setFlightState(restored.flightDisplay ?? "");
        await requoteTrip(restored);
      } else if (answer.class) {
        flow.setSelectedClass(answer.class);
      }
    })();
    // one time
  }, []);

  useEffect(() => {
    if (notice !== "back") return;
    const id = window.setTimeout(() => {
      document.querySelector("[data-co-back-notice]")?.scrollIntoView({ block: "center" });
    }, 250);
    return () => window.clearTimeout(id);
  }, [notice]);

  // ── The quote lock runs out while the customer is on the page ────────────────────────
  useEffect(() => {
    if (!quote) return;
    const ms = Date.parse(quote.expiresAt) - Date.now();
    if (!Number.isFinite(ms)) return;
    if (ms <= 0) {
      setQuoteExpired(true);
      return;
    }
    const id = window.setTimeout(() => setQuoteExpired(true), Math.min(ms, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [quote]);

  // ── Server pricing (D-19): the browser never adds amounts ────────────────────────────
  const priceKey =
    quote && selectedClass && catalogReady && phase.kind === "ready" && !flow.pricingNotLive && !quoteExpired
      ? JSON.stringify([quote.lock, selectedClass, [...tickedValid].sort(), voucher])
      : null;

  useEffect(() => {
    if (!priceKey || !quote || !selectedClass) {
      setPrice({ kind: "idle" });
      return;
    }
    const mine = ++priceSeq.current;
    // A flight-only re-sign changes the lock but never the price: refresh without the loading state.
    if (flow.silentLock.current !== quote.lock) setPrice({ kind: "updating" });
    void (async () => {
      // 26.2 audit U11-1: a voucher is signed into the lock first, so the price shown is the
      // price PAY accepts. Without one the lock is used as it is.
      let lock = lockForVoucher(quote.lock, voucher, voucherLock.current);
      if (lock === null && voucher) {
        const signed = await signVoucherLock(fetch, {
          quoteId: quote.quoteId,
          lock: quote.lock,
          voucher,
          locale: geoLocale(locale),
          displayCurrency: cur === "EUR" || cur === "USD" || cur === "AED" ? cur : "CHF",
          preferredClass: selectedClass,
        });
        if (mine !== priceSeq.current) return;
        if (!signed.ok) {
          if (signed.code === "quote_expired") setQuoteExpired(true);
          setPrice({ kind: "error", code: signed.code });
          return;
        }
        voucherLock.current = { base: quote.lock, voucher, lock: signed.lock };
        lock = signed.lock;
      }
      let status = 0;
      let json: Record<string, unknown> | null = null;
      try {
        const res = await fetch("/api/checkout/price", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lock,
            vehicle_class: selectedClass,
            extra_codes: tickedValid,
            coupon: voucher,
          }),
        });
        status = res.status;
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = null;
      }
      if (mine !== priceSeq.current) return;
      if (json && status === 200 && json.ok === true) {
        requoteTries.current = 0;
        setVoucherError(null);
        setPrice({
          kind: "ok",
          lines: (json.lines as ChargeLine[]) ?? [],
          netRappen: Number(json.net_rappen),
          vatRappen: Number(json.vat_rappen),
          chargedRappen: Number(json.charged_rappen),
        });
        return;
      }
      const code = typeof json?.code === "string" ? json.code : "network";
      if (code === "coupon_not_found" || code === "coupon_no_longer_valid") {
        setVoucherError(code === "coupon_not_found" ? "couponNotFound" : "couponNoLongerValid");
        setVoucher(null); // reprices without it
        return;
      }
      if (code === "quote_expired") {
        setQuoteExpired(true);
        setPrice({ kind: "error", code });
        return;
      }
      if ((code === "price_changed" || code === "class_unavailable") && requoteTries.current < 2) {
        requoteTries.current += 1;
        setPrice({ kind: "updating" });
        void loadExtras();
        void requoteTrip(tripRef.current);
        return;
      }
      setPrice({ kind: "error", code });
    })();
    // priceKey covers lock, class, extras and voucher
  }, [priceKey]);

  // ── Extras, voucher ───────────────────────────────────────────────────────────────────
  const toggleExtra = useCallback((code: string, on: boolean) => {
    setTicked((prev) => (on ? (prev.includes(code) ? prev : [...prev, code]) : prev.filter((c) => c !== code)));
  }, []);

  const extraName = useCallback((item: ExtraItem) => extraLabel(item.names, item.code, locale), [locale]);

  const applyVoucher = useCallback(() => {
    const code = voucherDraft.trim();
    if (!code) return;
    setVoucherError(null);
    setVoucher(code);
  }, [voucherDraft]);

  const removeVoucher = useCallback(() => {
    setVoucher(null);
    setVoucherDraft("");
    setVoucherError(null);
  }, []);

  const voucherApplied =
    voucher !== null && price.kind === "ok" && price.lines.some((line) => line.kind === "coupon");

  // ── Flight (airport pickups): a change re-quotes because the airport fee depends on it ─
  const setFlight = useCallback((value: string) => {
    setFlightState(value);
    setFlightError(null);
    setFieldErrors((prev) => {
      const { flight: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }, []);

  /** A flight re-sign that the server answers with a challenge mounts the page challenge; any other refusal shows on the flight field. */
  const showResignOutcome = useCallback(
    (result: QuoteResult, next: Trip) => {
      if (result.kind !== "error") return;
      if (result.challenge) {
        const text = (result.i18nKey ? label(result.i18nKey, result.params ?? undefined) : "") || t("quoteGeneric");
        setChallenge({ text, next });
        return;
      }
      setFlightError((result.i18nKey ? label(result.i18nKey, result.params ?? undefined) : "") || t("quoteGeneric"));
    },
    [label, t],
  );

  const flightBlur = useCallback(() => {
    const raw = flight.trim();
    if (!raw) return;
    const parsed = normaliseFlight(raw);
    if (!parsed) {
      setFieldErrors((prev) => ({ ...prev, flight: "errFlightCheck" }));
      return;
    }
    if (parsed.flight === tripRef.current.flight) return;
    void (async () => {
      const next = { ...tripRef.current, flight: parsed.flight, flightDisplay: parsed.display };
      const result = await flow.resignFlight(next);
      showResignOutcome(result, next);
    })();
  }, [flight, flow, showResignOutcome]);

  // ── Totals ────────────────────────────────────────────────────────────────────────────
  const totalView = useMemo(() => {
    if (phase.kind === "loading") return { total: null, note: t("gettingPrices") };
    if (flow.pricingNotLive) return { total: flow.money(null), note: null };
    if (!selectedClass) return { total: null, note: t("chooseClass") };
    if (quoteExpired) return { total: null, note: t("seeCurrentPrices") };
    if (price.kind === "ok") return { total: flow.money(price.chargedRappen), note: null };
    if (price.kind === "error") return { total: null, note: t("tryAgain") };
    return { total: null, note: t("updatingPrice") };
  }, [phase.kind, flow, selectedClass, quoteExpired, price, t]);

  // ── PAY ───────────────────────────────────────────────────────────────────────────────
  const announce = useCallback((text: string) => setLiveMessage(text), []);

  const pay = useCallback(() => {
    if (payStatus === "loading") return;
    setPayError(null);
    setAccountError(null);
    setCreateConsentError(null);
    setSentBlockError(null);

    if (flow.editorOpen) {
      if (flow.editorDirty.current) {
        const text = t("updateFirst");
        setPayStatus("error");
        setPayError(text);
        announce(text);
        document.querySelector("[data-co-editor]")?.scrollIntoView({ block: "center" });
        return;
      }
      flow.closeEditor();
    }

    const found = firstSectionError({
      classChosen: Boolean(selectedClass),
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      mobile: contact.mobile,
      airport,
      flight,
      companyOpen,
      companyName: company.name,
      companyAddress: company.address,
      companyVat: company.vat,
      account: { signedIn: Boolean(signedInEmail), choice: accountChoice, stage: signInStage, createConsent },
    });
    if (found) {
      setPayStatus("idle");
      if (found.field === "class") {
        flow.setClassError(true);
      } else if (found.field === "account") {
        setAccountError(t("acctPayBlockSignIn"));
      } else if (found.field === "accountSent") {
        setSentBlockError(t("acctPayBlockSent"));
      } else if (found.field === "accountConsent") {
        setCreateConsentError(t("acctCreateConsentError"));
      } else {
        setFieldErrors({ [found.field]: found.messageKey });
      }
      announce(t(found.messageKey));
      scrollAndFocus(FIELD_SELECTOR[found.field]);
      return;
    }
    setFieldErrors({});
    if (flow.pricingNotLive || !quote || !selectedClass) return;
    if (quoteExpired) {
      announce(t("quoteExpired"));
      return;
    }

    // The flight the customer typed must be the flight the quote was made for.
    const typed = normaliseFlight(flight);
    if (typed && typed.flight !== trip.flight) {
      announce(t("updatingPrice"));
      const next = { ...trip, flight: typed.flight, flightDisplay: typed.display };
      void flow.resignFlight(next).then((result) => showResignOutcome(result, next));
      return;
    }
    if (price.kind === "error") {
      // the last price call failed: ask again instead of paying blind
      setPrice({ kind: "updating" });
      priceSeq.current += 1;
      void requoteTrip(trip);
      return;
    }
    if (price.kind !== "ok") {
      announce(t("updatingPrice"));
      return;
    }
    // The lock that carries the voucher the price was made with (U11-1). None yet: still pricing.
    const payLock = lockForVoucher(quote.lock, voucher, voucherLock.current);
    if (payLock === null) {
      announce(t("updatingPrice"));
      return;
    }

    const selection = {
      trip,
      vehicleClass: selectedClass,
      extraCodes: tickedValid,
      coupon: voucher,
      contact,
      company,
      note,
    };

    setPayStatus("loading");
    announce(t("openingPayment"));

    // Back from Stripe with nothing changed: the same booking, the same Stripe page (D-24).
    if (resume && resume.state === "open" && sameSelectionAsResumed(resume, selection, (q) => parseTripQuery(new URLSearchParams(q)).trip)) {
      if (isStripeCheckoutUrl(resume.url)) {
        window.location.assign(resume.url);
        return;
      }
    }

    const sel = JSON.stringify([quote.quoteId, selectedClass, [...tickedValid].sort(), voucher, contact, company, note, trip.flight, resume?.booking_id ?? null]);
    idem.current = payIdemFor(idem.current, sel, () => crypto.randomUUID());

    const body = buildIntentBody({
      quoteId: quote.quoteId,
      lock: payLock,
      trip,
      vehicleClass: selectedClass,
      extraCodes: tickedValid,
      coupon: voucher,
      contact,
      company,
      note,
      supersedes: resume ? resume.booking_id : null,
      locale,
      currency: cur === "EUR" || cur === "USD" || cur === "AED" ? cur : "CHF",
      idempotencyKey: idem.current.id,
    });

    const account = accountIntentBlock({
      signedIn: Boolean(signedInEmail),
      choice: accountChoice,
      guestAccountsOn: settings.guestAccountsOn,
      createAvailable,
      createConsent,
      turnstileToken: accountTurnstile ?? undefined,
      idempotencyKey: idem.current.id,
      returnTo: window.location.pathname + window.location.search,
    });
    const payload = account ? { ...body, account } : body;

    void (async () => {
      const fail = (text: string) => {
        setPayStatus("error");
        setPayError(text);
        announce(text);
      };
      try {
        const res = await fetch("/api/checkout/intent", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as { ok?: boolean; url?: string; code?: string };
        if (json.ok === true && isStripeCheckoutUrl(json.url)) {
          window.location.assign(json.url);
          return;
        }
        const code = json.code ?? "";
        const effect = mapAccountCode(code);
        // U11-2: a failed answer ends this key, so the next press opens a new Stripe session.
        // An account-step answer (sign in first, consent tick, Turnstile) comes before any
        // session is opened, so it keeps the key and does not use up one of the 5 presses.
        idem.current = payIdemAfter(idem.current, Boolean(effect));
        if (effect) {
          setPayStatus(effect.payError ? "error" : "idle");
          if (effect.stage) {
            setSignInStage("sent");
            setAccountChoice("signin");
            window.setTimeout(() => scrollAndFocus(FIELD_SELECTOR.accountSent), 60);
          }
          if (effect.createConsentError) {
            setCreateConsentError(t(effect.createConsentError));
            scrollAndFocus(FIELD_SELECTOR.accountConsent);
          }
          if (effect.payError) {
            setPayError(t(effect.payError));
            announce(t(effect.payError));
          }
          if (effect.resetTurnstile) {
            setAccountTurnstile(null);
            setAccountResetNonce((n) => n + 1);
          }
          if (effect.hideCreate) setCreateHidden(true);
          if (effect.choice) setAccountChoice(effect.choice);
          return;
        }
        if (code === "quote_expired" || code === "quote_not_found" || code === "payment_window_closed") {
          setQuoteExpired(true);
          setPayStatus("idle");
          return;
        }
        if (code === "price_changed" || code === "engine_changed") {
          setPayStatus("idle");
          setPayError(t(code === "price_changed" ? "priceChanged" : "engineChanged"));
          void loadExtras();
          void requoteTrip(tripRef.current);
          return;
        }
        if (code === "coupon_no_longer_valid") {
          setPayStatus("idle");
          setVoucherError("couponNoLongerValid");
          setVoucher(null);
          setVoucherOpen(true);
          return;
        }
        if (code === "pricing_not_live") {
          fail(t("pricingNotLive"));
          return;
        }
        if (code === "quote_already_booked") {
          fail(t("quoteAlreadyBooked"));
          return;
        }
        fail(t("payStartFailed"));
      } catch {
        idem.current = payIdemAfter(idem.current, false);
        fail(t("payStartFailed"));
      }
    })();
  }, [
    airport,
    announce,
    company,
    companyOpen,
    contact,
    cur,
    flight,
    flow,
    locale,
    note,
    payStatus,
    price.kind,
    quote,
    quoteExpired,
    requoteTrip,
    resume,
    selectedClass,
    showResignOutcome,
    t,
    tickedValid,
    trip,
    voucher,
    loadExtras,
    accountChoice,
    accountTurnstile,
    createConsent,
    createHidden,
    settings,
    signInStage,
    signedInEmail,
  ]);

  // A page restored from the back/forward cache must not stay in "Opening payment".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPayStatus("idle");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const seeCurrentPrices = useCallback(() => {
    setNotice(null);
    setQuoteExpired(false);
    setPayError(null);
    requoteTries.current = 0;
    if (tripIsQuotable(tripRef.current)) void requoteTrip(tripRef.current);
    else flow.openEditor();
  }, [flow, requoteTrip]);

  const stashForSignIn = useCallback(() => {
    writeReturnStash(window.sessionStorage, { voucher: voucher ?? "", company, note });
  }, [voucher, company, note]);

  // The path is read after mount so the server and the first client render agree.
  const [pathname, setPathname] = useState("/checkout");
  useEffect(() => setPathname(window.location.pathname), []);
  const signIn = useMemo(
    () => signInHref(checkoutReturnPath(pathname, trip, selectedClass, tickedValid.length > 0 ? tickedValid : ticked)),
    [pathname, trip, selectedClass, tickedValid, ticked],
  );

  const changeAccountChoice = useCallback((v: AccountChoiceValue) => {
    setAccountChoice(v);
    setAccountError(null);
    setCreateConsentError(null);
    setSentBlockError(null);
  }, []);

  const onSignInStage = useCallback(
    (s: CheckoutSignInStage) => {
      if (s === "sent") stashForSignIn();
      setSignInStage(s);
      setSentBlockError(null);
    },
    [stashForSignIn],
  );

  const returnPath = useMemo(
    () => checkoutReturnPath(pathname, trip, selectedClass, tickedValid.length > 0 ? tickedValid : ticked),
    [pathname, trip, selectedClass, tickedValid, ticked],
  );

  const paying = payStatus === "loading";
  const payDisabled = flow.pricingNotLive || quoteExpired;

  const value: CheckoutForm = {
    contact,
    setContact,
    signedInEmail,
    signInHref: signIn,
    stashForSignIn,
    accountChoice,
    changeAccountChoice,
    createConsent,
    setCreateConsent,
    createConsentError,
    createHidden,
    accountError,
    signInStage,
    onSignInStage,
    sentBlockError,
    returnPath,
    refreshSignedIn: () => void refreshSignedIn(),
    accountResetNonce,
    setAccountTurnstile,
    airport,
    flight,
    setFlight,
    flightBlur,
    flightError,
    extras,
    ticked: tickedValid,
    toggleExtra,
    extraName,
    companyOpen,
    setCompanyOpen,
    company,
    setCompany,
    noteOpen,
    setNoteOpen,
    note,
    setNote,
    voucherOpen,
    setVoucherOpen,
    voucherDraft,
    setVoucherDraft,
    voucher,
    voucherApplied,
    voucherError,
    applyVoucher,
    removeVoucher,
    price,
    totalView,
    displayAmount,
    fieldErrors,
    payStatus,
    payError,
    liveMessage,
    pay,
    paying,
    payDisabled,
    notice,
    quoteExpired,
    seeCurrentPrices,
    challenge,
    submitChallengeToken,
    challengeText: challenge?.text ?? "",
  };

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}
