export { ConfirmationEmail } from "./ConfirmationEmail";
export { PayLinkEmail, payLinkPlainText, payLinkSubject } from "./PayLinkEmail";
export { sendConfirmation, sendPayLink, sendRefund, refundMailRecipients, CONFIRMATION_TEMPLATE_VERSION } from "./lib/send";
export type { EmailEnv } from "./lib/send";
export { buildInvite } from "./lib/ics";
export type {
  BookingForEmail,
  EmailLocale,
  PayLinkExtraCode,
  PayLinkForEmail,
  PayLinkVehicle,
  SendOutcome,
} from "./lib/types";
