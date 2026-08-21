import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { alertIncidents, alertSettings, executions, modelSelections } from "../drizzle/schema";
import { getDb } from "./db";

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
};

export type AlertSignal = {
  type: "cost" | "latency" | "failure";
  executionId: string | null;
  message: string;
  value: number;
};

export type AlertIncidentView = AlertSignal & {
  id: string;
  status: "open" | "acknowledged";
  fingerprint: string;
  acknowledgedAt: Date | null;
  acknowledgedBy: number | null;
  createdAt: Date;
};

export function evaluateAlerts(input: {
  settings: { enabled: boolean; maxExecutionCostMicros: number; maxLatencyMs: number; maxFailures: number };
  executions: Array<{ id: string; estimatedCostMicros: number; status: "running" | "completed" | "failed" }>;
  selections: Array<{ executionId: string; observedLatencyMs: number | null }>;
}): AlertSignal[] {
  if (!input.settings.enabled) return [];
  const failures = input.executions.filter(execution => execution.status === "failed");
  return [
    ...input.executions
      .filter(execution => execution.estimatedCostMicros >= input.settings.maxExecutionCostMicros)
      .map(execution => ({ type: "cost" as const, executionId: execution.id, value: execution.estimatedCostMicros, message: `Cost threshold breached: execution exceeded ${(input.settings.maxExecutionCostMicros / 1_000_000).toFixed(4)} USD.` })),
    ...input.selections
      .filter(selection => (selection.observedLatencyMs ?? 0) >= input.settings.maxLatencyMs)
      .map(selection => ({ type: "latency" as const, executionId: selection.executionId, value: selection.observedLatencyMs ?? 0, message: `Latency threshold breached: inference exceeded ${input.settings.maxLatencyMs} ms.` })),
    ...(failures.length >= input.settings.maxFailures
      ? [{ type: "failure" as const, executionId: null, value: failures.length, message: `Failure threshold breached: ${failures.length} recent executions failed.` }]
      : []),
  ];
}

export async function getAlertSettings(tenantId: string) {
  const db = await requireDb();
  const current = await db.select().from(alertSettings).where(eq(alertSettings.tenantId, tenantId)).limit(1);
  if (current[0]) return current[0];
  await db.insert(alertSettings).values({ tenantId });
  const created = await db.select().from(alertSettings).where(eq(alertSettings.tenantId, tenantId)).limit(1);
  return created[0]!;
}

export async function updateAlertSettings(input: {
  tenantId: string;
  maxExecutionCostMicros: number;
  maxLatencyMs: number;
  maxFailures: number;
  enabled: boolean;
}) {
  const db = await requireDb();
  await db
    .insert(alertSettings)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        maxExecutionCostMicros: input.maxExecutionCostMicros,
        maxLatencyMs: input.maxLatencyMs,
        maxFailures: input.maxFailures,
        enabled: input.enabled,
        updatedAt: new Date(),
      },
    });
  return getAlertSettings(input.tenantId);
}

export async function getTenantAlertOverview(tenantId: string) {
  const db = await requireDb();
  const [settings, recentExecutions, recentSelections] = await Promise.all([
    getAlertSettings(tenantId),
    db.select().from(executions).where(eq(executions.tenantId, tenantId)).orderBy(desc(executions.startedAt)).limit(24),
    db.select().from(modelSelections).where(eq(modelSelections.tenantId, tenantId)).orderBy(desc(modelSelections.selectedAt)).limit(24),
  ]);
  const alerts = evaluateAlerts({ settings, executions: recentExecutions, selections: recentSelections });
  await syncAlertIncidents(tenantId, alerts, settings.maxExecutionCostMicros, settings.maxLatencyMs);
  const incidents = await listAlertIncidents(tenantId);
  return { settings, alerts, incidents };
}

function incidentFingerprint(signal: AlertSignal) {
  if (signal.executionId) return `${signal.type}:${signal.executionId}`;
  return `failure:${new Date().toISOString().slice(0, 13)}`;
}

async function syncAlertIncidents(
  tenantId: string,
  alerts: AlertSignal[],
  maxExecutionCostMicros: number,
  maxLatencyMs: number,
) {
  const db = await requireDb();
  for (const alert of alerts) {
    const thresholdValue = alert.type === "cost" ? maxExecutionCostMicros : alert.type === "latency" ? maxLatencyMs : alert.value;
    await db
      .insert(alertIncidents)
      .values({
        id: nanoid(18),
        tenantId,
        fingerprint: incidentFingerprint(alert),
        alertType: alert.type,
        executionId: alert.executionId,
        message: alert.message,
        observedValue: alert.value,
        thresholdValue,
      })
      .onDuplicateKeyUpdate({ set: { message: alert.message, observedValue: alert.value, thresholdValue, updatedAt: new Date() } });
  }
}

export async function listAlertIncidents(tenantId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(alertIncidents)
    .where(eq(alertIncidents.tenantId, tenantId))
    .orderBy(desc(alertIncidents.createdAt))
    .limit(80);
}

export async function acknowledgeAlertIncident(input: { tenantId: string; incidentId: string; acknowledgedBy: number }) {
  const db = await requireDb();
  const result = await db
    .update(alertIncidents)
    .set({ status: "acknowledged", acknowledgedBy: input.acknowledgedBy, acknowledgedAt: new Date() })
    .where(and(eq(alertIncidents.tenantId, input.tenantId), eq(alertIncidents.id, input.incidentId), eq(alertIncidents.status, "open")));
  return result[0]?.affectedRows ?? 0;
}
