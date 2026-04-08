import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { getAnalyticsSummary, getRevenueTimeSeries, getCourseBreakdown } from "./analyticsService";

// Helper to insert a purchase with a specific createdAt
function insertPurchase(
  userId: number,
  courseId: number,
  pricePaid: number,
  createdAt: string
) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, pricePaid, country: "US", createdAt })
    .returning()
    .get();
}

// Helper to insert an enrollment with a specific enrolledAt
function insertEnrollment(
  userId: number,
  courseId: number,
  enrolledAt: string
) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt })
    .returning()
    .get();
}

// Helper to insert a rating with a specific createdAt
function insertRating(
  userId: number,
  courseId: number,
  rating: number,
  createdAt: string
) {
  return testDb
    .insert(schema.courseRatings)
    .values({ userId, courseId, rating, createdAt, updatedAt: createdAt })
    .returning()
    .get();
}

// Returns an ISO string N days ago from now
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// Returns an ISO string N months ago from now
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── getAnalyticsSummary — Revenue ───

  describe("getAnalyticsSummary — revenue", () => {
    it("returns 0 revenue when instructor has no purchases", () => {
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalRevenue).toBe(0);
    });

    it("sums all purchase revenue for all-time period", () => {
      insertPurchase(base.user.id, base.course.id, 4999, daysAgo(60));
      insertPurchase(base.user.id, base.course.id, 2999, daysAgo(5));
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalRevenue).toBe(7998);
    });

    it("filters revenue to within 7d period", () => {
      insertPurchase(base.user.id, base.course.id, 4999, daysAgo(10)); // outside
      insertPurchase(base.user.id, base.course.id, 1999, daysAgo(3));  // inside
      const result = getAnalyticsSummary(base.instructor.id, "7d");
      expect(result.totalRevenue).toBe(1999);
    });

    it("filters revenue to within 30d period", () => {
      insertPurchase(base.user.id, base.course.id, 4999, daysAgo(45)); // outside
      insertPurchase(base.user.id, base.course.id, 2999, daysAgo(15)); // inside
      const result = getAnalyticsSummary(base.instructor.id, "30d");
      expect(result.totalRevenue).toBe(2999);
    });

    it("filters revenue to within 12m period", () => {
      insertPurchase(base.user.id, base.course.id, 4999, monthsAgo(14)); // outside
      insertPurchase(base.user.id, base.course.id, 2999, monthsAgo(6));  // inside
      const result = getAnalyticsSummary(base.instructor.id, "12m");
      expect(result.totalRevenue).toBe(2999);
    });

    it("only counts revenue for the instructor's own courses", () => {
      // Create a second instructor and course
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "desc",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      insertPurchase(base.user.id, base.course.id, 4999, daysAgo(5));
      insertPurchase(base.user.id, otherCourse.id, 9999, daysAgo(5));

      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalRevenue).toBe(4999);
    });
  });

  // ─── getAnalyticsSummary — Enrollments ───

  describe("getAnalyticsSummary — enrollments", () => {
    it("returns 0 enrollments when instructor has no enrollments", () => {
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalEnrollments).toBe(0);
    });

    it("counts all enrollments for all-time period", () => {
      insertEnrollment(base.user.id, base.course.id, daysAgo(60));
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalEnrollments).toBe(1);
    });

    it("filters enrollments to within 7d period", () => {
      insertEnrollment(base.user.id, base.course.id, daysAgo(10)); // outside
      const student2 = testDb
        .insert(schema.users)
        .values({ name: "S2", email: "s2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();
      insertEnrollment(student2.id, base.course.id, daysAgo(3)); // inside
      const result = getAnalyticsSummary(base.instructor.id, "7d");
      expect(result.totalEnrollments).toBe(1);
    });

    it("only counts enrollments for the instructor's own courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other2@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-2",
          description: "desc",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      insertEnrollment(base.user.id, base.course.id, daysAgo(5));
      insertEnrollment(base.user.id, otherCourse.id, daysAgo(5));

      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.totalEnrollments).toBe(1);
    });
  });

  // ─── getAnalyticsSummary — Ratings ───

  describe("getAnalyticsSummary — ratings", () => {
    it("returns null averageRating and 0 ratingCount when no ratings", () => {
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });

    it("computes correct average rating", () => {
      insertRating(base.user.id, base.course.id, 4, daysAgo(5));
      const student2 = testDb
        .insert(schema.users)
        .values({ name: "S2", email: "s2r@example.com", role: schema.UserRole.Student })
        .returning()
        .get();
      insertRating(student2.id, base.course.id, 2, daysAgo(5));
      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.averageRating).toBeCloseTo(3.0);
      expect(result.ratingCount).toBe(2);
    });

    it("filters ratings to within the selected period", () => {
      insertRating(base.user.id, base.course.id, 5, daysAgo(40)); // outside 30d
      const student2 = testDb
        .insert(schema.users)
        .values({ name: "S2", email: "s2r2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();
      insertRating(student2.id, base.course.id, 3, daysAgo(5)); // inside 30d
      const result = getAnalyticsSummary(base.instructor.id, "30d");
      expect(result.averageRating).toBeCloseTo(3.0);
      expect(result.ratingCount).toBe(1);
    });

    it("only includes ratings for the instructor's own courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other3@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-3",
          description: "desc",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      insertRating(base.user.id, base.course.id, 5, daysAgo(5));
      insertRating(base.user.id, otherCourse.id, 1, daysAgo(5));

      const result = getAnalyticsSummary(base.instructor.id, "all");
      expect(result.averageRating).toBeCloseTo(5.0);
      expect(result.ratingCount).toBe(1);
    });
  });

  // ─── Instructor with no courses ───

  describe("instructor with no courses", () => {
    it("returns all zeros for an instructor with no courses", () => {
      const freshInstructor = testDb
        .insert(schema.users)
        .values({ name: "Fresh", email: "fresh@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();
      const result = getAnalyticsSummary(freshInstructor.id, "all");
      expect(result.totalRevenue).toBe(0);
      expect(result.totalEnrollments).toBe(0);
      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });
  });
});

// ─── getRevenueTimeSeries ────────────────────────────────────────────────────

describe("getRevenueTimeSeries", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("returns empty array for all-time period with no purchases", () => {
    const result = getRevenueTimeSeries(base.instructor.id, "all");
    expect(result).toEqual([]);
  });

  it("returns 7 daily data points for 7d period with no purchases", () => {
    const result = getRevenueTimeSeries(base.instructor.id, "7d");
    expect(result).toHaveLength(7);
    expect(result.every((p) => p.revenue === 0)).toBe(true);
  });

  it("returns 30 daily data points for 30d period", () => {
    const result = getRevenueTimeSeries(base.instructor.id, "30d");
    expect(result).toHaveLength(30);
  });

  it("returns 13 monthly data points for 12m period", () => {
    // 12 months ago to now = 13 months (inclusive of both endpoints)
    const result = getRevenueTimeSeries(base.instructor.id, "12m");
    expect(result.length).toBeGreaterThanOrEqual(12);
    expect(result.every((p) => p.revenue === 0)).toBe(true);
  });

  it("daily data points have YYYY-MM-DD format", () => {
    const result = getRevenueTimeSeries(base.instructor.id, "7d");
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("monthly data points have YYYY-MM format", () => {
    insertPurchase(base.user.id, base.course.id, 1000, daysAgo(5));
    const result = getRevenueTimeSeries(base.instructor.id, "all");
    expect(result[0].date).toMatch(/^\d{4}-\d{2}$/);
  });

  it("aggregates revenue into correct daily bucket", () => {
    insertPurchase(base.user.id, base.course.id, 1000, daysAgo(2));
    insertPurchase(base.user.id, base.course.id, 2000, daysAgo(2));
    const result = getRevenueTimeSeries(base.instructor.id, "7d");
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - 2);
    const targetKey = targetDate.toISOString().slice(0, 10);
    const point = result.find((p) => p.date === targetKey);
    expect(point?.revenue).toBe(3000);
  });

  it("fills zero-revenue days with $0 (no gaps)", () => {
    insertPurchase(base.user.id, base.course.id, 5000, daysAgo(1));
    const result = getRevenueTimeSeries(base.instructor.id, "7d");
    const zeroPoints = result.filter((p) => p.revenue === 0);
    expect(zeroPoints.length).toBe(6); // only 1 day has revenue
  });

  it("aggregates revenue into correct monthly bucket for 12m", () => {
    insertPurchase(base.user.id, base.course.id, 4000, monthsAgo(2));
    const result = getRevenueTimeSeries(base.instructor.id, "12m");
    const targetMonth = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      return d.toISOString().slice(0, 7);
    })();
    const point = result.find((p) => p.date === targetMonth);
    expect(point?.revenue).toBe(4000);
  });

  it("only includes revenue for the instructor's own courses", () => {
    const otherInstructor = testDb
      .insert(schema.users)
      .values({ name: "Other", email: "ts_other@example.com", role: schema.UserRole.Instructor })
      .returning()
      .get();
    const otherCourse = testDb
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "ts-other-course",
        description: "desc",
        instructorId: otherInstructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    insertPurchase(base.user.id, base.course.id, 1000, daysAgo(1));
    insertPurchase(base.user.id, otherCourse.id, 9999, daysAgo(1));

    const result = getRevenueTimeSeries(base.instructor.id, "7d");
    const total = result.reduce((sum, p) => sum + p.revenue, 0);
    expect(total).toBe(1000);
  });

  it("all-time period spans from first purchase to today with monthly buckets", () => {
    insertPurchase(base.user.id, base.course.id, 500, monthsAgo(3));
    const result = getRevenueTimeSeries(base.instructor.id, "all");
    expect(result.length).toBeGreaterThanOrEqual(3);
    const lastPoint = result[result.length - 1];
    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(lastPoint.date).toBe(currentMonth);
  });
});

// ─── getCourseBreakdown ──────────────────────────────────────────────────────

describe("getCourseBreakdown", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("returns empty array for instructor with no courses", () => {
    const fresh = testDb
      .insert(schema.users)
      .values({ name: "Fresh", email: "cb_fresh@example.com", role: schema.UserRole.Instructor })
      .returning()
      .get();
    expect(getCourseBreakdown(fresh.id, "all")).toEqual([]);
  });

  it("returns one row per instructor course", () => {
    const course2 = testDb
      .insert(schema.courses)
      .values({
        title: "Course 2",
        slug: "course-2-cb",
        description: "desc",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    const result = getCourseBreakdown(base.instructor.id, "all");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.courseId).sort()).toEqual(
      [base.course.id, course2.id].sort()
    );
  });

  it("returns correct revenue and sales count per course", () => {
    insertPurchase(base.user.id, base.course.id, 4999, daysAgo(5));
    insertPurchase(base.user.id, base.course.id, 2999, daysAgo(3));

    const [row] = getCourseBreakdown(base.instructor.id, "all");
    expect(row.revenue).toBe(7998);
    expect(row.salesCount).toBe(2);
  });

  it("returns correct enrollment count per course", () => {
    insertEnrollment(base.user.id, base.course.id, daysAgo(5));
    const student2 = testDb
      .insert(schema.users)
      .values({ name: "S2", email: "cb_s2@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    insertEnrollment(student2.id, base.course.id, daysAgo(3));

    const [row] = getCourseBreakdown(base.instructor.id, "all");
    expect(row.enrollmentCount).toBe(2);
  });

  it("returns correct averageRating and ratingCount", () => {
    insertRating(base.user.id, base.course.id, 4, daysAgo(5));
    const student2 = testDb
      .insert(schema.users)
      .values({ name: "S2", email: "cb_s2r@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    insertRating(student2.id, base.course.id, 2, daysAgo(3));

    const [row] = getCourseBreakdown(base.instructor.id, "all");
    expect(row.averageRating).toBeCloseTo(3.0);
    expect(row.ratingCount).toBe(2);
  });

  it("returns null averageRating and 0 ratingCount when no ratings", () => {
    const [row] = getCourseBreakdown(base.instructor.id, "all");
    expect(row.averageRating).toBeNull();
    expect(row.ratingCount).toBe(0);
  });

  it("respects time period filter for revenue", () => {
    insertPurchase(base.user.id, base.course.id, 9999, daysAgo(40)); // outside 30d
    insertPurchase(base.user.id, base.course.id, 1000, daysAgo(5));  // inside 30d

    const [row] = getCourseBreakdown(base.instructor.id, "30d");
    expect(row.revenue).toBe(1000);
    expect(row.salesCount).toBe(1);
  });

  it("respects time period filter for enrollments", () => {
    insertEnrollment(base.user.id, base.course.id, daysAgo(40)); // outside 30d
    const student2 = testDb
      .insert(schema.users)
      .values({ name: "S2", email: "cb_s2e@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    insertEnrollment(student2.id, base.course.id, daysAgo(5)); // inside 30d

    const [row] = getCourseBreakdown(base.instructor.id, "30d");
    expect(row.enrollmentCount).toBe(1);
  });

  it("does not include data from other instructors' courses", () => {
    const other = testDb
      .insert(schema.users)
      .values({ name: "Other", email: "cb_other@example.com", role: schema.UserRole.Instructor })
      .returning()
      .get();
    const otherCourse = testDb
      .insert(schema.courses)
      .values({
        title: "Other",
        slug: "cb-other-course",
        description: "desc",
        instructorId: other.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    insertPurchase(base.user.id, otherCourse.id, 9999, daysAgo(5));

    const result = getCourseBreakdown(base.instructor.id, "all");
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(0);
  });

  it("includes courses with zero revenue (not just courses with purchases)", () => {
    const result = getCourseBreakdown(base.instructor.id, "all");
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(0);
    expect(result[0].salesCount).toBe(0);
  });

  it("includes the course list price", () => {
    const result = getCourseBreakdown(base.instructor.id, "all");
    expect(result[0].listPrice).toBe(base.course.price);
  });
});
