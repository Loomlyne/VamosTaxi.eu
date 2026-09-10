export { ConfirmationEmail } from "./ConfirmationEmail";
export { PayLinkEmail, payLinkPlainText, payLinkSubject } from "./PayLinkEmail";
export {
  ChauffeurAssignEmail,
  chauffeurAssignPlainText,
  chauffeurAssignSubject,
} from "./ChauffeurAssignEmail";
export {
  ChauffeurUnassignEmail,
  chauffeurUnassignPlainText,
  chauffeurUnassignSubject,
} from "./ChauffeurUnassignEmail";
export {
  OpsMustFixEmail,
  opsMustFixPlainText,
  opsMustFixSubject,
} from "./OpsMustFixEmail";
export type { OpsMustFixForEmail, OpsMustFixKind, OpsMustFixTrip } from "./OpsMustFixEmail";
export {
  sendConfirmation,
  sendPayLink,
  sendRefund,
  sendChauffeurAssign,
  sendChauffeurUnassign,
  sendOpsMustFix,
  refundMailRecipients,
  chauffeurEmailLocale,
  CONFIRMATION_TEMPLATE_VERSION,
} from "./lib/send";
export type { EmailEnv, ChauffeurDispatchForEmail } from "./lib/send";
export { buildInvite } from "./lib/ics";
export type {
  BookingForEmail,
  EmailLocale,
  PayLinkExtraCode,
  PayLinkForEmail,
  PayLinkVehicle,
  SendOutcome,
} from "./lib/types";
