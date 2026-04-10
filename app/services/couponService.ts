import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  purchases,
  enrollments,
  users,
  courses,
  teamMembers,
  TeamMemberRole,
  NotificationType,
} from "~/db/schema";
import { createNotification } from "~/services/notificationService";
import crypto from "crypto";

// ─── Coupon Service ───
// Handles coupon generation, redemption (with validation), and listing.
// Each coupon grants one seat for a specific course within a team.

function generateCode(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function generateCoupons(
  teamId: number,
  courseId: number,
  purchaseId: number,
  quantity: number
) {
  const created: (typeof coupons.$inferSelect)[] = [];
  for (let i = 0; i < quantity; i++) {
    const coupon = db
      .insert(coupons)
      .values({
        teamId,
        courseId,
        code: generateCode(),
        purchaseId,
      })
      .returning()
      .get();
    created.push(coupon);
  }
  return created;
}

export function getCouponByCode(code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

export function getCouponsForTeam(teamId: number, courseId?: number) {
  if (courseId !== undefined) {
    return db
      .select()
      .from(coupons)
      .where(and(eq(coupons.teamId, teamId), eq(coupons.courseId, courseId)))
      .all();
  }
  return db.select().from(coupons).where(eq(coupons.teamId, teamId)).all();
}

export type RedeemResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

export function redeemCoupon(
  code: string,
  userId: number,
  userCountry: string
): RedeemResult {
  // 1. Find the coupon
  const coupon = getCouponByCode(code);
  if (!coupon) {
    return { ok: false, error: "Coupon not found" };
  }

  // 2. Check if already consumed
  if (coupon.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  // 3. Check if user is already enrolled
  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, coupon.courseId)
      )
    )
    .get();

  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  // 4. Country check: match purchaser's country
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, coupon.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  // 5. Redeem: mark coupon consumed + enroll user
  db.update(coupons)
    .set({
      redeemedByUserId: userId,
      redeemedAt: new Date().toISOString(),
    })
    .where(eq(coupons.id, coupon.id))
    .run();

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId: coupon.courseId })
    .returning()
    .get();

  // 6. Notify all team admins of the redemption
  const redeemer = db.select().from(users).where(eq(users.id, userId)).get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, coupon.courseId))
    .get();
  const admins = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, coupon.teamId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .all();

  const teamCoupons = db
    .select()
    .from(coupons)
    .where(
      and(eq(coupons.teamId, coupon.teamId), eq(coupons.courseId, coupon.courseId))
    )
    .all();
  const totalSeats = teamCoupons.length;
  const remainingSeats = teamCoupons.filter(
    (c) => c.redeemedByUserId === null
  ).length;

  const message = `${redeemer?.name} redeemed a coupon for ${course?.title} (${remainingSeats} of ${totalSeats} seats remaining)`;

  for (const admin of admins) {
    createNotification(
      admin.userId,
      NotificationType.CouponRedemption,
      "Seat Claimed",
      message,
      "/team"
    );
  }

  return { ok: true, enrollment };
}
