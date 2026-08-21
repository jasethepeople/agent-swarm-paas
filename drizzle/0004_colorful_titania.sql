CREATE TABLE `tenantAuditEvents` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`actorId` int,
	`action` varchar(100) NOT NULL,
	`subjectType` varchar(60) NOT NULL,
	`subjectId` varchar(80),
	`summary` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenantAuditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowRunAnnotations` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`workflowRunId` varchar(40) NOT NULL,
	`createdBy` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowRunAnnotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tenantAuditEvents` ADD CONSTRAINT `tenantAuditEvents_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantAuditEvents` ADD CONSTRAINT `tenantAuditEvents_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunAnnotations` ADD CONSTRAINT `workflowRunAnnotations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunAnnotations` ADD CONSTRAINT `workflowRunAnnotations_workflowRunId_workflowRuns_id_fk` FOREIGN KEY (`workflowRunId`) REFERENCES `workflowRuns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunAnnotations` ADD CONSTRAINT `workflowRunAnnotations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_tenant_created_idx` ON `tenantAuditEvents` (`tenantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `run_annotations_tenant_run_idx` ON `workflowRunAnnotations` (`tenantId`,`workflowRunId`,`createdAt`);