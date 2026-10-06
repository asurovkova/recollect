CREATE TABLE `learner_reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`session_id` text NOT NULL,
	`note` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reflection_owner_item` ON `learner_reflections` (`user_id`,`item_id`);--> statement-breakpoint
ALTER TABLE `item_attempts` ADD `diagnosis` text;--> statement-breakpoint
ALTER TABLE `item_attempts` ADD `hint_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `item_attempts` ADD `revision` integer DEFAULT 0 NOT NULL;