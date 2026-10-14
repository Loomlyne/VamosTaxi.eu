// apps/web/lib/ops/reviews-language-enqueue.test.ts
//
// Phase 32 plan 08 (D-09): a review he creates, or whose text he edits, on the dashboard gets a
// language job ({ v:1, kind:"review", reviewId }) so the home translate button can appear. Switching a
// review to published sends the same job (the job only detects published rows, so a review created hidden
// would otherwise wait for the 03:00 sweep; verifier W-2). A move, an unpublish or any other field edit
// sends nothing. A failed enqueue never changes the staff answer. Database-free: the route's collaborators are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const NEW_ID = "33333333-3333-4333-8333-333333333333";
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  externalRef: null,
  source: "manual",
  authorName: "Ana Keller",
  authorRole: "Business traveller",
  body: "Driver was on time.",
  rating: 4,
  routeLabel: "ZRH to Zurich",
  vehicleClassId: null,
  avatarPath: null,
  sourceUrl: null,
  verified: true,
  published: true,
  sortOrder: 30,
};

const ENV = { TRANSLATE_QUEUE: { send: vi.fn() } };
const actions = {
  createReview: vi.fn(),
  updateReview: vi.fn(),
  moveReview: vi.fn(),
  setReviewPublished: vi.fn(),
  deleteReview: vi.fn(),
};
const sendTranslateJob = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ENV }) }));
vi.mock("@/lib/ops/staff-json", () => ({
  jsonErr: (code: string, status: number) => Response.json({ ok: false, code }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
  withStaff: (handler: (claims: object, request: Request) => Promise<Response>) => (request: Request) =>
    handler({ sub: "staff-1" }, request),
}));
vi.mock("@/lib/ops/reviews", () => ({ loadReviews: async () => [ROW] }));
vi.mock("@/app/[locale]/(ops)/ops/reviews/actions", () => ({
  createReview: (...a: unknown[]) => actions.createReview(...a),
  updateReview: (...a: unknown[]) => actions.updateReview(...a),
  moveReview: (...a: unknown[]) => actions.moveReview(...a),
  setReviewPublished: (...a: unknown[]) => actions.setReviewPublished(...a),
  deleteReview: (...a: unknown[]) => actions.deleteReview(...a),
}));
vi.mock("@/lib/translate/jobs-contract", () => ({
  sendTranslateJob: (...a: unknown[]) => sendTranslateJob(...a),
}));

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("../../app/[locale]/(ops)/api/staff/reviews/route");
  return POST(new Request("https://dashboard.test/api/staff/reviews", { method: "POST", body: JSON.stringify(body) }));
}

async function patch(body: unknown): Promise<Response> {
  const { PATCH } = await import("../../app/[locale]/(ops)/api/staff/reviews/[id]/route");
  return PATCH(
    new Request(`https://dashboard.test/api/staff/reviews/${ROW.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: ROW.id }) },
  );
}

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  sendTranslateJob.mockReset();
  actions.createReview.mockResolvedValue({ ok: true, id: NEW_ID });
  actions.updateReview.mockResolvedValue({ ok: true });
  actions.moveReview.mockResolvedValue({ ok: true });
  actions.setReviewPublished.mockResolvedValue({ ok: true });
  sendTranslateJob.mockResolvedValue(true);
});

describe("staff review create/edit enqueues language detection", () => {
  it("a successful POST enqueues { v:1, kind:'review', reviewId } once with the new row id", async () => {
    const res = await post({ authorName: "Bea", body: "Sehr pünktlich.", rating: 5 });
    expect(res.status).toBe(201);
    expect(sendTranslateJob).toHaveBeenCalledTimes(1);
    expect(sendTranslateJob).toHaveBeenCalledWith(ENV, { v: 1, kind: "review", reviewId: NEW_ID });
  });

  it("a refused POST enqueues nothing", async () => {
    actions.createReview.mockResolvedValue({ ok: false, key: "reviews-rating" });
    const res = await post({ authorName: "Bea", body: "x", rating: 9 });
    expect(res.status).toBe(400);
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("a PATCH that changes the text enqueues once, through either body alias", async () => {
    for (const key of ["body", "text"]) {
      sendTranslateJob.mockClear();
      const res = await patch({ [key]: `Neuer Text ${key}.` });
      expect(res.status).toBe(200);
      expect(sendTranslateJob).toHaveBeenCalledTimes(1);
      expect(sendTranslateJob).toHaveBeenCalledWith(ENV, { v: 1, kind: "review", reviewId: ROW.id });
    }
  });

  it("a full-form PATCH with the text unchanged enqueues nothing", async () => {
    const res = await patch({ body: ROW.body, rating: 5, authorName: "Ana K." });
    expect(res.status).toBe(200);
    expect(actions.updateReview).toHaveBeenCalledTimes(1);
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("switching a review to published enqueues once; a refused switch enqueues nothing", async () => {
    const res = await patch({ published: true });
    expect(res.status).toBe(200);
    expect(sendTranslateJob).toHaveBeenCalledTimes(1);
    expect(sendTranslateJob).toHaveBeenCalledWith(ENV, { v: 1, kind: "review", reviewId: ROW.id });
    sendTranslateJob.mockClear();
    actions.setReviewPublished.mockResolvedValue({ ok: false, key: "reviews-error" });
    await patch({ published: true });
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("a move, an unpublish or another field edit enqueues nothing", async () => {
    await patch({ move: "up" });
    await patch({ published: false });
    await patch({ rating: 5 });
    await patch({ authorName: "Ana K.", routeLabel: "ZRH" });
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("a refused PATCH enqueues nothing", async () => {
    actions.updateReview.mockResolvedValue({ ok: false, key: "reviews-locked" });
    const res = await patch({ body: "Other words." });
    expect(res.status).toBe(409);
    expect(sendTranslateJob).not.toHaveBeenCalled();
  });

  it("an enqueue failure (false or a throw) never changes the staff answer", async () => {
    sendTranslateJob.mockResolvedValue(false);
    const a = await post({ authorName: "Bea", body: "Sehr pünktlich.", rating: 5 });
    sendTranslateJob.mockRejectedValue(new Error("queue down"));
    const b = await post({ authorName: "Bea", body: "Sehr pünktlich.", rating: 5 });
    const c = await patch({ body: "Neuer Text." });
    const d = await patch({ published: true });
    expect(d.status).toBe(200);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(200);
    expect(await b.json()).toEqual({ ok: true, data: [ROW] });
    expect(await c.json()).toEqual({ ok: true, data: [ROW] });
  });
});
