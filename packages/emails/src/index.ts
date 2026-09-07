export { ConfirmationEmail } from "./ConfirmationEmail";
export { PayLinkEmail } from "./PayLinkEmail";
export { sendConfirmation, sendPayLink, CONFIRMATION_TEMPLATE_VERSION } from "./lib/send";
export type { EmailEnv } from "./lib/send";
export { buildInvite } from "./lib/ics";
export type { BookingForEmail, EmailLocale, PayLinkForEmail, SendOutcome } from "./lib/types";
