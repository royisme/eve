CREATE TABLE `auth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `cron_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`schedule` text NOT NULL,
	`target` text DEFAULT 'isolated' NOT NULL,
	`wake_mode` text DEFAULT 'lazy',
	`payload_type` text NOT NULL,
	`payload_params` text,
	`enabled` integer DEFAULT 1,
	`timezone` text DEFAULT 'America/Toronto',
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `cron_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer,
	`session_id` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`result_summary` text,
	`error_message` text,
	`trigger_reason` text,
	FOREIGN KEY (`job_id`) REFERENCES `cron_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`is_primary` integer DEFAULT 0,
	`is_authorized` integer DEFAULT 0,
	`alias` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_accounts_email_unique` ON `email_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `job_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `job_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`old_status` text,
	`new_status` text NOT NULL,
	`changed_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_status_history_new_status` ON `job_status_history` (`new_status`);--> statement-breakpoint
CREATE INDEX `idx_job_status_history_changed_at` ON `job_status_history` (`changed_at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`sender` text NOT NULL,
	`subject` text NOT NULL,
	`snippet` text,
	`received_at` text NOT NULL,
	`company` text,
	`title` text,
	`status` text DEFAULT 'inbox',
	`url` text,
	`url_hash` text,
	`thread_id` text,
	`first_seen_at` text,
	`last_seen_at` text,
	`description` text,
	`analysis` text,
	`crawled_at` text,
	`score` integer,
	`priority` text,
	`tags` text,
	`starred` integer DEFAULT 0,
	`applied_at` text,
	`raw_body` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_url_hash_unique` ON `jobs` (`url_hash`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`is_default` integer DEFAULT 0,
	`use_count` integer DEFAULT 0,
	`source` text DEFAULT 'paste',
	`original_filename` text,
	`parse_status` text DEFAULT 'success',
	`parse_errors` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `sys_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`group` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `tailored_resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`content` text NOT NULL,
	`suggestions` text,
	`version` integer DEFAULT 1,
	`is_latest` integer DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
