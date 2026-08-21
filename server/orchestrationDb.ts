import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  agents,
  executions,
  executionTraces,
  modelSelections,
  rateLimitWindows,
  tenantMemberships,
  tenants,
  workflows,
} from "../drizzle/schema";
import { getDb } from "./db";

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
};

export async function listTenantsForUser(userId: number) {
  const db = await requireDb();
  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
      membershipRole: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(eq(tenantMemberships.userId, userId))
    .orderBy(desc(tenants.createdAt));
}

export async function createTenantForUser(input: {
  userId: number;
  name: string;
  slug: string;
}) {
  const db = await requireDb();
  const tenantId = nanoid(18);

  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: input.name, slug: input.slug });
    await tx.insert(tenantMemberships).values({
      tenantId,
      userId: input.userId,
      role: "admin",
    });
  });

  return { id: tenantId, name: input.name, slug: input.slug, membershipRole: "admin" as const };
}

export async function ensureDefaultTenantForUser(user: { id: number; name: string | null; openId: string }) {
  const memberships = await listTenantsForUser(user.id);
  if (memberships.length > 0) return memberships;

  const shortId = user.openId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase() || nanoid(6).toLowerCase();
  await createTenantForUser({
    userId: user.id,
    name: `${user.name || "Operator"} Command`,
    slug: `command-${shortId}-${nanoid(4).toLowerCase()}`,
  });
  return listTenantsForUser(user.id);
}

export async function getTenantScope(tenantId: string, userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ tenant: tenants, membership: tenantMemberships })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function consumeTenantQuota(tenantId: string, limit = 90) {
  const db = await requireDb();
  const windowStartedAt = new Date();
  windowStartedAt.setUTCSeconds(0, 0);
  const windowId = `${tenantId}:${windowStartedAt.toISOString()}`;

  await db
    .insert(rateLimitWindows)
    .values({ id: windowId, tenantId, windowStartedAt, requestCount: 1 })
    .onDuplicateKeyUpdate({
      set: {
        requestCount: sql`${rateLimitWindows.requestCount} + 1`,
        updatedAt: new Date(),
      },
    });

  const rows = await db.select().from(rateLimitWindows).where(eq(rateLimitWindows.id, windowId)).limit(1);
  const count = rows[0]?.requestCount ?? limit + 1;
  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterMs: Math.max(1, 60_000 - (Date.now() - windowStartedAt.getTime())),
  };
}

export async function listAgentsForTenant(tenantId: string) {
  const db = await requireDb();
  return db.select().from(agents).where(eq(agents.tenantId, tenantId)).orderBy(desc(agents.updatedAt));
}

export async function getAgentForTenant(tenantId: string, agentId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createAgentForTenant(input: {
  tenantId: string;
  createdBy: number;
  name: string;
  description?: string | null;
  systemPrompt: string;
  modelPreference: string;
  configuration?: unknown;
}) {
  const db = await requireDb();
  const id = nanoid(18);
  await db.insert(agents).values({
    id,
    tenantId: input.tenantId,
    createdBy: input.createdBy,
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt,
    modelPreference: input.modelPreference,
    configuration: input.configuration,
  });
  return getAgentForTenant(input.tenantId, id);
}

export async function updateAgentForTenant(input: {
  tenantId: string;
  agentId: string;
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  modelPreference?: string;
  status?: "enabled" | "disabled";
  configuration?: unknown;
}) {
  const db = await requireDb();
  const changes = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => !["tenantId", "agentId"].includes(key) && value !== undefined),
  );
  await db
    .update(agents)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(agents.tenantId, input.tenantId), eq(agents.id, input.agentId)));
  return getAgentForTenant(input.tenantId, input.agentId);
}

export async function deleteAgentForTenant(tenantId: string, agentId: string) {
  const db = await requireDb();
  const result = await db.delete(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  return result[0]?.affectedRows ?? 0;
}

export async function listWorkflowsForTenant(tenantId: string) {
  const db = await requireDb();
  return db.select().from(workflows).where(eq(workflows.tenantId, tenantId)).orderBy(desc(workflows.updatedAt));
}

export async function getWorkflowForTenant(tenantId: string, workflowId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.tenantId, tenantId), eq(workflows.id, workflowId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveWorkflowForTenant(input: {
  tenantId: string;
  workflowId?: string;
  createdBy: number;
  name: string;
  graph: unknown;
}) {
  const db = await requireDb();
  const id = input.workflowId ?? nanoid(18);
  const existing = input.workflowId ? await getWorkflowForTenant(input.tenantId, input.workflowId) : null;

  if (existing) {
    await db
      .update(workflows)
      .set({ name: input.name, graph: input.graph, updatedAt: new Date() })
      .where(and(eq(workflows.tenantId, input.tenantId), eq(workflows.id, id)));
  } else {
    await db.insert(workflows).values({
      id,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      name: input.name,
      graph: input.graph,
    });
  }

  return getWorkflowForTenant(input.tenantId, id);
}

export async function deleteWorkflowForTenant(tenantId: string, workflowId: string) {
  const db = await requireDb();
  const result = await db.delete(workflows).where(and(eq(workflows.tenantId, tenantId), eq(workflows.id, workflowId)));
  return result[0]?.affectedRows ?? 0;
}

export async function createExecution(input: {
  tenantId: string;
  agentId: string;
  requestedBy: number;
  workflowId?: string;
}) {
  const db = await requireDb();
  const id = nanoid(18);
  await db.insert(executions).values({
    id,
    tenantId: input.tenantId,
    agentId: input.agentId,
    requestedBy: input.requestedBy,
    workflowId: input.workflowId ?? null,
  });
  return id;
}

export async function completeExecution(input: {
  tenantId: string;
  executionId: string;
  status: "completed" | "failed";
  selectedModel?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostMicros?: number;
  output?: string;
  error?: string;
}) {
  const db = await requireDb();
  await db
    .update(executions)
    .set({ ...input, completedAt: new Date() })
    .where(and(eq(executions.tenantId, input.tenantId), eq(executions.id, input.executionId)));
}

export async function createModelSelection(input: {
  tenantId: string;
  executionId: string;
  modelId: string;
  provider: string;
  compositeScore: number;
  estimatedInputCostMicros: number;
  estimatedOutputCostMicros: number;
}) {
  const db = await requireDb();
  const result = await db.insert(modelSelections).values(input);
  return Number(result[0]?.insertId ?? 0);
}

export async function updateModelSelectionLatency(selectionId: number, observedLatencyMs: number) {
  const db = await requireDb();
  await db.update(modelSelections).set({ observedLatencyMs }).where(eq(modelSelections.id, selectionId));
}

export async function listRecentModelSelections(tenantId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(modelSelections)
    .where(eq(modelSelections.tenantId, tenantId))
    .orderBy(desc(modelSelections.selectedAt))
    .limit(100);
}

export async function appendExecutionTrace(input: {
  tenantId: string;
  executionId: string;
  agentId?: string;
  level?: "info" | "warning" | "error";
  eventType: string;
  message: string;
  metadata?: unknown;
}) {
  const db = await requireDb();
  await db.insert(executionTraces).values({
    id: nanoid(18),
    tenantId: input.tenantId,
    executionId: input.executionId,
    agentId: input.agentId ?? null,
    level: input.level ?? "info",
    eventType: input.eventType,
    message: input.message,
    metadata: input.metadata,
  });
}

export async function getObservabilitySnapshot(tenantId: string) {
  const db = await requireDb();
  const [usage] = await db
    .select({
      totalTokens: sql<number>`coalesce(sum(${executions.totalTokens}), 0)`,
      totalCostMicros: sql<number>`coalesce(sum(${executions.estimatedCostMicros}), 0)`,
      totalExecutions: sql<number>`count(*)`,
    })
    .from(executions)
    .where(eq(executions.tenantId, tenantId));

  const [recentExecutions, selectionHistory, traces] = await Promise.all([
    db.select().from(executions).where(eq(executions.tenantId, tenantId)).orderBy(desc(executions.startedAt)).limit(24),
    db.select().from(modelSelections).where(eq(modelSelections.tenantId, tenantId)).orderBy(desc(modelSelections.selectedAt)).limit(24),
    db.select().from(executionTraces).where(eq(executionTraces.tenantId, tenantId)).orderBy(desc(executionTraces.createdAt)).limit(60),
  ]);

  return {
    usage: {
      totalTokens: Number(usage?.totalTokens ?? 0),
      totalCostMicros: Number(usage?.totalCostMicros ?? 0),
      totalExecutions: Number(usage?.totalExecutions ?? 0),
    },
    recentExecutions,
    selectionHistory,
    traces,
  };
}
