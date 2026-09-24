export type CheckoutTraveler = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
};

// Payment is a fresh page. React contact starts empty. The trip already
// has the name the details page saved. Use that, or the card session is
// never requested and the box stays blank.
export function checkoutTraveler(
  state: CheckoutTraveler,
  saved: Partial<CheckoutTraveler> | null | undefined,
): CheckoutTraveler | null {
  const firstName = state.firstName.trim() || saved?.firstName?.trim() || "";
  const lastName = state.lastName.trim() || saved?.lastName?.trim() || "";
  const email = state.email.trim() || saved?.email?.trim() || "";
  const mobile = state.mobile.trim() || saved?.mobile?.trim() || "";
  if (!firstName || !lastName || !email || !mobile) return null;
  return { firstName, lastName, email, mobile };
}
