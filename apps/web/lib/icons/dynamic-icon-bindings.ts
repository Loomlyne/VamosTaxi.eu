// Dynamic icon names (`name="{{ … }}"`, `icon="{{ … }}"`) in the mocks, read by hand 2026-10-04: the values each
// binding can take, from the script of the same file or of the screen that fills it. A binding not listed here
// fails icon-files-exist.test.ts (nobody has read where its value comes from); a value listed here needs a file
// like any other, and must still be a quoted name somewhere in the mock sources.
const PLACE = ["plane", "bed", "train-front", "map-pin", "map", "snowflake", "plane-landing"];
const CONTACT = ["message-circle", "phone", "mail", "x"];
const CHEVRONS = ["chevron-up", "chevron-down"];
// Every field icon the dashboard table editor can show: its own FIELD_ICONS map plus the `icon:` of the
// field lists the Board, Chauffeurs, Pricing, Coupons and Customers screens hand it.
const OPS_FIELD = [
  "receipt", "ticket", "user", "briefcase", "mail", "phone", "shield-check", "calendar", "clock", "globe", "plane",
  "map-pin", "navigation", "car", "users", "luggage", "banknote", "check", "file-text", "settings", "car-front",
  "tag", "arrow-left-right",
];
const BRAND_SELECT = ["globe", "banknote", "calendar", "car", "funnel", "layout-dashboard", "settings", "star"];

export const DYNAMIC_ICON_BINDINGS: Array<{ files: string[]; expr: string; values: string[]; from: string }> = [
  { files: ["app/home/BookingSheet.dc.html", "app/home/home.dc.html"], expr: "flightIcon", values: ["plane-landing", "plane"], from: "flight row: airport pickup or not" },
  { files: ["app/home/BookingSheet.dc.html", "app/home/home.dc.html"], expr: "s.icon", values: PLACE, from: "address suggestion rows (kindIcon, saved places, KIND_META)" },
  { files: ["app/home/home.dc.html"], expr: "pickupIcon", values: ["plane-landing", "map-pin"], from: "pickup field: airport or address" },
  { files: ["app/home/BrandSelect.dc.html", "app/pages/BrandSelect.dc.html"], expr: "icon", values: BRAND_SELECT, from: "BrandSelect icon prop, default globe" },
  { files: ["app/ops/BrandSelect.dc.html"], expr: "icon", values: [...BRAND_SELECT, ...OPS_FIELD], from: "BrandSelect icon prop, from the dashboard table editor field lists" },
  { files: ["app/home/ContactButton.dc.html", "app/pages/ContactButton.dc.html"], expr: "floatIcon", values: CONTACT, from: "CB_CH channels, close, default message-circle" },
  { files: ["app/home/ContactButton.dc.html", "app/pages/ContactButton.dc.html"], expr: "triggerIcon", values: CONTACT, from: "open ? x : message-circle" },
  { files: ["app/home/ContactButton.dc.html", "app/pages/ContactButton.dc.html"], expr: "g.icon", values: CONTACT, from: "gallery floats: fl() default and callO/mailO" },
  { files: ["app/home/ContactRow.dc.html", "app/pages/ContactRow.dc.html"], expr: "icon", values: ["message-circle", "phone", "mail", "file-text"], from: "ContactRow icon prop, default phone" },
  { files: ["app/home/ContactRow.dc.html", "app/pages/ContactRow.dc.html"], expr: "endIcon", values: ["external-link", "chevron-right"], from: "ContactRow endIcon prop" },
  { files: ["app/home/ServiceCard.dc.html"], expr: "glyph", values: ["car-front", "plane-landing", "navigation", "briefcase", "snowflake"], from: "ServiceCard icon prop, default car-front" },
  { files: ["app/home/SiteHeader.dc.html", "app/pages/SiteHeader.dc.html"], expr: "menuIcon", values: ["x", "menu"], from: "menu open or closed" },
  { files: ["app/home/StepCounter.dc.html"], expr: "icon", values: [], from: "StepCounter icon prop; no caller passes one" },
  { files: ["app/home/WhenPicker.dc.html"], expr: "trigIcon", values: ["clock", "calendar"], from: "time or date trigger" },
  { files: ["app/ops/ActionsMenu.dc.html"], expr: "o.icon", values: ["users", "user-plus", "minus", "pencil", "x", "mail", "map-pin", "circle-check", "circle-alert", "receipt", "check", "trash-2"], from: "menu items: OpsDetail actionItems, OpsPricing pricingBarItems" },
  { files: ["app/ops/OpsBoard.dc.html"], expr: "s.icon", values: ["car-front", "clock", "triangle-alert"], from: "statCards card(...) calls" },
  { files: ["app/ops/OpsCoupons.dc.html"], expr: "c.icon", values: ["ticket", "circle-check", "receipt"], from: "counts" },
  { files: ["app/ops/OpsCustomers.dc.html"], expr: "c.icon", values: ["user", "briefcase", "car-front"], from: "counts" },
  { files: ["app/ops/OpsDash.dc.html"], expr: "c.icon", values: ["list", "car-front", "users"], from: "counts" },
  { files: ["app/ops/OpsDash.dc.html"], expr: "a.icon", values: ["triangle-alert", "clock", "pencil"], from: "attention rows" },
  { files: ["app/ops/OpsDetail.dc.html"], expr: "g.icon", values: ["user", "clock", "car-front", "users", "luggage", "plane", "ticket", "plus", "credit-card", "car"], from: "booking tags" },
  { files: ["app/ops/OpsChauffeurs.dc.html"], expr: "f.icon", values: ["mail", "car-front", "car", "shield-check", "globe"], from: "chauffeur profileFacts" },
  { files: ["app/ops/OpsChauffeurs.dc.html"], expr: "c.icon", values: ["users", "clock", "car-front"], from: "counts" },
  { files: ["app/ops/OpsPricing.dc.html"], expr: "p.icon", values: ["map-pin", "arrow-left-right", "banknote", "ticket"], from: "PANES" },
  { files: ["app/ops/OpsPricing.dc.html"], expr: "retiredChevron", values: CHEVRONS, from: "Retired classes list open or folded (Phase 30)" },
  { files: ["app/ops/OpsPricing.dc.html"], expr: "i.icon", values: ["circle-check", "circle-alert"], from: "Go live checklist row: done or missing (Phase 30)" },
  { files: ["app/ops/OpsProfile.dc.html"], expr: "p.icon", values: ["user", "image"], from: "panes" },
  { files: ["app/ops/OpsReviews.dc.html"], expr: "r.publishIcon", values: ["eye", "eye-off"], from: "published or hidden" },
  { files: ["app/ops/OpsReviews.dc.html"], expr: "r.removeIcon", values: ["circle-alert", "trash-2"], from: "armed or not" },
  { files: ["app/ops/OpsSettings.dc.html"], expr: "p.icon", values: ["briefcase", "clock", "globe", "credit-card", "bell", "shield-check"], from: "panes" },
  { files: ["app/ops/OpsSidebar.dc.html"], expr: "n.icon", values: ["layout-dashboard", "receipt", "calendar-days", "users", "user", "mail", "banknote"], from: "NAV_TOP, NAV_BOTTOM, NAV_ADMIN" },
  { files: ["app/ops/OpsSidebar.dc.html"], expr: "c.icon", values: ["globe", "shield-check", "star"], from: "CONTENT" },
  { files: ["app/ops/OpsSidebar.dc.html"], expr: "contentChevron", values: CHEVRONS, from: "content group open or closed" },
  { files: ["app/ops/OpsSidebar.dc.html"], expr: "toggleIcon", values: ["chevron-right", "chevron-left"], from: "rail collapsed or not" },
  { files: ["app/ops/OpsSidebar.dc.html"], expr: "menuChevron", values: CHEVRONS, from: "profile menu open or closed" },
  { files: ["app/ops/OpsSoon.dc.html"], expr: "icon", values: ["calendar-days", "user", "ticket", "settings"], from: "sections" },
  { files: ["app/ops/OpsSupportTicket.dc.html"], expr: "c.icon", values: ["mail", "clock", "message-circle", "users"], from: "counts" },
  { files: ["app/ops/OpsSupportTicket.dc.html"], expr: "col.chevron", values: CHEVRONS, from: "board column open or closed" },
  { files: ["app/ops/OpsSupportTicket.dc.html"], expr: "col.sortIcon", values: ["arrow-up", "arrow-down"], from: "newest first or oldest first" },
  { files: ["app/ops/OpsTable.dc.html"], expr: "f.inputIcon", values: OPS_FIELD, from: "f.icon || FIELD_ICONS[f.key]" },
  { files: ["app/ops/OpsTable.dc.html"], expr: "f.icon", values: OPS_FIELD, from: "field lists of the screens that use the table" },
  { files: ["app/ops/OpsTable.dc.html"], expr: "s.icon", values: OPS_FIELD, from: "paired select slots, same field lists" },
  { files: ["app/ops/OpsTable.dc.html"], expr: "f.kindIcon", values: ["banknote", "ticket"], from: "coupon kind: amount or percent" },
  { files: ["app/ops/OpsTable.dc.html"], expr: "historyChevron", values: CHEVRONS, from: "history open or closed" },
  { files: ["app/ops/PlaceSearch.dc.html"], expr: "icon", values: ["map-pin", "search"], from: "place picked or not" },
  { files: ["app/pages/account.dc.html"], expr: "avatarIcon", values: ["user"], from: "no name and no email yet" },
];
