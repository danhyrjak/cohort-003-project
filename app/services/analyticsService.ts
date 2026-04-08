import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, purchases, enrollments, courseRatings } from "~/db/schema";

export type AnalyticsPeriod = "7d" | "30d" | "12m" | "all";

export interface AnalyticsSummary {
  totalRevenue: number;
  totalEnrollments: number;
  averageRating: number | null;
  ratingCount: number;
}

export function getPeriodCutoff(period: AnalyticsPeriod): string | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "7d") {
    now.setDate(now.getDate() - 7);
  } else if (period === "30d") {
    now.setDate(now.getDate() - 30);
  } else if (period === "12m") {
    now.setFullYear(now.getFullYear() - 1);
  }
  return now.toISOString();
}

export function getAnalyticsSummary(
  instructorId: number,
  period: AnalyticsPeriod
): AnalyticsSummary {
  const cutoff = getPeriodCutoff(period);

  const revenueResult = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      cutoff
        ? and(
            eq(courses.instructorId, instructorId),
            gte(purchases.createdAt, cutoff)
          )
        : eq(courses.instructorId, instructorId)
    )
    .get();

  const enrollmentResult = db
    .select({ total: sql<number>`coalesce(count(*), 0)` })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(
      cutoff
        ? and(
            eq(courses.instructorId, instructorId),
            gte(enrollments.enrolledAt, cutoff)
          )
        : eq(courses.instructorId, instructorId)
    )
    .get();

  const ratingResult = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      total: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(
      cutoff
        ? and(
            eq(courses.instructorId, instructorId),
            gte(courseRatings.createdAt, cutoff)
          )
        : eq(courses.instructorId, instructorId)
    )
    .get();

  return {
    totalRevenue: revenueResult?.total ?? 0,
    totalEnrollments: enrollmentResult?.total ?? 0,
    averageRating: ratingResult?.average ?? null,
    ratingCount: ratingResult?.total ?? 0,
  };
}
