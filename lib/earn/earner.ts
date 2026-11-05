import { prisma } from "@/lib/prisma";
import { EARN_WORKSPACE_SLUG } from "@/lib/earn/draft";

/** The Earn workspace (#earn-drafts): where people who came to earn work, and where their agents live. */
export async function earnWorkspace() {
  return prisma.tenant.findUnique({ where: { slug: EARN_WORKSPACE_SLUG }, select: { id: true, name: true } });
}

/** Whether someone is an earner: a member of the Earn workspace. Builders elsewhere don't see Earn. */
export async function isEarner(userId: string): Promise<boolean> {
  const workspace = await earnWorkspace().catch(() => null);
  if (!workspace) return false;
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: workspace.id, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

/** Joins someone to the Earn workspace as a member (once). */
export async function joinEarnWorkspace(userId: string): Promise<boolean> {
  const workspace = await earnWorkspace();
  if (!workspace) return false;
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: workspace.id, userId } },
    create: { tenantId: workspace.id, userId, role: "member" },
    update: {},
  });
  return true;
}
