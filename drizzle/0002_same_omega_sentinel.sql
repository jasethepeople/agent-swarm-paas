CREATE TABLE `alertSettings` (
	`tenantId` varchar(40) NOT NULL,
	`maxExecutionCostMicros` int NOT NULL DEFAULT 75000,
	`maxLatencyMs` int NOT NULL DEFAULT 8000,
	`maxFailures` int NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alertSettings_tenantId` PRIMARY KEY(`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `tenantInvitations` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','user') NOT NULL DEFAULT 'user',
	`status` enum('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
	`invitedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	CONSTRAINT `tenantInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitation_tenant_email_unique` UNIQUE(`tenantId`,`email`)
);
--> statement-breakpoint
CREATE TABLE `workflowRunTraces` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`workflowRunId` varchar(40) NOT NULL,
	`executionId` varchar(40),
	`nodeId` varchar(80),
	`agentId` varchar(40),
	`level` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`eventType` varchar(80) NOT NULL,
	`message` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowRunTraces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowRuns` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`workflowId` varchar(40) NOT NULL,
	`requestedBy` int NOT NULL,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`initialInput` text NOT NULL,
	`finalOutput` text,
	`totalTokens` int NOT NULL DEFAULT 0,
	`estimatedCostMicros` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `workflowRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `executions` ADD `workflowRunId` varchar(40);--> statement-breakpoint
ALTER TABLE `alertSettings` ADD CONSTRAINT `alertSettings_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD CONSTRAINT `tenantInvitations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantInvitations` ADD CONSTRAINT `tenantInvitations_invitedBy_users_id_fk` FOREIGN KEY (`invitedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunTraces` ADD CONSTRAINT `workflowRunTraces_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunTraces` ADD CONSTRAINT `workflowRunTraces_workflowRunId_workflowRuns_id_fk` FOREIGN KEY (`workflowRunId`) REFERENCES `workflowRuns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunTraces` ADD CONSTRAINT `workflowRunTraces_executionId_executions_id_fk` FOREIGN KEY (`executionId`) REFERENCES `executions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRunTraces` ADD CONSTRAINT `workflowRunTraces_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRuns` ADD CONSTRAINT `workflowRuns_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRuns` ADD CONSTRAINT `workflowRuns_workflowId_workflows_id_fk` FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowRuns` ADD CONSTRAINT `workflowRuns_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `workflow_traces_run_idx` ON `workflowRunTraces` (`tenantId`,`workflowRunId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `workflow_runs_tenant_started_idx` ON `workflowRuns` (`tenantId`,`startedAt`);--> statement-breakpoint
ALTER TABLE `executions` ADD CONSTRAINT `executions_workflowRunId_workflowRuns_id_fk` FOREIGN KEY (`workflowRunId`) REFERENCES `workflowRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `executions_workflow_run_idx` ON `executions` (`workflowRunId`);