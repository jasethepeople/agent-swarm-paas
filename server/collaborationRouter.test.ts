import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrationDb = vi.hoisted(() => ({ consumeTenantQuota: vi.fn(), getTenantScope: vi.fn() }));
const collaboration = vi.hoisted(() => ({
  acceptPendingInvitationsForUser: vi.fn(),
  inviteCollaborator: vi.fn(),
  listCollaboratorsForTenant: vi.fn(),
  removeCollaborator: vi.fn(),
  updateCollaboratorRole: vi.fn(),
}));
const governance = vi.hoisted(() => ({
  addWorkflowRunAnnotation: vi.fn(),
  listTenantAuditEvents: vi.fn(),
  listWorkflowRunAnnotations: vi.fn(),
  writeTenantAuditEvent: vi.fn(),
}));

vi.mock("./orchestrationDb", async importOriginal => ({ ...(await importOriginal<typeof import("./orchestrationDb")>()), ...orchestrationDb }));
vi.mock("./collaborationService", () => collaboration);
vi.mock("./governanceService", () => governance);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = { id: 42, openId: "member-42", name: "Tenant admin", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const context = (): TrpcContext => ({ user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe("collaboration router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    orchestrationDb.consumeTenantQuota.mockResolvedValue({ allowed: true, count: 1, limit: 90, retryAfterMs: 10_000 });
  });

  it("allows tenant administrators to issue an isolated collaborator invitation", async () => {
    orchestrationDb.getTenantScope.mockResolvedValue({ tenant: { id: "tenant-alpha" }, membership: { role: "admin" } });
    collaboration.inviteCollaborator.mockResolvedValue({ id: "invite-1", email: "new@example.com", role: "user", status: "pending" });
    const caller = appRouter.createCaller(context());

    await caller.orchestration.collaboration.invite({ tenantId: "tenant-alpha", email: "new@example.com", role: "user" });

    expect(collaboration.inviteCollaborator).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-alpha", invitedBy: user.id, email: "new@example.com" }));
  });

  it("blocks ordinary tenant members from accessing collaborator administration", async () => {
    orchestrationDb.getTenantScope.mockResolvedValue({ tenant: { id: "tenant-alpha" }, membership: { role: "user" } });
    const caller = appRouter.createCaller(context());

    await expect(caller.orchestration.collaboration.list({ tenantId: "tenant-alpha" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(collaboration.listCollaboratorsForTenant).not.toHaveBeenCalled();
  });
});
