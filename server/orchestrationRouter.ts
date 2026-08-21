import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appendExecutionTrace,
  completeExecution,
  createAgentForTenant,
  createExecution,
  createTenantForUser,
  deleteAgentForTenant,
  deleteWorkflowForTenant,
  ensureDefaultTenantForUser,
  getAgentForTenant,
  getObservabilitySnapshot,
  listAgentsForTenant,
  listWorkflowsForTenant,
  saveWorkflowForTenant,
  updateAgentForTenant,
} from "./orchestrationDb";
import { runRoutedInference } from "./llmRouter";
import { protectedProcedure, router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { getTenantAlertOverview, updateAlertSettings } from "./alertService";
import { acceptPendingInvitationsForUser, inviteCollaborator, listCollaboratorsForTenant, removeCollaborator, updateCollaboratorRole } from "./collaborationService";
import { runSequentialWorkflow } from "./workflowRunService";

const graphNode = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(80).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({ agentId: z.string().min(1).max(40).optional(), label: z.string().max(120).optional() }).passthrough(),
});

const graphSchema = z.object({
  nodes: z.array(graphNode).max(100),
  edges: z.array(z.object({ id: z.string().min(1).max(80), source: z.string().min(1).max(80), target: z.string().min(1).max(80) })).max(200),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const orchestrationRouter = router({
  workspace: router({
    listTenants: protectedProcedure.query(async ({ ctx }) => {
      await acceptPendingInvitationsForUser(ctx.user!);
      return ensureDefaultTenantForUser(ctx.user!);
    }),
    createTenant: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const slug = `${slugify(input.name) || "command"}-${Math.random().toString(36).slice(2, 6)}`;
        return createTenantForUser({ userId: ctx.user!.id, name: input.name, slug });
      }),
  }),

  agents: router({
    list: tenantProcedure.query(({ ctx }) => listAgentsForTenant(ctx.tenant.id)),
    create: tenantAdminProcedure
      .input(z.object({
        name: z.string().min(2).max(120),
        description: z.string().max(1000).optional(),
        systemPrompt: z.string().min(10).max(8000),
        modelPreference: z.string().min(1).max(120).default("auto"),
        configuration: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(({ ctx, input }) => createAgentForTenant({ ...input, tenantId: ctx.tenant.id, createdBy: ctx.user!.id })),
    update: tenantAdminProcedure
      .input(z.object({
        agentId: z.string().min(1).max(40),
        name: z.string().min(2).max(120).optional(),
        description: z.string().max(1000).nullable().optional(),
        systemPrompt: z.string().min(10).max(8000).optional(),
        modelPreference: z.string().min(1).max(120).optional(),
        status: z.enum(["enabled", "disabled"]).optional(),
        configuration: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const agent = await updateAgentForTenant({ ...input, tenantId: ctx.tenant.id });
        if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in this tenant." });
        return agent;
      }),
    delete: tenantAdminProcedure
      .input(z.object({ agentId: z.string().min(1).max(40) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const count = await deleteAgentForTenant(ctx.tenant.id, input.agentId);
          if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in this tenant." });
          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "CONFLICT", message: "An agent with retained execution history can be disabled but not deleted." });
        }
      }),
  }),

  workflows: router({
    list: tenantProcedure.query(({ ctx }) => listWorkflowsForTenant(ctx.tenant.id)),
    save: tenantAdminProcedure
      .input(z.object({ workflowId: z.string().min(1).max(40).optional(), name: z.string().min(2).max(120), graph: graphSchema }))
      .mutation(async ({ ctx, input }) => {
        const agentIds = new Set((await listAgentsForTenant(ctx.tenant.id)).map(agent => agent.id));
        const invalidNode = input.graph.nodes.find(node => node.data.agentId && !agentIds.has(node.data.agentId));
        if (invalidNode) throw new TRPCError({ code: "BAD_REQUEST", message: "Workflow nodes may only reference agents in the active tenant." });
        return saveWorkflowForTenant({ ...input, tenantId: ctx.tenant.id, createdBy: ctx.user!.id });
      }),
    run: tenantProcedure
      .input(z.object({ workflowId: z.string().min(1).max(40), initialInput: z.string().min(1).max(30_000) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await runSequentialWorkflow({ tenantId: ctx.tenant.id, workflowId: input.workflowId, requestedBy: ctx.user!.id, initialInput: input.initialInput });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Sequential workflow execution could not start." });
        }
      }),
    delete: tenantAdminProcedure
      .input(z.object({ workflowId: z.string().min(1).max(40) }))
      .mutation(async ({ ctx, input }) => {
        const count = await deleteWorkflowForTenant(ctx.tenant.id, input.workflowId);
        if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found in this tenant." });
        return { success: true };
      }),
  }),

  collaboration: router({
    list: tenantAdminProcedure.query(({ ctx }) => listCollaboratorsForTenant(ctx.tenant.id)),
    invite: tenantAdminProcedure
      .input(z.object({ email: z.string().email().max(320), role: z.enum(["admin", "user"]).default("user") }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await inviteCollaborator({ ...input, tenantId: ctx.tenant.id, invitedBy: ctx.user!.id });
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Invitation could not be created." });
        }
      }),
    changeRole: tenantAdminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "user"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          await updateCollaboratorRole({ ...input, tenantId: ctx.tenant.id });
          return { success: true };
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Role could not be changed." });
        }
      }),
    remove: tenantAdminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user!.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Use another tenant administrator to remove your own membership." });
        try {
          const removed = await removeCollaborator({ tenantId: ctx.tenant.id, userId: input.userId });
          if (!removed) throw new Error("Collaborator not found in the active tenant.");
          return { success: true };
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Collaborator could not be removed." });
        }
      }),
  }),

  executions: router({
    runAgent: tenantProcedure
      .input(z.object({ agentId: z.string().min(1).max(40), prompt: z.string().min(1).max(30_000), workflowId: z.string().min(1).max(40).optional() }))
      .mutation(async ({ ctx, input }) => {
        const agent = await getAgentForTenant(ctx.tenant.id, input.agentId);
        if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in this tenant." });
        if (agent.status !== "enabled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Enable the agent before running it." });

        const executionId = await createExecution({ tenantId: ctx.tenant.id, agentId: agent.id, requestedBy: ctx.user!.id, workflowId: input.workflowId });
        await appendExecutionTrace({ tenantId: ctx.tenant.id, executionId, agentId: agent.id, eventType: "execution.started", message: "Agent execution entered the routing gateway." });
        try {
          const result = await runRoutedInference({ tenantId: ctx.tenant.id, executionId, prompt: input.prompt, systemPrompt: agent.systemPrompt, preference: agent.modelPreference });
          await completeExecution({ tenantId: ctx.tenant.id, executionId, status: "completed", selectedModel: result.route.modelId, promptTokens: result.promptTokens, completionTokens: result.completionTokens, totalTokens: result.totalTokens, estimatedCostMicros: result.estimatedCostMicros, output: result.output });
          await appendExecutionTrace({ tenantId: ctx.tenant.id, executionId, agentId: agent.id, eventType: "inference.completed", message: `${result.route.provider} completed inference via ${result.route.modelId}.`, metadata: { latencyMs: result.observedLatencyMs, tokens: result.totalTokens } });
          return { executionId, output: result.output, route: result.route, latencyMs: result.observedLatencyMs };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Inference failed unexpectedly.";
          await completeExecution({ tenantId: ctx.tenant.id, executionId, status: "failed", error: message });
          await appendExecutionTrace({ tenantId: ctx.tenant.id, executionId, agentId: agent.id, level: "error", eventType: "inference.failed", message });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The routed LLM inference could not complete." });
        }
      }),
  }),

  observability: router({
    snapshot: tenantProcedure.query(({ ctx }) => getObservabilitySnapshot(ctx.tenant.id)),
    alerts: tenantProcedure.query(({ ctx }) => getTenantAlertOverview(ctx.tenant.id)),
    updateAlerts: tenantAdminProcedure
      .input(z.object({
        maxExecutionCostMicros: z.number().int().min(1).max(50_000_000),
        maxLatencyMs: z.number().int().min(100).max(180_000),
        maxFailures: z.number().int().min(1).max(24),
        enabled: z.boolean(),
      }))
      .mutation(({ ctx, input }) => updateAlertSettings({ ...input, tenantId: ctx.tenant.id })),
  }),
});
