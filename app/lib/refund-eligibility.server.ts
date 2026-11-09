import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
} from "~/db/schema";
import { getDiscountForCountry } from "~/lib/ppp";
import {
  checkRefundEligibility,
  lastDayOfRefundWindow,
  type RefundIneligibleReason,
} from "~/lib/refund-eligibility";

function getLessonIds(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

export type RefundEligibility =
  | { eligible: false; reason: RefundIneligibleReason }
  | {
      eligible: true;
      purchaseId: number;
      /** The amount the learner paid, which is what a refund returns. */
      amount: number;
      lastDayInWindow: string;
    };

/** Whether the learner may currently submit a refund request for the course. */
export function getRefundEligibility(
  userId: number,
  course: { id: number; price: number }
): RefundEligibility {
  const purchase = db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, course.id)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();

  if (!purchase) return { eligible: false, reason: "no-purchase" };

  const pendingRequest = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchase.id),
        eq(refunds.status, RefundStatus.Requested)
      )
    )
    .get();

  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt))
    )
    .get();

  const lessonIds = getLessonIds(course.id);

  const result = checkRefundEligibility({
    hasPurchase: true,
    hasPendingRefundRequest: Boolean(pendingRequest),
    hasClaimedSeat: Boolean(claimedSeat),
    purchasedAt: purchase.createdAt,
    now: new Date(),
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    secondsWatched: getSecondsWatched(userId, lessonIds),
  });

  if (!result.eligible) return result;

  // A purchasing-power price is given back at the price that was paid, not at
  // the list price of the course.
  const amount =
    getDiscountForCountry(purchase.country) > 0
      ? purchase.amountPaid
      : course.price;

  return {
    eligible: true,
    purchaseId: purchase.id,
    amount,
    lastDayInWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
