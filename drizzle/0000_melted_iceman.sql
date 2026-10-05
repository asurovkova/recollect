CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`terms` text NOT NULL,
	`collection` text NOT NULL,
	`source` text NOT NULL,
	`image_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_captures_user_created` ON `captures` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`correct` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_user_card` ON `review_events` (`user_id`,`card_id`);