import { saveResults } from "./lib.mjs";
const why = "BLOCKED: the brief needs 'make a draft of the price book (copy of the live stand-in book)' but lab p30c already holds draft book 1 (Staging matrix placeholder) with no amounts for Economy/Business/Van luxury, no photos and no surcharges (Publish lists 13 gaps: three classes missing photo/start/per-km plus ten surcharges), and the UI has no 'copy live into draft' control (the history list is not in the Pricing template). DISCARD DRAFT answers {ok:false,code:fk} because the two setup trips' price_snapshots point at draft book 1. Publishing needs inventing photos and ten surcharge amounts, which the brief does not allow.";
saveResults([
 { id: "S12", title: "Publish a draft without Lab Draft Class amounts", status: "BLOCKED", evidence: why },
 { id: "S13", title: "Stand-in price, publish, Go live list", status: "BLOCKED", evidence: "BLOCKED by S12: no draft book that can be published (see S12). The Go live list for Lab Draft Class still shows Price in the live price book as missing, Go live disabled." },
 { id: "S3", title: "Press GO LIVE", status: "BLOCKED", evidence: "BLOCKED by S12/S13: GO LIVE stays disabled until the price exists in the live price book." },
 { id: "S3b", title: "Live class seats cannot be cleared", status: "BLOCKED", evidence: "BLOCKED by S3: Lab Draft Class cannot become Live." },
]);
