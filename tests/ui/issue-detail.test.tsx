// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The issue page's stage panels: bids with their votes and the Award control only where it may be used, confirmations and their banner, and judgements and merge reviews with their replies. */
const mocks = vi.hoisted(() => ({ addComment: vi.fn() }));
vi.mock("@/app/actions/issues", () => ({ addCommentAction: mocks.addComment }));
vi.mock("@/app/actions/issue-bids", () => ({ awardIssueBidAction: vi.fn() }));
vi.mock("@/app/actions/confirmations", () => ({ giveConfirmationAction: vi.fn() }));
const decisionActions = vi.hoisted(() => ({ respond: vi.fn(async () => ({ ok: true as const })), agree: vi.fn(async () => ({ ok: true as const })) }));
vi.mock("@/app/actions/your-decision", () => ({ respondToCloseAction: decisionActions.respond, agreeWithCloseAction: decisionActions.agree }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/demo/1", useSearchParams: () => new URLSearchParams() }));

import { MergeReviewsPanel, TestVerdictsPanel, type MergeReviewView, type TestVerdictView } from "@/components/issue-review-entries";
import { IssueBidsPanel, type BidEntryView } from "@/components/issue-bids";
import { IssueConfirmationsPanel, type ConfirmationEntryView, type ConfirmationsData } from "@/components/issue-confirmations";
import { DecisionCard } from "@/components/decision-card";
import { decisionFor, type DecisionIssue, type DecisionSuggestion } from "@/lib/your-decision";

const PR = "https://github.com/emerjent/ziki/pull/42";

const verdict: TestVerdictView = {
  id: "tv1",
  agentName: "Bob's Claude",
  by: "Bob",
  goodToMerge: false,
  summary: "Not good to merge: Save still fails.",
  description: "Clicked Save twice on the PR head in Safari; the second click does nothing.",
  pullRequestUrl: PR,
  headSha: "abc1234def",
  current: true,
  updatedAt: new Date("2026-10-29T10:00:00Z"),
  replies: [{ id: "r1", body: "Which Safari version?", authorName: "Ada", agentName: null, createdAt: new Date("2026-10-29T11:00:00Z") }],
};

const review: MergeReviewView = {
  id: "mr1",
  agentName: "Dana's Claude",
  by: "Dana",
  verdict: "accept",
  summary: "Accept: small and tested.",
  description: "Two independent testers verified the head commit.",
  pullRequestUrl: PR,
  headSha: "0123456789",
  current: false,
  updatedAt: new Date("2026-10-29T12:00:00Z"),
  replies: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("TestVerdictsPanel (#review-entries)", () => {
  it("shows each verdict's chip, agent, owner, summary, description, pull request and replies", () => {
    render(<TestVerdictsPanel bugId="bug1" verdicts={[verdict]} canReply />);
    expect(screen.getByRole("heading", { name: /Judgements/ })).toBeInTheDocument();
    expect(screen.getByText("Not good to merge")).toBeInTheDocument();
    expect(screen.getByText("Bob's Claude")).toBeInTheDocument();
    expect(screen.getByText("for Bob")).toBeInTheDocument();
    expect(screen.getByText(verdict.summary)).toBeInTheDocument();
    expect(screen.getByText(verdict.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PR #42" })).toHaveAttribute("href", PR);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.getByText("Which Safari version?")).toBeInTheDocument();
    expect(screen.queryByText("Earlier code")).toBeNull();
  });

  it("replies to a verdict with a plain comment naming it", async () => {
    mocks.addComment.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<TestVerdictsPanel bugId="bug1" verdicts={[verdict]} canReply />);
    await user.click(screen.getByRole("button", { name: "Reply" }));
    const form = screen.getByRole("form", { name: "Reply to this judgement" });
    await user.type(form.querySelector("textarea")!, "Safari 18.");
    await user.click(screen.getAllByRole("button", { name: "Reply" }).at(-1)!);
    await waitFor(() => expect(mocks.addComment).toHaveBeenCalledTimes(1));
    const [bugId, data] = mocks.addComment.mock.calls[0] as [string, FormData];
    expect(bugId).toBe("bug1");
    expect(data.get("testVerdictId")).toBe("tv1");
    expect(data.get("body")).toBe("Safari 18.");
    expect(data.get("type")).toBeNull();
  });
});

describe("MergeReviewsPanel (#review-entries)", () => {
  it("shows the manager's accept, marks a review of earlier code, and replies by mergeReviewId", async () => {
    mocks.addComment.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MergeReviewsPanel bugId="bug1" reviews={[review]} canReply />);
    expect(screen.getByRole("heading", { name: /Merge reviews/ })).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Dana's Claude")).toBeInTheDocument();
    expect(screen.getByText("Earlier code")).toBeInTheDocument();
    expect(screen.getByText(review.summary)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    const form = screen.getByRole("form", { name: "Reply to this merge review" });
    await user.type(form.querySelector("textarea")!, "Thanks.");
    await user.click(screen.getAllByRole("button", { name: "Reply" }).at(-1)!);
    await waitFor(() => expect(mocks.addComment).toHaveBeenCalledTimes(1));
    expect((mocks.addComment.mock.calls[0][1] as FormData).get("mergeReviewId")).toBe("mr1");
  });
});

const bid: BidEntryView = {
  id: "bid1",
  agentName: "Ada's Claude",
  by: "Ada",
  summary: "I can fix the login redirect today.",
  description: "The session cookie is dropped on redirect. I will keep it and add a test.",
  areaMatch: true,
  updatedAt: new Date("2026-10-29T10:00:00Z"),
  replies: [{ id: "r1", body: "Please add a regression test.", authorName: "Cara", agentName: null, createdAt: new Date("2026-10-29T11:00:00Z") }],
};


describe("IssueBidsPanel (#issue-bids)", () => {

  it("is one compact card past Open, collapsed, naming the awarded bid, and expands to the bids without Award", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <IssueBidsPanel
        bids={[{ ...bid, awardedAt: new Date("2026-10-29T12:00:00Z") }, { ...bid, id: "bid2", agentName: "Bob's agent" }]}
        collapsed
      />,
    );
    const card = screen.getByTestId("bids");
    const fold = card.querySelector("details")!;
    expect(fold).not.toHaveAttribute("open");
    expect(card).toHaveTextContent(/Ada's Claude/);
    await user.click(screen.getByText(/Awarded to Ada's Claude/));
    expect(fold).toHaveAttribute("open");
    expect(screen.getByText("Bob's agent")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Award bid" })).toBeNull();
  });

  it("shows each open bid's votes, and no Award button to a viewer who can't award", () => {
    render(<IssueBidsPanel bids={[{ ...bid, votes: 3 }, { ...bid, id: "bid2", agentName: "Bob's agent", votes: 1 }, { ...bid, id: "bid3", agentName: "Cara's agent" }]} />);
    expect(screen.getAllByTestId("bid-votes").map((votes) => votes.textContent?.match(/\d+/)?.[0])).toEqual(["3", "1", "0"]);
    expect(screen.queryByRole("button", { name: /Award/ })).toBeNull();
  });

  it("offers Award on every open bid, whatever its votes, and only to a viewer who can award (#open-award)", () => {
    const at = new Date("2026-10-29T12:00:00Z");
    const bids: BidEntryView[] = [
      { ...bid, id: "open1", agentName: "Open agent", votes: 3 },
      { ...bid, id: "open2", agentName: "Second agent", votes: 4 },
      { ...bid, id: "below1", agentName: "Short agent", votes: 2 },
      { ...bid, id: "withdrawn1", agentName: "Withdrawn agent", withdrawnAt: at, votes: 3 },
      { ...bid, id: "released1", agentName: "Released agent", awardedAt: at, awardReleasedAt: at, votes: 3 },
    ];
    const { unmount } = render(<IssueBidsPanel bids={bids} canAward awardThreshold={3} />);
    const buttons = screen.getAllByRole("button", { name: /Award/ });
    expect(buttons).toHaveLength(3);
    const awardedIds = buttons.map((button) => (button.closest("form")?.querySelector("input[name=bidId]") as HTMLInputElement | null)?.value);
    // Every open bid, the most voted first; the one below the old threshold too.
    expect(awardedIds).toEqual(["open2", "open1", "below1"]);
    expect(screen.getByTestId("bid-withdrawn").querySelector("button")).toBeNull();
    expect(screen.getByTestId("bid-released").querySelector("button")).toBeNull();
    unmount();

    render(<IssueBidsPanel bids={bids} awardThreshold={3} />);
    expect(screen.queryByRole("button", { name: /Award/ })).toBeNull();
  });

  it("marks an open bid whose bidder is at capacity, and offers no Award button for it (#bidder-capacity)", () => {
    render(<IssueBidsPanel bids={[{ ...bid, id: "full", agentName: "Pixel", atCapacity: true, votes: 3 }, { ...bid, id: "free", agentName: "Cara's agent", votes: 3 }]} canAward awardThreshold={3} />);
    const marks = screen.getAllByTestId("bid-at-capacity");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("at capacity");
    expect(marks[0].closest("li")).toHaveTextContent("Pixel");
    const buttons = screen.getAllByRole("button", { name: /Award/ });
    expect(buttons.map((button) => (button.closest("form")?.querySelector("input[name=bidId]") as HTMLInputElement | null)?.value)).toEqual(["free"]);
  });

});

const entry = (id: string, by: string, at: string): ConfirmationEntryView => ({
  id,
  verdict: "confirm",
  summary: `${by} reproduced it.`,
  description: `${by}'s steps and what happened.`,
  duplicateOf: null,
  onBehalfOfUserId: `user-${id}`,
  by,
  agentName: null,
  counted: true,
  undone: false,
  updatedAt: new Date(at),
  replies: [],
});

const data: ConfirmationsData = {
  confirmations: 2,
  confirmationsNeeded: 2,
  entries: [entry("c1", "Ada", "2026-10-28T10:00:00Z"), entry("c2", "Bob", "2026-10-28T11:00:00Z")],
};


describe("IssueConfirmationsPanel past Requires confirmation", () => {
  it("is one compact card, collapsed, with who confirmed it, and expands to the entries", async () => {
    const user = userEvent.setup({ delay: null });
    render(<IssueConfirmationsPanel bugId="bug1" data={data} viewerId="viewer" block={null} summaryMaxChars={200} history confirmed />);
    const card = screen.getByTestId("confirmations-collapsed");
    const fold = card.querySelector("details")!;
    expect(fold).not.toHaveAttribute("open");
    expect(card).toHaveTextContent(/Ada.*Bob/);
    // No big banner while it is collapsed.
    expect(screen.queryByTestId("confirmation-banner")).toBeNull();
    await user.click(screen.getByText(/Confirmed by/));
    expect(fold).toHaveAttribute("open");
    expect(screen.getByText("Ada reproduced it.")).toBeVisible();
  });

  it("shows the full cards, and no Not confirmed banner, while the issue requires confirmation", () => {
    render(<IssueConfirmationsPanel bugId="bug1" data={data} viewerId="viewer" block={null} summaryMaxChars={200} confirmed={false} />);
    expect(screen.queryByTestId("confirmations-collapsed")).toBeNull();
    expect(screen.getByText("Ada reproduced it.")).toBeInTheDocument();
    // The next-step bar says what is still needed; the panel has no banner of its own.
    expect(screen.queryByTestId("confirmation-banner")).toBeNull();
    expect(screen.queryByText(/Not confirmed yet/)).toBeNull();
  });

  it("shows the green Confirmed banner, naming who confirmed it, once confirmed", () => {
    render(<IssueConfirmationsPanel bugId="bug1" data={data} viewerId="viewer" block={null} summaryMaxChars={200} confirmed />);
    const banner = screen.getByTestId("confirmation-banner");
    expect(banner).toHaveAttribute("data-confirmed", "true");
    expect(banner).toHaveTextContent(/Ada.*Bob/);
  });
});

describe("A decision about your work (#your-decisions)", () => {
  const closed: DecisionIssue = {
    status: "closed",
    isDeleted: false,
    reporterId: "alice",
    beneficiaryUserId: "alice",
    closeReason: "duplicate",
    closeEvidence: "Same steps and screen as #9, filed first.",
    duplicateOf: { number: 9, title: "Resources tabs are empty" },
  };
  const vote = (onBehalfOfUserId: string, by: string, votes = 1, reason = "duplicate"): DecisionSuggestion => ({
    reason, votes, summary: `${by}: #9 owns this work.`, evidence: null, onBehalfOfUserId, by, agentName: `${by}'s Claude`,
  });
  const suggestions = [vote("cara", "Cara", 2), vote("alice", "Alice"), vote("bob", "Bob"), vote("dan", "Dan", 1, "not_planned")];
  const decide = (issue: DecisionIssue, viewerId: string, list = suggestions) =>
    decisionFor({ issue, viewerId, suggestions: list, threshold: 3, decidedAt: new Date("2026-11-05T10:00:00Z") });

  it("tells the owner who closed their issue and with what: other people's votes for the reason it closed with", () => {
    const decision = decide(closed, "alice")!;
    expect(decision.voters.map((voter) => voter.by)).toEqual(["Cara", "Bob"]);
    expect(decision.votes).toBe(3);
    expect(decision.evidence).toBe(closed.closeEvidence);
    // The person it is for sees it too, not only the reporter.
    expect(decide({ ...closed, reporterId: "agent-owner" }, "alice")).not.toBeNull();
  });

  it("shows nothing to anyone else, for a withdrawal or a deleted issue, before it closes, or when only the owner voted", () => {
    expect(decide(closed, "bob")).toBeNull();
    expect(decide({ ...closed, closeReason: "withdrawn" }, "alice")).toBeNull();
    expect(decide({ ...closed, isDeleted: true }, "alice")).toBeNull();
    expect(decide({ ...closed, status: "open", closeReason: null }, "alice")).toBeNull();
    expect(decide(closed, "alice", [vote("alice", "Alice", 3)])).toBeNull();
  });

  it("sends the owner's reply with their evidence, or their agreement", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DecisionCard issueId="bug1" decision={decide(closed, "alice")!} />);
    await user.click(screen.getByRole("button", { name: "I agree" }));
    expect(decisionActions.agree).toHaveBeenCalledWith("bug1");
    await user.click(screen.getByRole("button", { name: "Respond" }));
    await user.type(screen.getByLabelText(/Your side/), "Mine is about the mobile page; #9 is desktop only.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(decisionActions.respond).toHaveBeenCalledWith("bug1", "Mine is about the mobile page; #9 is desktop only."));
  });

  it("says a manager can reopen only a not-reproducible close", async () => {
    const user = userEvent.setup({ delay: null });
    const notReproducible = decide({ ...closed, closeReason: "not_reproducible", duplicateOf: null }, "alice", [vote("cara", "Cara", 3, "not_reproducible")])!;
    render(<DecisionCard issueId="bug1" decision={notReproducible} />);
    await user.click(screen.getByRole("button", { name: "Respond" }));
    expect(screen.getByText(/A manager can reopen it with your fresh reproduction/)).toBeInTheDocument();
  });

  it("folds to one line once the owner agreed", () => {
    render(<DecisionCard issueId="bug1" decision={decide({ ...closed, closeAgreedAt: new Date("2026-11-05T11:00:00Z") }, "alice")!} />);
    expect(screen.getByTestId("decision-agreed")).toHaveTextContent(/You agreed with this decision/);
    expect(screen.queryByRole("button", { name: "Respond" })).toBeNull();
  });
});
