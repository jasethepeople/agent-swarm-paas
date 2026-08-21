import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { executions, workflowRuns, workflowRunTraces } from "../drizzle/schema";
import { getDb } from "./db";
import { runRoutedInference } from "./llmRouter";
import { getAgentForTenant, getWorkflowForTenant } from "./orchestrationDb";

type GraphNode = { id: string; data: { agentId?: string }; position?: { x: number; y: number } };
type GraphEdge = { id: string; source: string; target: string };
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
};

export function planSequentialWorkflow(graph: unknown): GraphNode[] {
  const safeGraph = graph as Partial<Graph>;
  const nodes = Array.isArray(safeGraph.nodes) ? safeGraph.nodes : [];
  const edges = Array.isArray(safeGraph.edges) ? safeGraph.edges : [];
  if (nodes.length === 0) throw new Error("A workflow must contain at least one agent node.");
  if (nodes.length > 8) throw new Error("Sequential workflow runs are limited to eight nodes per request.");

  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || nodes.some(node => !node.id || !node.data?.agentId)) {
    throw new Error("Every workflow node must have a unique identifier and a tenant agent.");
  }
  if (edges.some(edge => !byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target)) {
    throw new Error("Every workflow edge must connect two different workflow nodes.");
  }

  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  const ordered: GraphNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    for (const next of outgoing.get(id) ?? []) {
      const count = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, count);
      if (count === 0) queue.push(next);
    }
  }
  if (ordered.length !== nodes.length) throw new Error("Workflow graphs cannot contain cycles.");
  return ordered;
}

export async function runSequentialWorkflow(input: {
  tenantId: string;
  workflowId: string;
  requestedBy: number;
  initialInput: string;
  replayOfRunId?: string;
}) {
  const db = await requireDb();
  const workflow = await getWorkflowForTenant(input.tenantId, input.workflowId);
  if (!workflow) throw new Error("Workflow not found in the active tenant.");
  const graph = workflow.graph as Graph;
  const plan = planSequentialWorkflow(graph);
  const incoming = new Map(plan.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges ?? []) incoming.get(edge.target)?.push(edge.source);

  const workflowRunId = nanoid(18);
  await db.insert(workflowRuns).values({
    id: workflowRunId,
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    replayOfRunId: input.replayOfRunId ?? null,
    requestedBy: input.requestedBy,
    initialInput: input.initialInput,
  });
  await appendRunTrace({
    tenantId: input.tenantId,
    workflowRunId,
    eventType: "workflow.started",
    message: input.replayOfRunId
      ? `Replay opened from run ${input.replayOfRunId} with ${plan.length} connected agent nodes.`
      : `Sequential run opened with ${plan.length} connected agent nodes.`,
  });

  const outputByNode = new Map<string, string>();
  let totalTokens = 0;
  let estimatedCostMicros = 0;
  let finalOutput = input.initialInput;

  try {
    for (const node of plan) {
      const agent = await getAgentForTenant(input.tenantId, node.data.agentId!);
      if (!agent || agent.status !== "enabled") throw new Error(`Node ${node.id} references an unavailable enabled agent.`);
      const upstream = incoming.get(node.id) ?? [];
      const agentInput = upstream.length
        ? upstream.map(source => outputByNode.get(source)).filter(Boolean).join("\n\n--- UPSTREAM HANDOFF ---\n\n")
        : input.initialInput;
      const executionId = nanoid(18);
      await db.insert(executions).values({
        id: executionId,
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        workflowRunId,
        agentId: agent.id,
        requestedBy: input.requestedBy,
      });
      await appendRunTrace({ tenantId: input.tenantId, workflowRunId, executionId, nodeId: node.id, agentId: agent.id, eventType: "node.started", message: `${agent.name} received ${upstream.length ? "upstream handoff data" : "the initial input"}.` });

      const result = await runRoutedInference({
        tenantId: input.tenantId,
        executionId,
        prompt: agentInput,
        systemPrompt: agent.systemPrompt,
        preference: agent.modelPreference,
      });
      await db
        .update(executions)
        .set({
          status: "completed",
          selectedModel: result.route.modelId,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          estimatedCostMicros: result.estimatedCostMicros,
          output: result.output,
          completedAt: new Date(),
        })
        .where(and(eq(executions.tenantId, input.tenantId), eq(executions.id, executionId)));
      await appendRunTrace({
        tenantId: input.tenantId,
        workflowRunId,
        executionId,
        nodeId: node.id,
        agentId: agent.id,
        eventType: "node.completed",
        message: `${agent.name} handed its output to downstream nodes.`,
        metadata: { model: result.route.modelId, latencyMs: result.observedLatencyMs, tokens: result.totalTokens },
      });
      outputByNode.set(node.id, result.output);
      finalOutput = result.output;
      totalTokens += result.totalTokens;
      estimatedCostMicros += result.estimatedCostMicros;
    }
    await db
      .update(workflowRuns)
      .set({ status: "completed", finalOutput, totalTokens, estimatedCostMicros, completedAt: new Date() })
      .where(and(eq(workflowRuns.tenantId, input.tenantId), eq(workflowRuns.id, workflowRunId)));
    await appendRunTrace({ tenantId: input.tenantId, workflowRunId, eventType: "workflow.completed", message: "All connected nodes completed their sequential handoffs.", metadata: { totalTokens, estimatedCostMicros } });
    return { workflowRunId, output: finalOutput, totalTokens, estimatedCostMicros };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sequential workflow run failed.";
    await db
      .update(workflowRuns)
      .set({ status: "failed", finalOutput, totalTokens, estimatedCostMicros, completedAt: new Date() })
      .where(and(eq(workflowRuns.tenantId, input.tenantId), eq(workflowRuns.id, workflowRunId)));
    await appendRunTrace({ tenantId: input.tenantId, workflowRunId, level: "error", eventType: "workflow.failed", message });
    throw error;
  }
}

export async function replayWorkflowRun(input: { tenantId: string; sourceWorkflowRunId: string; requestedBy: number }) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.tenantId, input.tenantId), eq(workflowRuns.id, input.sourceWorkflowRunId)))
    .limit(1);
  const source = rows[0];
  if (!source) throw new Error("The source workflow run is not available in the active tenant.");
  return runSequentialWorkflow({
    tenantId: input.tenantId,
    workflowId: source.workflowId,
    requestedBy: input.requestedBy,
    initialInput: source.initialInput,
    replayOfRunId: source.id,
  });
}

export async function listWorkflowRunsForTenant(tenantId: string) {
  const db = await requireDb();
  return db.select().from(workflowRuns).where(eq(workflowRuns.tenantId, tenantId)).orderBy(workflowRuns.startedAt).limit(40);
}

async function appendRunTrace(input: {
  tenantId: string;
  workflowRunId: string;
  executionId?: string;
  nodeId?: string;
  agentId?: string;
  level?: "info" | "warning" | "error";
  eventType: string;
  message: string;
  metadata?: unknown;
}) {
  const db = await requireDb();
  await db.insert(workflowRunTraces).values({
    id: nanoid(18),
    tenantId: input.tenantId,
    workflowRunId: input.workflowRunId,
    executionId: input.executionId ?? null,
    nodeId: input.nodeId ?? null,
    agentId: input.agentId ?? null,
    level: input.level ?? "info",
    eventType: input.eventType,
    message: input.message,
    metadata: input.metadata,
  });
}
