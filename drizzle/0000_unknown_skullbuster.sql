CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`angle` real DEFAULT 0 NOT NULL,
	`riding` integer DEFAULT false NOT NULL,
	`speed` real DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `players_room_seen_idx` ON `players` (`room`,`last_seen`);--> statement-breakpoint
CREATE INDEX `players_seen_idx` ON `players` (`last_seen`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_activity_idx` ON `rooms` (`last_activity`);