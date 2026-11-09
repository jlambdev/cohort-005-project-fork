import { describe, it, expect } from "vitest";
import {
  checkRefundEligibility,
  lastDayOfRefundWindow,
  type RefundEligibilityFacts,
} from "./refund-eligibility";

const base: RefundEligibilityFacts = {
  hasPurchase: true,
  hasPendingRefundRequest: false,
  hasClaimedSeat: false,
  purchasedAt: new Date(2026, 0, 1, 23, 0).toISOString(),
  now: new Date(2026, 0, 5, 12, 0),
  lessonCount: 10,
  completedLessonCount: 1,
  secondsWatched: 60,
};

describe("checkRefundEligibility", () => {
  it("is eligible inside the window with little progress", () => {
    expect(checkRefundEligibility(base)).toEqual({ eligible: true });
  });

  it("rejects when there is no purchase", () => {
    expect(checkRefundEligibility({ ...base, hasPurchase: false })).toEqual({
      eligible: false,
      reason: "no-purchase",
    });
  });

  it("rejects when a refund request is already pending", () => {
    expect(
      checkRefundEligibility({ ...base, hasPendingRefundRequest: true })
    ).toEqual({ eligible: false, reason: "request-pending" });
  });

  it("rejects a claimed team seat", () => {
    expect(checkRefundEligibility({ ...base, hasClaimedSeat: true })).toEqual({
      eligible: false,
      reason: "claimed-seat",
    });
  });

  it("allows the whole last day of the window", () => {
    expect(lastDayOfRefundWindow(base.purchasedAt)).toBe("2026-01-15");
    expect(
      checkRefundEligibility({ ...base, now: new Date(2026, 0, 15, 23, 59) })
    ).toEqual({ eligible: true });
  });

  it("rejects after the window", () => {
    expect(
      checkRefundEligibility({ ...base, now: new Date(2026, 0, 16, 0, 1) })
    ).toEqual({ eligible: false, reason: "window-closed" });
  });

  it("rejects at 50% completion but not below", () => {
    expect(
      checkRefundEligibility({ ...base, completedLessonCount: 5 })
    ).toEqual({ eligible: false, reason: "too-much-completed" });
    expect(
      checkRefundEligibility({ ...base, completedLessonCount: 4 })
    ).toEqual({ eligible: true });
  });

  it("ignores completion when the course has no lessons", () => {
    expect(
      checkRefundEligibility({
        ...base,
        lessonCount: 0,
        completedLessonCount: 0,
      })
    ).toEqual({ eligible: true });
  });

  it("rejects at two hours watched", () => {
    expect(
      checkRefundEligibility({ ...base, secondsWatched: 7200 })
    ).toEqual({ eligible: false, reason: "too-much-watched" });
    expect(
      checkRefundEligibility({ ...base, secondsWatched: 7199 })
    ).toEqual({ eligible: true });
  });
});
