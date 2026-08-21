import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrationDb = vi.hoisted(() => ({ consumeTenantQuota: vi.fn(), getTenantScope: vi.fn() }));
const governance = vi.hoisted(() => ({ addWorkflowRunAnnotation: vi.fn(), listTenantAuditEvents: vi.fn(), listWorkflowRunAnnotations: vi.fn(), writeTenantAuditEvent: vi.fn() }));

vi.mock("./orchestrationDb", async importOriginal => ({ ...(await importOriginal<typeof import("./orchestrationDb")>()), ...orchestrationDb }));
vi.mock("./governanceService", () => governance);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = { id: 61, openId: "governance-user", name: "Governance User", email: "governance@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const context = (): TrpcContext => ({ user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe("tenant governance router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    orchestrationDb.consumeTenantQuota.mockResolvedValue({ allowed: true, count: 1, limit: 90, retryAfterMs: 15_000 });
    orchestrationDb.getTenantScope.mockResolvedValue({ tenant: { id: "tenant-alpha" }, membership: { role: "user" } });
  });

  it("adds a run annotation with the active tenant and authenticated author", async () => {
    governance.addWorkflowRunAnnotation.mockResolvedValue({ id: "annotation-1", workflowRunId: "run-1", body: "Review follow-up." });
    const caller = appRouter.createCaller(context());

    await expect(caller.orchestration.governance.annotations.add({ tenantId: "tenant-alpha", workflowRunId: "run-1", body: "Review follow-up." })).resolves.toMatchObject({ id: "annotation-1" });
    expect(governance.addWorkflowRunAnnotation).toHaveBeenCalledWith({ tenantId: "tenant-alpha", workflowRunId: "run-1", body: "Review follow-up.", createdBy: user.id });
  });

  it("allows audit-ledger access only to tenant administrators", async () => {
    orchestrationDb.getTenantScope.mockResolvedValue({ tenant: { id: "tenant-alpha" }, membership: { role: "admin" } });
    governance.listTenantAuditEvents.mockResolvedValue([{ id: "audit-1", action: "agent.created" }]);
    const caller = appRouter.createCaller(context());

    await expect(caller.orchestration.governance.audit({ tenantId: "tenant-alpha" })).resolves.toEqual([{ id: "audit-1", action: "agent.created" }]);
    expect(governance.listTenantAuditEvents).toHaveBeenCalledWith("tenant-alpha");
  });

  it("does not expose the audit ledger to ordinary tenant members", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.orchestration.governance.audit({ tenantId: "tenant-alpha" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(governance.listTenantAuditEvents).not.toHaveBeenCalled();
  });
});
