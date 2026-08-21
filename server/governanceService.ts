import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tenantAuditEvents, workflowRunAnnotations, workflowRuns } from "../drizzle/schema";
import { getDb } from "./db";

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
};

export async function writeTenantAuditEvent(input: {
  tenantId: string;
  actorId?: number;
  action: string;
  subjectType: string;
  subjectId?: string;
  summary: string;
  metadata?: unknown;
}) {
  const db = await requireDb();
  await db.insert(tenantAuditEvents).values({
    id: nanoid(18),
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    summary: input.summary,
    metadata: input.metadata,
  });
}

export async function listTenantAuditEvents(tenantId: string) {
  const db = await requireDb();
  return db.select().from(tenantAuditEvents).where(eq(tenantAuditEvents.tenantId, tenantId)).orderBy(desc(tenantAuditEvents.createdAt)).limit(120);
}

export async function addWorkflowRunAnnotation(input: { tenantId: string; workflowRunId: string; createdBy: number; body: string }) {
  const db = await requireDb();
  const run = (await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.tenantId, input.tenantId), eq(workflowRuns.id, input.workflowRunId)))
    .limit(1))[0];
  if (!run) throw new Error("Workflow run not found in the active tenant.");
  if (run.status === "running") throw new Error("Annotations may be added after a workflow run completes or fails.");

  const id = nanoid(18);
  await db.insert(workflowRunAnnotations).values({ id, ...input });
  await writeTenantAuditEvent({
    tenantId: input.tenantId,
    actorId: input.createdBy,
    action: "workflow_run.annotated",
    subjectType: "workflow_run",
    subjectId: input.workflowRunId,
    summary: "Added an operational annotation to a workflow run.",
  });
  return (await db.select().from(workflowRunAnnotations).where(eq(workflowRunAnnotations.id, id)).limit(1))[0]!;
}

export async function listWorkflowRunAnnotations(tenantId: string, workflowRunId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(workflowRunAnnotations)
    .where(and(eq(workflowRunAnnotations.tenantId, tenantId), eq(workflowRunAnnotations.workflowRunId, workflowRunId)))
    .orderBy(desc(workflowRunAnnotations.createdAt));
}
