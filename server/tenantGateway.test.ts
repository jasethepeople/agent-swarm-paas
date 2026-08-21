import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrationDb = vi.hoisted(() => ({
  consumeTenantQuota: vi.fn(),
  getTenantScope: vi.fn(),
  listAgentsForTenant: vi.fn(),
  saveWorkflowForTenant: vi.fn(),
}));

vi.mock("./orchestrationDb", () => orchestrationDb);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = {
  id: 17,
  openId: "operator-17",
  email: "operator@example.com",
  name: "Operator",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const createContext = (): TrpcContext => ({
  user,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("tenant gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    orchestrationDb.getTenantScope.mockImplementation(async (tenantId: string, userId: number) =>
      tenantId === "tenant-alpha" && userId === user.id
        ? { tenant: { id: tenantId, name: "Alpha" }, membership: { tenantId, userId, role: "user" } }
        : null,
    );
    orchestrationDb.consumeTenantQuota.mockResolvedValue({ allowed: true, count: 1, limit: 90, retryAfterMs: 30_000 });
    orchestrationDb.listAgentsForTenant.mockResolvedValue([{ id: "agent-alpha", tenantId: "tenant-alpha" }]);
  });

  it("returns only the active member tenant's agent data", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.orchestration.agents.list({ tenantId: "tenant-alpha" });

    expect(result).toEqual([{ id: "agent-alpha", tenantId: "tenant-alpha" }]);
    expect(orchestrationDb.getTenantScope).toHaveBeenCalledWith("tenant-alpha", user.id);
    expect(orchestrationDb.listAgentsForTenant).toHaveBeenCalledWith("tenant-alpha");
  });

  it("rejects cross-tenant access before a tenant query reaches the data layer", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.orchestration.agents.list({ tenantId: "tenant-bravo" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(orchestrationDb.listAgentsForTenant).not.toHaveBeenCalled();
  });

  it("enforces the tenant gateway rate limit before a procedure executes", async () => {
    orchestrationDb.consumeTenantQuota.mockResolvedValue({ allowed: false, count: 91, limit: 90, retryAfterMs: 12_000 });
    const caller = appRouter.createCaller(createContext());

    await expect(caller.orchestration.agents.list({ tenantId: "tenant-alpha" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(orchestrationDb.listAgentsForTenant).not.toHaveBeenCalled();
  });

  it("rejects a workflow graph that references an agent outside the active tenant", async () => {
    orchestrationDb.getTenantScope.mockResolvedValue({
      tenant: { id: "tenant-alpha", name: "Alpha" },
      membership: { tenantId: "tenant-alpha", userId: user.id, role: "admin" },
    });
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.orchestration.workflows.save({
        tenantId: "tenant-alpha",
        name: "Cross-tenant attempt",
        graph: {
          nodes: [{ id: "node-1", position: { x: 0, y: 0 }, data: { agentId: "agent-bravo" } }],
          edges: [],
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(orchestrationDb.saveWorkflowForTenant).not.toHaveBeenCalled();
  });
});
