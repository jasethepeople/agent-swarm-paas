CREATE TABLE `alertIncidents` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`fingerprint` varchar(180) NOT NULL,
	`alertType` enum('cost','latency','failure') NOT NULL,
	`executionId` varchar(40),
	`message` text NOT NULL,
	`observedValue` int NOT NULL,
	`thresholdValue` int NOT NULL,
	`status` enum('open','acknowledged') NOT NULL DEFAULT 'open',
	`acknowledgedBy` int,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alertIncidents_id` PRIMARY KEY(`id`),
	CONSTRAINT `incident_tenant_fingerprint_unique` UNIQUE(`tenantId`,`fingerprint`)
);
--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD `deliveryStatus` enum('not_sent','sent','failed') DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD `providerMessageId` varchar(120);--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD `deliveryError` text;--> statement-breakpoint
ALTER TABLE `workflowRuns` ADD `replayOfRunId` varchar(40);--> statement-breakpoint
ALTER TABLE `alertIncidents` ADD CONSTRAINT `alertIncidents_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertIncidents` ADD CONSTRAINT `alertIncidents_executionId_executions_id_fk` FOREIGN KEY (`executionId`) REFERENCES `executions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertIncidents` ADD CONSTRAINT `alertIncidents_acknowledgedBy_users_id_fk` FOREIGN KEY (`acknowledgedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `incident_tenant_status_idx` ON `alertIncidents` (`tenantId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `workflow_runs_replay_idx` ON `workflowRuns` (`replayOfRunId`);