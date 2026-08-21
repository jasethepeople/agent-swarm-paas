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

export const executions = mysqlTable(
  "executions",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 40 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: varchar("workflowId", { length: 40 }).references(() => workflows.id, { onDelete: "set null" }),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ModelSelection = typeof modelSelections.$inferSelect;
export type ExecutionTrace = typeof executionTraces.$inferSelect;
