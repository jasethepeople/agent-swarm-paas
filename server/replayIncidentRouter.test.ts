import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrationDb = vi.hoisted(() => ({ consumeTenantQuota: vi.fn(), getTenantScope: vi.fn() }));
const workflows = vi.hoisted(() => ({ listWorkflowRunsForTenant: vi.fn(), replayWorkflowRun: vi.fn(), runSequentialWorkflow: vi.fn() }));
const alerts = vi.hoisted(() => ({ acknowledgeAlertIncident: vi.fn(), getTenantAlertOverview: vi.fn(), updateAlertSettings: vi.fn() }));

vi.mock("./orchestrationDb", async importOriginal => ({ ...(await importOriginal<typeof import("./orchestrationDb")>()), ...orchestrationDb }));
vi.mock("./workflowRunService", () => workflows);
vi.mock("./alertService", () => alerts);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = { id: 88, openId: "operator-88", name: "Operator", email: "operator@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const context = (): TrpcContext => ({ user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe("replay and incident router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    orchestrationDb.consumeTenantQuota.mockResolvedValue({ allowed: true, count: 1, limit: 90, retryAfterMs: 15_000 });
    orchestrationDb.getTenantScope.mockResolvedValue({ tenant: { id: "tenant-alpha" }, membership: { role: "user" } });
  });

  it("replays only a workflow run scoped to the active tenant", async () => {
    workflows.replayWorkflowRun.mockResolvedValue({ workflowRunId: "replay-run", output: "replayed", totalTokens: 13, estimatedCostMicros: 4 });
    const caller = appRouter.createCaller(context());

    const result = await caller.orchestration.workflows.replay({ tenantId: "tenant-alpha", sourceWorkflowRunId: "source-run" });

    expect(result.workflowRunId).toBe("replay-run");
    expect(workflows.replayWorkflowRun).toHaveBeenCalledWith({ tenantId: "tenant-alpha", sourceWorkflowRunId: "source-run", requestedBy: user.id });
  });

  it("acknowledges an open incident only within the active tenant", async () => {
    alerts.acknowledgeAlertIncident.mockResolvedValue(1);
    const caller = appRouter.createCaller(context());

    await expect(caller.orchestration.observability.acknowledgeIncident({ tenantId: "tenant-alpha", incidentId: "incident-1" })).resolves.toEqual({ success: true });
    expect(alerts.acknowledgeAlertIncident).toHaveBeenCalledWith({ tenantId: "tenant-alpha", incidentId: "incident-1", acknowledgedBy: user.id });
  });

  it("rejects replay access before calling services when tenant membership is absent", async () => {
    orchestrationDb.getTenantScope.mockResolvedValue(null);
    const caller = appRouter.createCaller(context());

    await expect(caller.orchestration.workflows.replay({ tenantId: "tenant-bravo", sourceWorkflowRunId: "source-run" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(workflows.replayWorkflowRun).not.toHaveBeenCalled();
  });
});
