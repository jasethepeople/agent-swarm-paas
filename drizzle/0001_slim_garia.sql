CREATE TABLE `agents` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`systemPrompt` text NOT NULL,
	`modelPreference` varchar(120) NOT NULL DEFAULT 'auto',
	`status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
	`configuration` json,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executionTraces` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`executionId` varchar(40) NOT NULL,
	`agentId` varchar(40),
	`level` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`eventType` varchar(80) NOT NULL,
	`message` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `executionTraces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executions` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`workflowId` varchar(40),
	`agentId` varchar(40) NOT NULL,
	`requestedBy` int NOT NULL,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`selectedModel` varchar(120),
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`estimatedCostMicros` int NOT NULL DEFAULT 0,
	`output` text,
	`error` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modelSelections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`executionId` varchar(40) NOT NULL,
	`modelId` varchar(120) NOT NULL,
	`provider` varchar(60) NOT NULL,
	`compositeScore` int NOT NULL,
	`estimatedInputCostMicros` int NOT NULL,
	`estimatedOutputCostMicros` int NOT NULL,
	`observedLatencyMs` int,
	`selectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modelSelections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rateLimitWindows` (
	`id` varchar(120) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`blocked` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rateLimitWindows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenantMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','user') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenantMemberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_tenant_user_unique` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`plan` enum('pilot','scale','enterprise') NOT NULL DEFAULT 'pilot',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` varchar(40) NOT NULL,
	`tenantId` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`graph` json NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executionTraces` ADD CONSTRAINT `executionTraces_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executionTraces` ADD CONSTRAINT `executionTraces_executionId_executions_id_fk` FOREIGN KEY (`executionId`) REFERENCES `executions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executionTraces` ADD CONSTRAINT `executionTraces_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executions` ADD CONSTRAINT `executions_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executions` ADD CONSTRAINT `executions_workflowId_workflows_id_fk` FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executions` ADD CONSTRAINT `executions_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executions` ADD CONSTRAINT `executions_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modelSelections` ADD CONSTRAINT `modelSelections_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modelSelections` ADD CONSTRAINT `modelSelections_executionId_executions_id_fk` FOREIGN KEY (`executionId`) REFERENCES `executions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rateLimitWindows` ADD CONSTRAINT `rateLimitWindows_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantMemberships` ADD CONSTRAINT `tenantMemberships_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantMemberships` ADD CONSTRAINT `tenantMemberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflows` ADD CONSTRAINT `workflows_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agents_tenant_idx` ON `agents` (`tenantId`);--> statement-breakpoint
CREATE INDEX `traces_tenant_execution_idx` ON `executionTraces` (`tenantId`,`executionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `executions_tenant_started_idx` ON `executions` (`tenantId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `executions_agent_idx` ON `executions` (`agentId`);--> statement-breakpoint
CREATE INDEX `selections_tenant_selected_idx` ON `modelSelections` (`tenantId`,`selectedAt`);--> statement-breakpoint
CREATE INDEX `selections_execution_idx` ON `modelSelections` (`executionId`);--> statement-breakpoint
CREATE INDEX `rate_limit_tenant_window_idx` ON `rateLimitWindows` (`tenantId`,`windowStartedAt`);--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `tenantMemberships` (`userId`);--> statement-breakpoint
CREATE INDEX `workflows_tenant_idx` ON `workflows` (`tenantId`);