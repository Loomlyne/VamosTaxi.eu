import { describe, expect, it } from "vitest";
import { firstAccountError, firstPayError, firstSectionError, isMobileNumber, type PayFormState } from "./pay-validate";

const ok: PayFormState = {
  classChosen: true,
  firstName: "Amira",
  lastName: "Keller",
  email: "amira@example.com",
  mobile: "+41796267082",
  airport: false,
  flight: "",
  companyOpen: false,
  companyName: "",
  companyAddress: "",
  companyVat: "",
};

describe("firstPayError", () => {
  it("returns null for a complete form", () => {
    expect(firstPayError(ok)).toBeNull();
  });

  it("checks in DOM order: class first even when everything else is empty", () => {
    const empty: PayFormState = { ...ok, classChosen: false, firstName: "", lastName: "", email: "", mobile: "" };
    expect(firstPayError(empty)).toEqual({ field: "class", messageKey: "chooseClass" });
  });

  it("then first name, last name, e-mail, mobile", () => {
    expect(firstPayError({ ...ok, firstName: " ", lastName: "", email: "", mobile: "" })?.field).toBe("firstName");
    expect(firstPayError({ ...ok, lastName: "", email: "", mobile: "" })?.field).toBe("lastName");
    expect(firstPayError({ ...ok, email: "", mobile: "" })).toEqual({
      field: "email",
      messageKey: "enter-an-email-address",
    });
    expect(firstPayError({ ...ok, mobile: "" })).toEqual({ field: "mobile", messageKey: "enter-a-mobile-number" });
  });

  it("separates an empty e-mail from a malformed one", () => {
    expect(firstPayError({ ...ok, email: "amira@" })).toEqual({ field: "email", messageKey: "errEmailCheck" });
  });

  it("separates an empty mobile from one too short or too long", () => {
    expect(firstPayError({ ...ok, mobile: "+4179" })).toEqual({ field: "mobile", messageKey: "errMobileCheck" });
    expect(firstPayError({ ...ok, mobile: "+1234567890123456" })?.messageKey).toBe("errMobileCheck");
    expect(isMobileNumber("+41796267082")).toBe(true);
  });

  it("asks for the flight only on airport pickups", () => {
    expect(firstPayError({ ...ok, airport: false, flight: "" })).toBeNull();
    expect(firstPayError({ ...ok, airport: true, flight: "" })).toEqual({ field: "flight", messageKey: "errFlight" });
    expect(firstPayError({ ...ok, airport: true, flight: "??" })).toEqual({
      field: "flight",
      messageKey: "errFlightCheck",
    });
    expect(firstPayError({ ...ok, airport: true, flight: "LX 318" })).toBeNull();
  });

  it("flight comes before the company name", () => {
    const s: PayFormState = { ...ok, airport: true, flight: "", companyOpen: true, companyAddress: "Bahnhofstrasse 1" };
    expect(firstPayError(s)?.field).toBe("flight");
  });

  it("wants a company name only when the disclosure is open and something is filled", () => {
    expect(firstPayError({ ...ok, companyOpen: true })).toBeNull();
    expect(firstPayError({ ...ok, companyOpen: false, companyVat: "CHE-123" })).toBeNull();
    expect(firstPayError({ ...ok, companyOpen: true, companyVat: "CHE-123" })).toEqual({
      field: "companyName",
      messageKey: "errCompanyName",
    });
    expect(firstPayError({ ...ok, companyOpen: true, companyName: "Vamos AG", companyVat: "CHE-123" })).toBeNull();
  });
});

describe("firstSectionError: 26.5 account rules (section 2)", () => {
  const out = { signedIn: false, choice: "guest" as const, stage: "form" as const, createConsent: false };

  it("class still wins over the account rules", () => {
    expect(firstSectionError({ ...ok, classChosen: false, account: { ...out, choice: "create" } })?.field).toBe("class");
  });

  it("sign in, form stage: names the sign-in step", () => {
    expect(firstSectionError({ ...ok, account: { ...out, choice: "signin" } })).toEqual({
      field: "account",
      messageKey: "acctPayBlockSignIn",
    });
  });

  it("sign in, sent stage: names the link that was sent", () => {
    expect(firstSectionError({ ...ok, account: { ...out, choice: "signin", stage: "sent" } })).toEqual({
      field: "accountSent",
      messageKey: "acctPayBlockSent",
    });
  });

  it("the account rule beats an empty contact field", () => {
    expect(firstSectionError({ ...ok, firstName: "", account: { ...out, choice: "signin" } })?.field).toBe("account");
  });

  it("create without the Text 1 tick names the tick (D-12)", () => {
    expect(firstSectionError({ ...ok, account: { ...out, choice: "create" } })).toEqual({
      field: "accountConsent",
      messageKey: "acctCreateConsentError",
    });
  });

  it("create with the tick passes on to the contact rules", () => {
    const account = { ...out, choice: "create" as const, createConsent: true };
    expect(firstSectionError({ ...ok, account })).toBeNull();
    expect(firstSectionError({ ...ok, firstName: "", account })?.field).toBe("firstName");
  });

  it("guest never has a consent rule, ticked or not (D-13)", () => {
    expect(firstSectionError({ ...ok, account: { ...out, createConsent: false } })).toBeNull();
    expect(firstSectionError({ ...ok, account: { ...out, createConsent: true } })).toBeNull();
  });

  it("signed in: no account rule applies, whatever the stale choice state", () => {
    for (const choice of ["guest", "signin", "create"] as const) {
      expect(firstAccountError({ signedIn: true, choice, stage: "sent", createConsent: false })).toBeNull();
    }
  });

  it("absent account state changes nothing; firstPayError itself is untouched", () => {
    expect(firstSectionError(ok)).toBeNull();
    expect(firstSectionError({ ...ok, mobile: "" })).toEqual(firstPayError({ ...ok, mobile: "" }));
  });
});
