CREATE TABLE `lesson_comments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `lesson_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `parent_id` integer,
  `body` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `report_reason` text,
  `admin_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`parent_id`) REFERENCES `lesson_comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lesson_comments_lesson_id_idx` ON `lesson_comments` (`lesson_id`);
--> statement-breakpoint
CREATE INDEX `lesson_comments_status_idx` ON `lesson_comments` (`status`);
