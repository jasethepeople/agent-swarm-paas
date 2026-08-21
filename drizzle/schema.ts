import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 40 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  plan: mysqlEnum("plan", ["pilot", "scale", "enterprise"]).default("pilot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tenantMemberships = mysqlTable(
  "tenantMemberships",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("membership_tenant_user_unique").on(table.tenantId, table.userId),
    index("membership_user_idx").on(table.userId),
  ],
);

export const tenantInvitations = mysqlTable(
  "tenantInvitations",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "revoked"]).default("pending").notNull(),
    invitedBy: int("invitedBy").notNull().references(() => users.id),
    deliveryStatus: mysqlEnum("deliveryStatus", ["not_sent", "sent", "failed"]).default("not_sent").notNull(),
    providerMessageId: varchar("providerMessageId", { length: 120 }),
    sentAt: timestamp("sentAt"),
    deliveryError: text("deliveryError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    acceptedAt: timestamp("acceptedAt"),
  },
  table => [uniqueIndex("invitation_tenant_email_unique").on(table.tenantId, table.email)],
);

export const agents = mysqlTable(
  "agents",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    systemPrompt: text("systemPrompt").notNull(),
    modelPreference: varchar("modelPreference", { length: 120 }).default("auto").notNull(),
    status: mysqlEnum("status", ["enabled", "disabled"]).default("enabled").notNull(),
    configuration: json("configuration"),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("agents_tenant_idx").on(table.tenantId)],
);

export const workflows = mysqlTable(
  "workflows",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    graph: json("graph").notNull(),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("workflows_tenant_idx").on(table.tenantId)],
);

export const workflowRuns = mysqlTable(
  "workflowRuns",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: varchar("workflowId", { length: 40 }).notNull().references(() => workflows.id),
    replayOfRunId: varchar("replayOfRunId", { length: 40 }),
    requestedBy: int("requestedBy").notNull().references(() => users.id),
    status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
    initialInput: text("initialInput").notNull(),
    finalOutput: text("finalOutput"),
    totalTokens: int("totalTokens").default(0).notNull(),
    estimatedCostMicros: int("estimatedCostMicros").default(0).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("workflow_runs_tenant_started_idx").on(table.tenantId, table.startedAt),
    index("workflow_runs_replay_idx").on(table.replayOfRunId),
  ],
);

export const workflowRunAnnotations = mysqlTable(
  "workflowRunAnnotations",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    workflowRunId: varchar("workflowRunId", { length: 40 }).notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
    createdBy: int("createdBy").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("run_annotations_tenant_run_idx").on(table.tenantId, table.workflowRunId, table.createdAt)],
);

export const executions = mysqlTable(
  "executions",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: varchar("workflowId", { length: 40 }).references(() => workflows.id, { onDelete: "set null" }),
    workflowRunId: varchar("workflowRunId", { length: 40 }).references(() => workflowRuns.id, { onDelete: "set null" }),
    agentId: varchar("agentId", { length: 40 }).notNull().references(() => agents.id),
    requestedBy: int("requestedBy").notNull().references(() => users.id),
    status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
    selectedModel: varchar("selectedModel", { length: 120 }),
    promptTokens: int("promptTokens").default(0).notNull(),
    completionTokens: int("completionTokens").default(0).notNull(),
    totalTokens: int("totalTokens").default(0).notNull(),
    estimatedCostMicros: int("estimatedCostMicros").default(0).notNull(),
    output: text("output"),
    error: text("error"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("executions_tenant_started_idx").on(table.tenantId, table.startedAt),
    index("executions_agent_idx").on(table.agentId),
    index("executions_workflow_run_idx").on(table.workflowRunId),
  ],
);

export const modelSelections = mysqlTable(
  "modelSelections",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    executionId: varchar("executionId", { length: 40 }).notNull().references(() => executions.id, { onDelete: "cascade" }),
    modelId: varchar("modelId", { length: 120 }).notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    compositeScore: int("compositeScore").notNull(),
    estimatedInputCostMicros: int("estimatedInputCostMicros").notNull(),
    estimatedOutputCostMicros: int("estimatedOutputCostMicros").notNull(),
    observedLatencyMs: int("observedLatencyMs"),
    selectedAt: timestamp("selectedAt").defaultNow().notNull(),
  },
  table => [
    index("selections_tenant_selected_idx").on(table.tenantId, table.selectedAt),
    index("selections_execution_idx").on(table.executionId),
  ],
);

export const executionTraces = mysqlTable(
  "executionTraces",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    executionId: varchar("executionId", { length: 40 }).notNull().references(() => executions.id, { onDelete: "cascade" }),
    agentId: varchar("agentId", { length: 40 }).references(() => agents.id),
    level: mysqlEnum("level", ["info", "warning", "error"]).default("info").notNull(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    message: text("message").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("traces_tenant_execution_idx").on(table.tenantId, table.executionId, table.createdAt)],
);

export const workflowRunTraces = mysqlTable(
  "workflowRunTraces",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    workflowRunId: varchar("workflowRunId", { length: 40 }).notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
    executionId: varchar("executionId", { length: 40 }).references(() => executions.id, { onDelete: "set null" }),
    nodeId: varchar("nodeId", { length: 80 }),
    agentId: varchar("agentId", { length: 40 }).references(() => agents.id),
    level: mysqlEnum("level", ["info", "warning", "error"]).default("info").notNull(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    message: text("message").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("workflow_traces_run_idx").on(table.tenantId, table.workflowRunId, table.createdAt)],
);

export const rateLimitWindows = mysqlTable(
  "rateLimitWindows",
  {
    id: varchar("id", { length: 120 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    windowStartedAt: timestamp("windowStartedAt").notNull(),
    requestCount: int("requestCount").default(0).notNull(),
    blocked: boolean("blocked").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("rate_limit_tenant_window_idx").on(table.tenantId, table.windowStartedAt)],
);

export const alertSettings = mysqlTable("alertSettings", {
  tenantId: varchar("tenantId", { length: 40 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  maxExecutionCostMicros: int("maxExecutionCostMicros").default(75_000).notNull(),
  maxLatencyMs: int("maxLatencyMs").default(8_000).notNull(),
  maxFailures: int("maxFailures").default(1).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const alertIncidents = mysqlTable(
  "alertIncidents",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    fingerprint: varchar("fingerprint", { length: 180 }).notNull(),
    alertType: mysqlEnum("alertType", ["cost", "latency", "failure"]).notNull(),
    executionId: varchar("executionId", { length: 40 }).references(() => executions.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    observedValue: int("observedValue").notNull(),
    thresholdValue: int("thresholdValue").notNull(),
    status: mysqlEnum("status", ["open", "acknowledged"]).default("open").notNull(),
    acknowledgedBy: int("acknowledgedBy").references(() => users.id, { onDelete: "set null" }),
    acknowledgedAt: timestamp("acknowledgedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("incident_tenant_fingerprint_unique").on(table.tenantId, table.fingerprint),
    index("incident_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
  ],
);

export const tenantAuditEvents = mysqlTable(
  "tenantAuditEvents",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    subjectType: varchar("subjectType", { length: 60 }).notNull(),
    subjectId: varchar("subjectId", { length: 80 }),
    summary: text("summary").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type TenantInvitation = typeof tenantInvitations.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowRunTrace = typeof workflowRunTraces.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ModelSelection = typeof modelSelections.$inferSelect;
export type ExecutionTrace = typeof executionTraces.$inferSelect;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type AlertIncident = typeof alertIncidents.$inferSelect;
export type WorkflowRunAnnotation = typeof workflowRunAnnotations.$inferSelect;
export type TenantAuditEvent = typeof tenantAuditEvents.$inferSelect;
