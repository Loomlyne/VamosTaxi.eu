// apps/web/app/photos/[...key]/route.ts
//
// Nested keys (`site/svc-airport.jpg`, `vehicles/<id>/<uuid>.jpg`) do not
// match the single-segment [key] route. Re-export the same GET proxy.

export { GET, dynamic } from "../[key]/route";
