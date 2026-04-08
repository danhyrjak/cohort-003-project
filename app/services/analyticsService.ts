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

export interface RevenueDataPoint {
  date: string; // YYYY-MM-DD for daily, YYYY-MM for monthly
  revenue: number;
}

export interface CourseBreakdown {
  courseId: number;
  title: string;
  listPrice: number;
  revenue: number;
  salesCount: number;
  enrollmentCount: number;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateDailyBuckets(days: number): string[] {
  const buckets: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.push(d.toISOString().slice(0, 10));
  }
  return buckets;
}

function generateMonthlyBuckets(fromIso: string, toDate: Date): string[] {
  const buckets: string[] = [];
  const start = new Date(fromIso);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const endMonth = toDate.toISOString().slice(0, 7);
  const current = new Date(start);
  while (current.toISOString().slice(0, 7) <= endMonth) {
    buckets.push(current.toISOString().slice(0, 7));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return buckets;
}

// ─── getRevenueTimeSeries ─────────────────────────────────────────────────────

export function getRevenueTimeSeries(
  instructorId: number,
  period: AnalyticsPeriod
): RevenueDataPoint[] {
  const isMonthly = period === "12m" || period === "all";
  const cutoff = getPeriodCutoff(period);
  const strftimeFormat = isMonthly ? "%Y-%m" : "%Y-%m-%d";

  const rows = db
    .select({
      bucket: sql<string>`strftime(${strftimeFormat}, ${purchases.createdAt})`,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      cutoff
        ? and(eq(courses.instructorId, instructorId), gte(purchases.createdAt, cutoff))
        : eq(courses.instructorId, instructorId)
    )
    .groupBy(sql`strftime(${strftimeFormat}, ${purchases.createdAt})`)
    .all();

  const revenueMap = new Map<string, number>();
  for (const row of rows) {
    revenueMap.set(row.bucket, row.revenue);
  }

  let buckets: string[];
  if (period === "7d") {
    buckets = generateDailyBuckets(7);
  } else if (period === "30d") {
    buckets = generateDailyBuckets(30);
  } else if (period === "12m") {
    buckets = generateMonthlyBuckets(
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      new Date()
    );
  } else {
    // all: from first purchase to now
    const minRow = db
      .select({ minDate: sql<string | null>`min(${purchases.createdAt})` })
      .from(purchases)
      .innerJoin(courses, eq(purchases.courseId, courses.id))
      .where(eq(courses.instructorId, instructorId))
      .get();
    if (!minRow?.minDate) return [];
    buckets = generateMonthlyBuckets(minRow.minDate, new Date());
  }

  return buckets.map((date) => ({
    date,
    revenue: revenueMap.get(date) ?? 0,
  }));
}

// ─── getCourseBreakdown ───────────────────────────────────────────────────────

export function getCourseBreakdown(
  instructorId: number,
  period: AnalyticsPeriod
): CourseBreakdown[] {
  const cutoff = getPeriodCutoff(period);

  const instructorCourses = db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  if (instructorCourses.length === 0) return [];

  const purchaseRows = db
    .select({
      courseId: purchases.courseId,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      salesCount: sql<number>`count(*)`,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      cutoff
        ? and(eq(courses.instructorId, instructorId), gte(purchases.createdAt, cutoff))
        : eq(courses.instructorId, instructorId)
    )
    .groupBy(purchases.courseId)
    .all();

  const enrollmentRows = db
    .select({
      courseId: enrollments.courseId,
      enrollmentCount: sql<number>`count(*)`,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(
      cutoff
        ? and(eq(courses.instructorId, instructorId), gte(enrollments.enrolledAt, cutoff))
        : eq(courses.instructorId, instructorId)
    )
    .groupBy(enrollments.courseId)
    .all();

  const ratingRows = db
    .select({
      courseId: courseRatings.courseId,
      averageRating: sql<number | null>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(
      cutoff
        ? and(eq(courses.instructorId, instructorId), gte(courseRatings.createdAt, cutoff))
        : eq(courses.instructorId, instructorId)
    )
    .groupBy(courseRatings.courseId)
    .all();

  const purchaseMap = new Map(purchaseRows.map((r) => [r.courseId, r]));
  const enrollmentMap = new Map(enrollmentRows.map((r) => [r.courseId, r]));
  const ratingMap = new Map(ratingRows.map((r) => [r.courseId, r]));

  return instructorCourses.map((course) => {
    const p = purchaseMap.get(course.id);
    const e = enrollmentMap.get(course.id);
    const r = ratingMap.get(course.id);
    return {
      courseId: course.id,
      title: course.title,
      listPrice: course.price,
      revenue: p?.revenue ?? 0,
      salesCount: p?.salesCount ?? 0,
      enrollmentCount: e?.enrollmentCount ?? 0,
      averageRating: r?.averageRating ?? null,
      ratingCount: r?.ratingCount ?? 0,
    };
  });
}
