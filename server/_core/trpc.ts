import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { TrpcContext } from "./context";
import { consumeTenantQuota, getTenantScope } from "../orchestrationDb";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const tenantInput = z.object({ tenantId: z.string().min(1).max(40) }).passthrough();

const requireTenantAccess = t.middleware(async ({ ctx, input, next }) => {
  const tenantId = (input as { tenantId?: unknown }).tenantId;
  if (!ctx.user || typeof tenantId !== "string") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A tenant identifier is required." });
  }

  const scope = await getTenantScope(tenantId, ctx.user.id);
  if (!scope) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this tenant." });
  }

  const quota = await consumeTenantQuota(tenantId);
  if (!quota.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Tenant gateway limit reached. Retry in ${Math.ceil(quota.retryAfterMs / 1000)} seconds.`,
    });
  }

  return next({
    ctx: { ...ctx, tenant: scope.tenant, tenantMembership: scope.membership },
  });
});

export const tenantProcedure = protectedProcedure.input(tenantInput).use(requireTenantAccess);

export const tenantAdminProcedure = tenantProcedure.use(({ ctx, next }) => {
  if (ctx.tenantMembership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant admin access is required." });
  }
  return next({ ctx });
});

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
