// apps/web/lib/flight/fixtures.ts
//
// Hand-written AeroDataBox response shapes derived from 04-RESEARCH.md §11.
// These are NOT live captures. No real flight, key, or RapidAPI header may be
// pasted in later.

export type AdbTime = { utc: string; local?: string };

export type AdbAirport = { iata?: string };

export type AdbEndpoint = {
  airport?: AdbAirport;
  scheduledTime?: AdbTime;
  revisedTime?: AdbTime;
  runwayTime?: AdbTime;
  terminal?: string;
  gate?: string;
  baggageBelt?: string;
};

export type AdbFlight = {
  number: string;
  status?: string;
  departure?: AdbEndpoint;
  arrival?: AdbEndpoint;
};

const CET_UTC = "2026-01-15 10:15Z";
const CEST_UTC = "2026-07-15 10:15Z";

export const TIME_ALL: AdbEndpoint = {
  airport: { iata: "ZRH" },
  scheduledTime: { utc: CET_UTC },
  revisedTime: { utc: "2026-01-15 10:22Z" },
  runwayTime: { utc: "2026-01-15 10:28Z" },
  terminal: "1",
  gate: "B32",
  baggageBelt: "3",
};

export const TIME_NO_RUNWAY: AdbEndpoint = {
  airport: { iata: "ZRH" },
  scheduledTime: { utc: CET_UTC },
  revisedTime: { utc: "2026-01-15 10:22Z" },
};

export const TIME_SCHEDULED_ONLY: AdbEndpoint = {
  airport: { iata: "ZRH" },
  scheduledTime: { utc: CET_UTC },
};

export const TIME_CEST_SCHEDULED: AdbEndpoint = {
  airport: { iata: "ZRH" },
  scheduledTime: { utc: CEST_UTC },
};

export const DEPARTURE_LHR: AdbEndpoint = {
  airport: { iata: "LHR" },
  scheduledTime: { utc: "2026-01-15 07:00Z" },
};

/** Single record carrying runway, revised and scheduled times. */
export const SINGLE_ALL_TIMES: AdbFlight[] = [
  {
    number: "LX318",
    status: "Arrived",
    departure: DEPARTURE_LHR,
    arrival: TIME_ALL,
  },
];

/** Same record without runwayTime — estimated should win. */
export const SINGLE_REVISED_AND_SCHEDULED: AdbFlight[] = [
  {
    number: "LX318",
    status: "Expected",
    departure: DEPARTURE_LHR,
    arrival: TIME_NO_RUNWAY,
  },
];

/** Same record with only scheduledTime. */
export const SINGLE_SCHEDULED_ONLY: AdbFlight[] = [
  {
    number: "LX318",
    status: "Expected",
    departure: DEPARTURE_LHR,
    arrival: TIME_SCHEDULED_ONLY,
  },
];

/** July arrival so landing_local is CEST. */
export const SINGLE_CEST: AdbFlight[] = [
  {
    number: "LX318",
    status: "Expected",
    departure: { airport: { iata: "LHR" }, scheduledTime: { utc: "2026-07-15 07:00Z" } },
    arrival: TIME_CEST_SCHEDULED,
  },
];

/**
 * Overnight / two-record case. Taking the first record would stamp the
 * wrong civil day — the client must disambiguate instead.
 */
export const OVERNIGHT_TWO_RECORDS: AdbFlight[] = [
  {
    number: "LX318",
    status: "Expected",
    departure: {
      airport: { iata: "LHR" },
      scheduledTime: { utc: "2026-01-15 21:00Z" },
    },
    arrival: {
      airport: { iata: "ZRH" },
      scheduledTime: { utc: "2026-01-15 22:40Z" },
    },
  },
  {
    number: "LX318",
    status: "Expected",
    departure: {
      airport: { iata: "LHR" },
      scheduledTime: { utc: "2026-01-16 21:00Z" },
    },
    arrival: {
      airport: { iata: "ZRH" },
      scheduledTime: { utc: "2026-01-16 22:40Z" },
    },
  },
];

export const EMPTY_ARRAY: AdbFlight[] = [];

export const SINGLE_NO_OPTIONALS: AdbFlight[] = [
  {
    number: "LX318",
    departure: { airport: { iata: "LHR" } },
    arrival: {
      airport: { iata: "ZRH" },
      scheduledTime: { utc: CET_UTC },
    },
  },
];

export const FAILURE_STATUSES = [429, 500, 502] as const;
