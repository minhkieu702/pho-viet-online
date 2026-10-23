CREATE TABLE `hits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`target` text NOT NULL,
	`attacker` text NOT NULL,
	`damage` integer NOT NULL,
	`dx` real NOT NULL,
	`dz` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`target`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hits_target_idx` ON `hits` (`target`);--> statement-breakpoint
CREATE INDEX `hits_created_idx` ON `hits` (`created_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `health` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `weapon` text DEFAULT 'fists' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `vehicle` text DEFAULT 'foot' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `down` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `firing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `wanted` integer DEFAULT 0 NOT NULL;