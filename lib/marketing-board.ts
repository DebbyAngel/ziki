import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ideaPath, projectPath, type ProjectRef } from "@/lib/project-paths";
import { workflowFor } from "@/lib/workflow";

/**
 * The Marketing workspace's board (#marketing). Amp's task lifecycle is this
 * site's own pipeline, so the five stages name real states an agent or a person
 * already moves a task through: a report starts as an idea waiting for verdicts,
 * converts into an issue, is claimed and worked, is delivered for judging, and is
 * approved once it merges or goes live. Nothing here writes state of its own, so
 * a task moved anywhere else in Ziki shows up in the right column.
 */
export const MARKETING_STAGES = [
  { key: "proposed", label: "Proposed" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
] as const;

export type MarketingStage = (typeof MARKETING_STAGES)[number]["key"];

/** The board's stages, in pipeline order. */
export const MARKETING_STAGE_KEYS = MARKETING_STAGES.map((stage) => stage.key) as MarketingStage[];

/** The stage a `?stage=` names; the first one when it names nothing we know. */
export function marketingStageFrom(value: unknown): MarketingStage {
  return MARKETING_STAGES.some((stage) => stage.key === value) ? (value as MarketingStage) : "proposed";
}

/** The issue statuses each stage collects. Past approval, merge and live are one column. */
const STAGE_ISSUE_STATUS: Record<Exclude<MarketingStage, "proposed">, Prisma.BugWhereInput["status"]> = {
  open: "open",
  in_progress: "in_progress",
  in_review: "done",
  approved: { in: ["merge", "resolved"] },
};

export type MarketingTaskRow = {
  id: string;
  /** What the row is called, as a key: `#740` for an issue, `Idea #12` for a report. */
  key: string;
  title: string;
  href: string;
  /** The kind of work, named under the points. */
  typeName: string | null;
  /** What it pays in $: the offer on a report still up for a vote, an issue's reward once it is one. */
  points: number | null;
  /** Weighted good verdicts, for a report still up for a vote. */
  goodVotes: number | null;
  /** Weighted bad verdicts, same. */
  badVotes: number | null;
  /** The project's `ideaThreshold`: the good verdicts that open a report for bids. */
  threshold: number | null;
  /** Comments on an issue; a report does not take them. */
  comments: number | null;
  updatedAt: Date;
};

/** How many rows one stage lists. */
const ROW_LIMIT = 40;

/** How many tasks sit in each stage, for the tabs' counts. */
export async function marketingStageCounts(projectId: string): Promise<Record<MarketingStage, number>> {
  const counts = await Promise.all(
    MARKETING_STAGE_KEYS.map((stage) =>
      stage === "proposed"
        ? prisma.idea.count({ where: { projectId, status: "open" } })
        : prisma.bug.count({ where: { projectId, status: STAGE_ISSUE_STATUS[stage] } }),
    ),
  );
  return Object.fromEntries(MARKETING_STAGE_KEYS.map((stage, index) => [stage, counts[index]])) as Record<
    MarketingStage,
    number
  >;
}

/** A report's verdicts, weighted the way a conversion counts them. */
function verdictTotals(verdicts: { opinion: string; votes: number }[]) {
  let good = 0;
  let bad = 0;
  for (const verdict of verdicts) {
    if (verdict.opinion === "good") good += verdict.votes;
    else if (verdict.opinion === "bad") bad += verdict.votes;
  }
  return { good, bad };
}

/** The stage's tasks, most recently touched first. Addresses are built from the project's ref. */
export async function marketingStageRows(
  project: { id: string; ref: ProjectRef },
  stage: MarketingStage,
): Promise<MarketingTaskRow[]> {
  const { ideaThreshold } = await workflowFor(project.id);

  if (stage === "proposed") {
    const ideas = await prisma.idea.findMany({
      where: { projectId: project.id, status: "open" },
      select: {
        id: true,
        number: true,
        title: true,
        points: true,
        updatedAt: true,
        type: { select: { name: true } },
        verdicts: { select: { opinion: true, votes: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: ROW_LIMIT,
    });
    return ideas.map((idea) => {
      const { good, bad } = verdictTotals(idea.verdicts);
      return {
        id: idea.id,
        key: `Idea #${idea.number}`,
        title: idea.title,
        href: ideaPath(project.ref, idea.number),
        typeName: idea.type?.name ?? null,
        points: idea.points,
        goodVotes: good,
        badVotes: bad,
        threshold: ideaThreshold,
        comments: null,
        updatedAt: idea.updatedAt,
      };
    });
  }

  const issues = await prisma.bug.findMany({
    where: { projectId: project.id, status: STAGE_ISSUE_STATUS[stage] },
    select: {
      id: true,
      number: true,
      title: true,
      reward: true,
      updatedAt: true,
      type: { select: { name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: ROW_LIMIT,
  });
  return issues.map((issue) => ({
    id: issue.id,
    key: `#${issue.number}`,
    title: issue.title,
    href: projectPath(project.ref, `/${issue.number}`),
    typeName: issue.type?.name ?? null,
    points: Number(issue.reward),
    goodVotes: null,
    badVotes: null,
    threshold: null,
    comments: issue._count.comments,
    updatedAt: issue.updatedAt,
  }));
}

/** A stage's address on the Marketing workspace. */
export function marketingStageHref(stage: MarketingStage): string {
  return stage === "proposed" ? "/marketing" : `/marketing?stage=${stage}`;
}
