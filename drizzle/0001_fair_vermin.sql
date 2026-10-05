CREATE TABLE `capture_content` (
	`capture_id` text PRIMARY KEY NOT NULL,
	`extraction` text NOT NULL,
	`plan` text,
	`profile` text,
	`notice` text
);
--> statement-breakpoint
CREATE TABLE `item_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`outcome` text NOT NULL,
	`answer` text NOT NULL,
	`assisted` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attempt_owner_item` ON `item_attempts` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `item_schedule` (
	`item_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`streak` integer NOT NULL,
	`due_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`capture_id` text NOT NULL,
	`region_id` text NOT NULL,
	`quote` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identity` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_learning_owner` ON `learning_items` (`user_id`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
