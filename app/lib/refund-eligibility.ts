export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundIneligibleReason =
  | "no-purchase"
  | "request-pending"
  | "claimed-seat"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched";

export type RefundEligibilityFacts = {
  hasPurchase: boolean;
  hasPendingRefundRequest: boolean;
  hasClaimedSeat: boolean;
  purchasedAt: string;
  now: Date;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

// The refund window is counted in whole days, not hours — someone who buys at
// 23:00 still gets the whole of their last day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/**
 * Whether a learner may currently submit a refund request. The first rule
 * that fails decides the reason.
 */
export function checkRefundEligibility(
  facts: RefundEligibilityFacts
): { eligible: true } | { eligible: false; reason: RefundIneligibleReason } {
  if (!facts.hasPurchase) return { eligible: false, reason: "no-purchase" };
  if (facts.hasPendingRefundRequest) {
    return { eligible: false, reason: "request-pending" };
  }
  if (facts.hasClaimedSeat) return { eligible: false, reason: "claimed-seat" };

  const today = calendarDay(facts.now);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));
  if (today < purchasedDay || today > lastDayOfRefundWindow(facts.purchasedAt)) {
    return { eligible: false, reason: "window-closed" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "too-much-completed" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "too-much-watched" };
  }

  return { eligible: true };
}
