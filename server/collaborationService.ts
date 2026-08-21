import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tenantInvitations, tenantMemberships, users } from "../drizzle/schema";
import { getDb } from "./db";

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
};

export async function acceptPendingInvitationsForUser(user: { id: number; email: string | null }) {
  if (!user.email) return;
  const db = await requireDb();
  const pending = await db
    .select()
    .from(tenantInvitations)
    .where(and(eq(tenantInvitations.email, user.email.trim().toLowerCase()), eq(tenantInvitations.status, "pending")));

  for (const invitation of pending) {
    await db.transaction(async tx => {
      await tx
        .insert(tenantMemberships)
        .values({ tenantId: invitation.tenantId, userId: user.id, role: invitation.role })
        .onDuplicateKeyUpdate({ set: { role: invitation.role } });
      await tx
        .update(tenantInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(tenantInvitations.id, invitation.id));
    });
  }
}

export async function listCollaboratorsForTenant(tenantId: string) {
  const db = await requireDb();
  const [members, invitations] = await Promise.all([
    db
      .select({
        membershipId: tenantMemberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: tenantMemberships.role,
        createdAt: tenantMemberships.createdAt,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(tenantMemberships.userId, users.id))
      .where(eq(tenantMemberships.tenantId, tenantId))
      .orderBy(desc(tenantMemberships.createdAt)),
    db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tenantId, tenantId))
      .orderBy(desc(tenantInvitations.createdAt)),
  ]);
  return { members, invitations };
}

export async function inviteCollaborator(input: {
  tenantId: string;
  invitedBy: number;
  email: string;
  role: "admin" | "user";
}) {
  const db = await requireDb();
  const email = input.email.trim().toLowerCase();
  const existingUser = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (existingUser) {
    const existingMembership = await db
      .select()
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.userId, existingUser.id)))
      .limit(1);
    if (existingMembership[0]) throw new Error("This user is already a member of the active tenant.");
  }

  const id = nanoid(18);
  await db
    .insert(tenantInvitations)
    .values({ id, tenantId: input.tenantId, email, role: input.role, invitedBy: input.invitedBy })
    .onDuplicateKeyUpdate({ set: { role: input.role, status: "pending", invitedBy: input.invitedBy, createdAt: new Date(), acceptedAt: null } });
  return { id, email, role: input.role, status: "pending" as const };
}

export async function updateCollaboratorRole(input: { tenantId: string; userId: number; role: "admin" | "user" }) {
  const db = await requireDb();
  const target = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.userId, input.userId)))
    .limit(1);
  if (!target[0]) throw new Error("Collaborator not found in the active tenant.");

  if (target[0].role === "admin" && input.role === "user") {
    const admins = await db
      .select({ count: sql<number>`count(*)` })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.role, "admin")));
    if (Number(admins[0]?.count ?? 0) <= 1) throw new Error("A tenant must retain at least one administrator.");
  }

  await db
    .update(tenantMemberships)
    .set({ role: input.role })
    .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.userId, input.userId)));
}

export async function removeCollaborator(input: { tenantId: string; userId: number }) {
  const db = await requireDb();
  const target = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.userId, input.userId)))
    .limit(1);
  if (!target[0]) return 0;

  if (target[0].role === "admin") {
    const admins = await db
      .select({ count: sql<number>`count(*)` })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.role, "admin")));
    if (Number(admins[0]?.count ?? 0) <= 1) throw new Error("A tenant must retain at least one administrator.");
  }

  const result = await db
    .delete(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.userId, input.userId)));
  return result[0]?.affectedRows ?? 0;
}
