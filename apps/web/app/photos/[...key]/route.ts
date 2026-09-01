// Nested photo keys (`vehicles/<id>/<uuid>.jpg`) need a catch-all. The
// handler lives in [key]/route.ts so the plan path stays the source of truth.
export { GET, dynamic } from "../[key]/route";
