import type { Appearance } from "@stripe/stripe-js";

// Hex only — Stripe's iframe cannot resolve --vt-* or oklch().
export const VAMOS_STRIPE_APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1E1F1F",
    colorBackground: "#FFFFFF",
    colorText: "#1E1F1F",
    colorTextSecondary: "#545756",
    colorTextPlaceholder: "#767877",
    colorDanger: "#C2410C",
    fontFamily: "Poppins, system-ui, sans-serif",
    fontSizeBase: "16px",
    borderRadius: "999px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      border: "1px solid #DEDEDE",
      boxShadow: "none",
      backgroundColor: "#FFFFFF",
      padding: "10px 14px",
    },
    ".Input:focus": {
      border: "1px solid #1E1F1F",
      boxShadow: "none",
    },
    ".Label": {
      fontWeight: "500",
      color: "#1E1F1F",
    },
    ".Tab": {
      border: "1px solid #DEDEDE",
      boxShadow: "none",
      backgroundColor: "#FFFFFF",
    },
    ".Tab--selected": {
      border: "1px solid #1E1F1F",
      backgroundColor: "#F6F6F6",
      boxShadow: "none",
    },
    ".Block": {
      borderRadius: "16px",
      border: "1px solid #DEDEDE",
      boxShadow: "none",
      backgroundColor: "#F6F6F6",
    },
  },
};
