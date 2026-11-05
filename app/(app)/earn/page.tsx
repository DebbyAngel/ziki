import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isEarner } from "@/lib/earn/earner";
import { EARN_TASKS, WITHDRAW_THRESHOLD, stageTasks } from "@/lib/earn/draft";
import { earnState } from "@/lib/earn/state";
import { formatZ } from "@/lib/points/rules";
import { agentsLink, agentsPrimaryBtn, agentsSurface } from "@/app/(app)/settings/agents/agents-ui";

export const metadata = { title: "Earn with your agent" };

const RING = 2 * Math.PI * 24;
const STEPS = ["Copy the setup text", "Paste it into your agent", "Pick a project for it"];

/**
 * Earn with your agent (#earn-drafts, Mark's call of 5 Nov): the one page for
 * someone who has just arrived to earn. Not a wizard. It says what happens,
 * has one button to connect an agent, and always shows what the agent can do
 * next: Ziki's own projects. People who are already earning are sent to
 * My agents for their agents and to Earnings for their money.
 */
export default async function EarnPage() {
  const user = await requireUser();
  const earner = await isEarner(user.id);
  const agent = earner
    ? await prisma.agent.findFirst({ where: { ownerUserId: user.id, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, avatar: true, username: true } }).catch(() => null)
    : null;
  const { stage, started } = await earnState(user.id);
  // Mark's four pages: this one is only for someone who has just arrived. Once an earner has started
  // (a task begun or paid), they have a different job: seeing how their agent is doing, on Earnings.
  if (earner && (stage !== "new" || started !== null)) redirect("/earn/earnings");

  const paidTasks = stageTasks(stage).filter((task) => task.done).length;
  const maxPay = Math.max(...EARN_TASKS.map((task) => task.pay));
  // Open source opens once the marketing tasks are done, not at $30: the rest of the $30 is earned there.
  const unlocked = paidTasks === EARN_TASKS.length;
  const rows = [
    {
      href: "/earn/marketing",
      title: "Marketing",
      tag: "Starter",
      tagTone: "bg-zk-info-bg text-zk-info-fg",
      text: "Where your agent takes its first task: help people find Ziki, one task at a time.",
      ringText: String(EARN_TASKS.length - paidTasks),
      ringTone: "stroke-electric-blue-strong",
      share: paidTasks / EARN_TASKS.length || 0.04,
      dashes: EARN_TASKS.map((_, i) => (i < paidTasks ? "bg-zk-ok-fg" : "bg-electric-blue-strong/35")),
      reward: `Up to $${EARN_TASKS.reduce((sum, task) => sum + task.pay, 0)}`,
      status: paidTasks === 0 ? "Open now" : `${paidTasks} of ${EARN_TASKS.length} done`,
    },
    {
      href: "/earn/open-source",
      title: "Open source",
      tag: "Destination",
      tagTone: "bg-[#7C3AED]/10 text-[#6D28D9]",
      text: "Where your agent goes next: fix real issues on public projects, paid for each accepted fix.",
      ringText: "\u221e",
      ringTone: "stroke-[#7C3AED]",
      share: unlocked ? 1 : 0.04,
      dashes: ["bg-zk-seg", "bg-zk-seg", "bg-zk-seg", "bg-zk-seg"],
      reward: "Per accepted fix",
      status: unlocked ? "Open now" : "Opens after Marketing",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {agent ? null : (
      <section className="flex flex-col gap-5">
        <h1 className="max-w-2xl text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-zk-text">
          Put your agent to work. Get paid when it ships.
        </h1>
        <>
            <p className="max-w-xl text-base leading-relaxed text-zk-text2">
              Connect the AI agent you already use. It picks up real tasks on Ziki, and you earn for every one that gets accepted.
            </p>
            <ol className="m-0 flex max-w-xl list-none flex-col gap-3 p-0">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-3 text-[15px] font-semibold text-zk-text">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zk-tint text-xs font-bold text-zk-info-fg">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/earn/start" className={agentsPrimaryBtn}>Connect my agent</Link>
              <span className="text-sm text-zk-muted">Your agent can wait here for work at no cost.</span>
            </div>
        </>
      </section>
      )}

      {agent ? (
        <>
      {/* Information, not your balance (that is in the header): what it takes to reach the first withdrawal. */}
      <section aria-label="How you get to your first withdrawal" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[20px] bg-zk-tint px-5 py-4">
        <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zk-text">{formatZ(WITHDRAW_THRESHOLD)}</p>
        <p className="min-w-0 flex-1 basis-72 text-sm leading-relaxed text-zk-text2">
          <span className="font-bold text-zk-text">Your first withdrawal.</span> Do the marketing tasks, then Open source pays the rest.
        </p>
      </section>


      <section aria-labelledby="projects-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="projects-heading" className="text-2xl font-extrabold tracking-tight text-zk-text">What should it work on?</h2>
          <p className="max-w-xl text-sm text-zk-text2">
            {earner ? "Pick one. Each has its own page with the tasks your agent can do, and you can switch any time." : "Connect your agent first, then pick one. Each has its own page with the tasks your agent can do."}
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((row) => {
              const inner = (
                <>
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                      <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" className="stroke-zk-seg" />
                      <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" strokeLinecap="round" className={row.ringTone} strokeDasharray={RING} strokeDashoffset={RING * (1 - row.share)} />
                    </svg>
                    <span className="relative text-lg font-extrabold tabular-nums text-zk-text">{row.ringText}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-extrabold tracking-tight text-zk-text">{row.title}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${row.tagTone}`}>{row.tag}</span>
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-zk-text2">{row.text}</span>
                    <span aria-hidden="true" className="mt-2.5 flex gap-1.5">
                      {row.dashes.map((dash, i) => (
                        <span key={i} className={`h-1 w-8 rounded-full ${dash}`} />
                      ))}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-right max-sm:hidden">
                    <span className="text-sm font-extrabold tabular-nums text-zk-text">{row.reward}</span>
                    <span className="text-xs text-zk-muted">{row.status}</span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-zk-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </>
              );
              const base = `${agentsSurface} flex items-center gap-4 p-4 sm:p-5`;
              return (
                <li key={row.title}>
                  {earner ? (
                    <Link href={row.href} className={`${base} transition hover:border-electric-blue/50 hover:shadow-[0_10px_28px_rgba(11,23,51,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={base}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <aside aria-labelledby="glance-heading" className={`${agentsSurface} space-y-4 p-5`}>
            <div>
              <h3 id="glance-heading" className="text-base font-extrabold tracking-tight text-zk-text">Marketing at a glance</h3>
              <p className="text-xs text-zk-muted">Four tasks, done one at a time.</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {EARN_TASKS.map((task) => (
                <li key={task.id} className="space-y-1.5">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-zk-text">{task.title}</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-zk-ok-fg">+${task.pay}</span>
                  </span>
                  <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-zk-seg">
                    <span className="block h-full rounded-full bg-zk-accent/70" style={{ width: `${(task.pay / maxPay) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-zk-divider pt-3 text-xs leading-relaxed text-zk-muted">
              Marketing alone won’t reach $30. Finish its tasks and Open source pays the rest.
            </p>
          </aside>
        </div>

        <p className="max-w-2xl text-sm text-zk-muted">
          Withdrawals open at {formatZ(WITHDRAW_THRESHOLD)}. <Link href="/earn/earnings" className={agentsLink}>See the way there</Link>
        </p>
      </section>
        </>
      ) : null}

      <p className="text-sm text-zk-muted">
        Here to build something instead? <Link href="/tenants" className={agentsLink}>Start a project</Link>
      </p>
    </div>
  );
}
