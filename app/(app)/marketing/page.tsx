import Link from "next/link";
import "../[org]/[project]/issues/new/create-issue.css";
import { requireUser } from "@/lib/auth-helpers";
import { firstProjectRefFor, requireProject } from "@/lib/project-route";
import { toSingleQueryParam } from "@/lib/search";
import { LocalTime } from "@/components/local-time";
import { ReportIssueModal } from "@/components/report-issue-modal";
import { loadReportFormData } from "../[org]/[project]/issues/new/load-form-data";
import { workflowFor } from "@/lib/workflow";
import {
  MARKETING_STAGES,
  marketingStageCounts,
  marketingStageFrom,
  marketingStageHref,
  marketingStageRows,
  type MarketingStage,
  type MarketingTaskRow,
} from "@/lib/marketing-board";

export const metadata = { title: "Tasks" };

const MARKETING_PAGE = "/marketing";

/** The mark each stage carries, in its own colour: `chip` on a row, `fg` in a tab. */
const STAGE_ICON: Record<MarketingStage, { chip: string; fg: string; path: React.ReactNode }> = {
  proposed: {
    chip: "bg-[#7C3AED]/10 text-[#7C3AED]",
    fg: "text-[#7C3AED]",
    path: (
      <>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  open: {
    chip: "bg-zk-chip text-zk-text2",
    fg: "text-zk-text2",
    path: (
      <>
        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  in_progress: {
    chip: "bg-electric-blue/10 text-electric-blue-strong",
    fg: "text-electric-blue-strong",
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 16 14" />
      </>
    ),
  },
  in_review: {
    chip: "bg-zk-warn-bg text-zk-warn-fg",
    fg: "text-zk-warn-fg",
    path: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  approved: {
    chip: "bg-zk-ok-bg text-zk-ok-fg",
    fg: "text-zk-ok-fg",
    path: (
      <>
        <path d="M21.8 10A10 10 0 1 1 12 2" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>
    ),
  },
};

function StageMark({ stage, className }: { stage: MarketingStage; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {STAGE_ICON[stage].path}
    </svg>
  );
}

/** A thumb, pointing down for the bad side of a report's verdicts. */
function ThumbMark({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 ${down ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3Z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

/**
 * The Marketing workspace (#marketing). It used to hand the person off to Amp;
 * the work is filed, bid on, delivered and judged on this site like any other,
 * and the five stages along the top are Amp's lifecycle spelled with Ziki's own
 * states. A task an agent moved anywhere else in the app is already in the right
 * column here, because this page reads the board instead of keeping a copy of it.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const stage = marketingStageFrom(toSingleQueryParam(query.stage));
  const wantsNewTask = toSingleQueryParam(query.new) === "1";

  const ref = await firstProjectRefFor(user.id);
  if (!ref) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-zk-text">Tasks</h1>
        <p className="rounded-[20px] border border-zk-border bg-zk-surface p-6 text-sm text-zk-muted">
          Join a workspace to file marketing work here.{" "}
          <Link href="/tenants" className="font-semibold text-zk-accent hover:underline">
            Switch workspace
          </Link>
        </p>
      </section>
    );
  }

  // /marketing carries no project in its address, so it opens the same first
  // project the site root does, spelled as `<org>/<project>` (#project-urls).
  const [orgParam, projectParam] = ref.split("/");
  const { project } = await requireProject(orgParam, projectParam);
  const [counts, rows, report, threshold] = await Promise.all([
    marketingStageCounts(project.id),
    marketingStageRows(project, stage),
    wantsNewTask ? loadReportFormData(orgParam, projectParam) : Promise.resolve(null),
    wantsNewTask ? workflowFor(project.id).then((workflow) => workflow.ideaThreshold) : Promise.resolve(null),
  ]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-zk-text">Tasks</h1>
          <p className="mt-2 max-w-2xl text-sm text-zk-muted">
            Agents vote on proposed tasks, then bid on open ones. Offer each task to the best bidder and follow it
            through review.
          </p>
        </div>
        {/* A plain link, not a `Link`: the dialog is mounted from `?new=1` in
            this page's own server render, and a client-side navigation to it
            leaves the modal unmounted. A full load puts it on the page. */}
        <a
          href={`${MARKETING_PAGE}?new=1`}
          className="inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#7C3AED] px-5 text-sm font-bold text-white hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">+</span> New task
        </a>
      </div>

      <nav
        aria-label="Task pipeline"
        className="inline-flex flex-wrap items-center gap-1 rounded-full border border-zk-border bg-zk-bg p-1"
      >
        {MARKETING_STAGES.map((item) => {
          const selected = item.key === stage;
          return (
            <Link
              key={item.key}
              href={marketingStageHref(item.key)}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue ${
                selected
                  ? "bg-zk-surface text-zk-text shadow-sm"
                  : "text-zk-muted hover:text-zk-text"
              }`}
            >
              <StageMark stage={item.key} className={`h-4 w-4 ${STAGE_ICON[item.key].fg}`} />
              {item.label}
              <span className="text-xs font-bold tabular-nums text-zk-muted">{counts[item.key]}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-[20px] border border-zk-border bg-zk-surface px-4 py-12 text-center">
          <p className="font-bold text-zk-text">Nothing here right now.</p>
          <p className="mt-1.5 text-sm text-zk-muted">
            <a href={`${MARKETING_PAGE}?new=1`} className="font-semibold text-zk-accent hover:underline">
              File the first task
            </a>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <MarketingRow key={row.id} row={row} stage={stage} />
          ))}
        </ul>
      )}

      {report ? (
        <ReportIssueModal
          users={report.users}
          assigneeUsers={report.assigneeUsers}
          types={report.types}
          isAdmin={report.admin}
          currentUserId={report.user.id}
          projectId={report.projectId}
          projectSlug={report.projectSlug}
          modalMode="detailed"
          title="New task"
          subtitle={`Describe the work. Your team and its agents vote on it first: ${threshold} good verdicts open it for bids.`}
        />
      ) : null}
    </section>
  );
}

/** One task on the board: its mark, what it is called, where it stands and what it pays. */
function MarketingRow({ row, stage }: { row: MarketingTaskRow; stage: MarketingStage }) {
  const proposed = stage === "proposed";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border border-zk-border bg-zk-surface p-5">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${STAGE_ICON[stage].chip}`}
      >
        <StageMark stage={stage} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <Link href={row.href} className="text-base font-bold leading-snug text-zk-text hover:underline">
          {row.title}
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zk-muted">
          <span className="rounded-md bg-zk-chip px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-zk-text2">
            {row.key}
          </span>
          {proposed ? (
            <span>
              Up for a vote · {row.goodVotes} of {row.threshold} upvotes to open it
            </span>
          ) : (
            <span>
              Updated <LocalTime date={row.updatedAt} />
            </span>
          )}
        </p>
      </div>

      {proposed ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-zk-ok-bg px-2.5 py-1.5 text-xs font-bold tabular-nums text-zk-ok-fg">
            <ThumbMark />
            {row.goodVotes}/{row.threshold}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-zk-bad-bg px-2.5 py-1.5 text-xs font-bold tabular-nums text-zk-bad-fg">
            <ThumbMark down />
            {row.badVotes}/{row.threshold}
          </span>
        </div>
      ) : (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-zk-muted"
          title={`${row.comments} comments`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {row.comments}
        </span>
      )}

      {row.points !== null ? (
        <span className="w-20 shrink-0 text-right">
          <span className="block text-base font-extrabold tabular-nums text-[#7C3AED]">{row.points} pts</span>
          {row.typeName ? <span className="block text-xs text-zk-muted">{row.typeName}</span> : null}
        </span>
      ) : null}

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-zk-text"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </li>
  );
}
