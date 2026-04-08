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

import { getAnalyticsSummary } from "./analyticsService";

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
