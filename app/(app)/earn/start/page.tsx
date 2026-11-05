import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { joinEarnWorkspace } from "@/lib/earn/earner";

/**
 * Connect your agent (#earn-drafts): where "Connect your agent" goes. A new
 * visitor has just signed up; someone who signed up before arrives signed in.
 * Either way they join the Earn workspace and go straight to connecting their
 * agent. If they already have one connected, they go on to choose what it works on.
 */
export default async function EarnStartPage() {
  const user = await requireUser();
  await joinEarnWorkspace(user.id);
  const connected = await prisma.agent.findFirst({ where: { ownerUserId: user.id, revokedAt: null }, select: { id: true } }).catch(() => null);
  redirect(connected ? "/earn" : "/settings/connect?from=earn");
}
