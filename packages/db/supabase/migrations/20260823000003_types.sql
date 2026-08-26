-- 20260823000003_types.sql
--
-- Enum vs CHECK convention (D-20), binding on every later migration's column choices:
-- native Postgres ENUM for closed, stable domains that appear across tables and are read by
-- policies or by TypeScript (`supabase gen types` renders them as union types). CHECK (x in
-- (...)) for churn-prone taxonomies — event kinds, actor kinds, consent method — because
-- `ALTER TYPE ... ADD VALUE` is cheap but renaming or removing an enum label is not, and
-- event taxonomies churn most. Nothing in this schema uses a CHECK where an enum exists, or
-- an enum where the list is expected to grow unpredictably.

-- VamosOps VEHICLE_STATUS
create type vehicle_status as enum ('service', 'idle', 'workshop');
-- VamosOps CHAUFFEUR_STATUS
create type chauffeur_status as enum ('shift', 'off', 'leave');
-- VamosOps BOOKING_STATUS. 'no-show' becomes 'no_show' — hyphen dropped for label hygiene;
-- the display string is an i18n key, so no surface is affected.
--
-- 'partially_cancelled' and 'partially_completed' are booking-level ONLY and exist because
-- ADR-006 lets a customer cancel just the return leg while the outbound has already run.
-- Without them, `manage_booking_cancel` would have to flip a fully-earned outbound trip to
-- 'cancelled' on the ops board and in the account list, and the refund basis would be
-- ambiguous between the booking total and `price_snapshot_legs.leg_subtotal_rappen`.
--
-- ROLL-UP RULE, binding on Phase 9 (written here so the shape is not invented later):
--   every leg cancelled                              -> booking 'cancelled'
--   every leg completed                               -> booking 'completed'
--   >=1 cancelled AND >=1 completed                    -> booking 'partially_completed'
--   >=1 cancelled AND >=1 still live (not terminal)    -> booking 'partially_cancelled'
--   otherwise the booking keeps its own commercial status (quote/pending/paid/...)
-- Phase 9 lands the trigger that maintains it; Phase 2 lands the vocabulary and the rule.
create type booking_status as enum ('quote','pending','paid','confirmed','assigned',
                                     'completed','cancelled','partially_cancelled',
                                     'partially_completed','refunded','no_show');
create type leg_direction as enum ('outbound', 'return');
-- VamosOps CUSTOMER_TYPES. 'corporate' stays in the schema per ADR-008: it records who the
-- customer is, not a payment feature. Pay-by-invoice does not ship in V1.
create type customer_type as enum ('private', 'corporate');
create type coupon_kind as enum ('percent', 'amount');
create type surcharge_kind as enum ('amount', 'percent', 'included');
create type review_source as enum ('google','tripadvisor','trustpilot','manual');
create type staff_role as enum ('dispatcher', 'admin');
create type rate_version_status as enum ('draft', 'live', 'retired');
-- Display currencies only. ADR-004: the switch changes the mark, never the number.
create type display_currency as enum ('CHF','EUR','USD','AED');

/**
 * CHF minor units (1/100 CHF), D-06.
 * int4 and not numeric: Stripe's `amount` is already an integer minor unit for CHF, so the
 * number in the row IS the number sent to Stripe; postgres.js returns numeric and int8 as
 * strings while int4 arrives as a plain JS number. Ceiling CHF 21'474'836.47.
 *
 * ROUNDING RULE, binding on the Phase 4 engine: each price line is rounded half-up to the
 * whole rappen when computed; a total is the sum of ALREADY-ROUNDED lines, never the
 * rounding of an unrounded sum — otherwise the lines the customer reads do not add up to
 * the total they are charged.
 *
 * F-17: the non-negativity check lives ON THE DOMAIN, not repeated by hand on every money
 * column. Every amount in this schema is stored non-negative — `discount_rappen` is a
 * positive number that is subtracted at the point of use, never a negative line — and one
 * money column already misses a hand-written check in the draft (bookings.price_total_rappen,
 * Plan 02-05). Carrying the check on the domain means the next money column cannot miss it
 * either, because it has nothing to remember: `(-1)::rappen` always raises the same
 * SQLSTATE, unconditionally: `23514`.
 */
create domain rappen as integer check (value >= 0);
