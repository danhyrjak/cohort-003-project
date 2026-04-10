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

// Import after mock so the module picks up our test db
import {
  createNotification,
  getNotifications,
  getNotificationById,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("creates a notification with all fields", () => {
      const notification = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Test User enrolled in Test Course",
        "/instructor/1/students"
      );

      expect(notification).toBeDefined();
      expect(notification.recipientUserId).toBe(base.instructor.id);
      expect(notification.type).toBe(schema.NotificationType.Enrollment);
      expect(notification.title).toBe("New Enrollment");
      expect(notification.message).toBe("Test User enrolled in Test Course");
      expect(notification.linkUrl).toBe("/instructor/1/students");
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });

    it("defaults isRead to false", () => {
      const notification = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );

      expect(notification.isRead).toBe(false);
    });
  });

  describe("getNotifications", () => {
    it("returns notifications for a user ordered newest first", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "First",
        "First message",
        "/link"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Second",
        "Second message",
        "/link"
      );

      const results = getNotifications(base.instructor.id, 10, 0);
      expect(results).toHaveLength(2);
      // Most recent first — second created should appear first
      expect(results[0].title).toBe("Second");
      expect(results[1].title).toBe("First");
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        createNotification(
          base.instructor.id,
          schema.NotificationType.Enrollment,
          `Notification ${i}`,
          "Message",
          "/link"
        );
      }

      const results = getNotifications(base.instructor.id, 3, 0);
      expect(results).toHaveLength(3);
    });

    it("respects the offset parameter", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "First",
        "Message",
        "/link"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Second",
        "Message",
        "/link"
      );

      const results = getNotifications(base.instructor.id, 10, 1);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("First");
    });

    it("returns empty array when user has no notifications", () => {
      expect(getNotifications(base.instructor.id, 10, 0)).toHaveLength(0);
    });

    it("only returns notifications for the specified user", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "For instructor",
        "Message",
        "/link"
      );
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "For student",
        "Message",
        "/link"
      );

      const instructorResults = getNotifications(base.instructor.id, 10, 0);
      expect(instructorResults).toHaveLength(1);
      expect(instructorResults[0].title).toBe("For instructor");

      const studentResults = getNotifications(base.user.id, 10, 0);
      expect(studentResults).toHaveLength(1);
      expect(studentResults[0].title).toBe("For student");
    });
  });

  describe("getUnreadCount", () => {
    it("returns the count of unread notifications", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title 2",
        "Message",
        "/link"
      );

      expect(getUnreadCount(base.instructor.id)).toBe(2);
    });

    it("returns 0 when all notifications are read", () => {
      const n = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );
      markAsRead(n.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("returns 0 when user has no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("only counts unread notifications for the specified user", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );

      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });
  });

  describe("markAsRead", () => {
    it("marks a single notification as read", () => {
      const n = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Title",
        "Message",
        "/link"
      );

      markAsRead(n.id);

      const updated = getNotificationById(n.id);
      expect(updated?.isRead).toBe(true);
    });

    it("does not affect other notifications", () => {
      const n1 = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "First",
        "Message",
        "/link"
      );
      const n2 = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Second",
        "Message",
        "/link"
      );

      markAsRead(n1.id);

      const updated2 = getNotificationById(n2.id);
      expect(updated2?.isRead).toBe(false);
    });
  });

  describe("markAllAsRead", () => {
    it("marks all notifications for a user as read", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "First",
        "Message",
        "/link"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "Second",
        "Message",
        "/link"
      );

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("does not mark notifications for other users as read", () => {
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "Student notification",
        "Message",
        "/link"
      );

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.user.id)).toBe(1);
    });
  });
});
