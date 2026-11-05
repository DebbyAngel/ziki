"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { newIssuePath } from "@/lib/project-paths";
import { createBugAction, type ActionResult } from "@/app/actions/issues";
import { submitFailureMessage } from "@/lib/submit-error";
import { ErrorSummary, FieldError, useFieldErrors } from "@/components/ui/field-errors";
import type { AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCounter } from "@/components/ui/character-counter";
import { AttachmentPicker } from "@/components/attachment-picker";
import { SimilarIssues } from "@/components/similar-issues";
import { isIssueCreatedRedirect } from "@/lib/issue-created-redirect";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useFormDraft } from "@/components/use-form-draft";
import { buildDraftKey, saveDraftToStorage } from "@/lib/form-drafts";
import { reportedFromLine } from "@/lib/reported-from";
import { DraftBanner } from "@/components/draft-banner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ClaudeWorking } from "@/components/claude-working";
import { initialDescription, templateSwitch } from "@/lib/issue-templates";
import { REWARD_MAX, REWARD_MIN } from "@/lib/points/rules";
import { DELIVERY_FORMATS, DELIVERY_FORMAT_HELPER } from "@/lib/delivery-formats";

/** Must match the title limit enforced by createBugSchema. */
const TITLE_MAX_LENGTH = 200;

type UserOption = { id: string; name: string; role: AppRole; image?: string | null };
type TypeOption = {
  id: string;
  name: string;
  description?: string | null;
  /** Pre-fills the description (#307). */
  template?: string | null;
};

/** Field names as the person sees them, for the error summary. */
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  typeId: "Type",
  deliveryFormat: "Delivery Format",
  points: "Points",
  description: "Description",
  proofLinks: "GitHub PR",
};

export function CreateIssueForm({
  users,
  types = [],
  currentUserId,
  projectId,
  projectSlug,
  variant = "page",
  modalMode = "report",
  reportedFrom = null,
  onCancel,
  onDirtyChange,
}: {
  users: UserOption[];
  assigneeUsers?: UserOption[];
  types?: TypeOption[];
  isAdmin: boolean;
  currentUserId?: string;
  projectId?: string | null;
  /** The project the form was opened in, for the full report page link. */
  projectSlug: string;
  /**
   * "page": the full report page (detailed by default, with a link to a
   * quick report). "modal": the form opened over the current page.
   */
  variant?: "page" | "modal";
  /**
   * Modal only: which form it shows. A quick report by default; "detailed" is
   * the task form, for a page whose button says "New task".
   */
  modalMode?: "report" | "detailed";
  /** The in-app page a modal report was opened from, already validated. */
  reportedFrom?: string | null;
  /** Modal only: Cancel asks the modal to close. */
  onCancel?: () => void;
  /** Modal only: whether anything has been typed or attached, for the discard prompt. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const inModal = variant === "modal";
  /**
   * The task modal the Marketing workspace's "New task" button opens. A modal
   * never switches between the two forms, so the mode it was mounted with is
   * the mode it stays in.
   */
  const taskModal = inModal && modalMode === "detailed";
  const defaultTypeId =
    types.find((t) => t.name.toLowerCase() === "fix")?.id ?? types[0]?.id ?? "";
  const templateOf = (id: string) => types.find((t) => t.id === id)?.template ?? null;
  const confirm = useConfirm();

  // #307: changing type offers that type's template. An untouched template
  // or a blank field is swapped silently; anything typed is only replaced
  // after asking.
  async function changeType(nextTypeId: string) {
    const current = values.description;
    const decision = templateSwitch(current, templateOf(values.typeId), templateOf(nextTypeId));
    setValue("typeId", nextTypeId);
    if (decision.kind === "replace") {
      setValue("description", decision.text);
    } else if (decision.kind === "confirm") {
      const typeName = types.find((t) => t.id === nextTypeId)?.name ?? "this type";
      const ok = await confirm({
        title: `Use the ${typeName} template?`,
        body: "It replaces what you've written in the description. Keep your text to change only the type.",
        confirmLabel: "Replace with template",
        cancelLabel: "Keep my text",
      });
      if (ok) setValue("description", decision.text);
    }
  }

  const draftKey = buildDraftKey({
    userId: currentUserId,
    formType: "create-bug",
    projectId,
  });

  const { values, setValue, isRestored, clearDraft, discardDraft } = useFormDraft(
    draftKey,
    {
      title: "",
      // A task names its type itself; the first one is not picked for it.
      typeId: taskModal ? "" : defaultTypeId,
      deliveryFormat: "",
      points: "",
      whyThisHelps: "",
      description: initialDescription(templateOf(taskModal ? "" : defaultTypeId)),
      proofLinks: "",
    },
  );
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"report" | "detailed">(
    inModal ? modalMode : "detailed",
  );
  const [includeFrom, setIncludeFrom] = useState(Boolean(reportedFrom));
  const [editorUploading, setEditorUploading] = useState(false);
  const [pickerUploading, setPickerUploading] = useState(false);
  const isUploading = editorUploading || pickerUploading;
  const [error, setError] = useState<string | null>(null);
  // True when the request itself failed (network / server error), so the
  // person can simply retry; validation errors from the server aren't retryable.
  const [canRetry, setCanRetry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const errs = useFieldErrors("report", formRef);
  const mentionUsers = users.map((user) => ({ id: user.id, name: user.name }));
  const untouchedDescription = initialDescription(templateOf(values.typeId));
  const dirty =
    values.title.trim() !== "" ||
    (values.description.trim() !== "" && values.description !== untouchedDescription) ||
    values.whyThisHelps.trim() !== "" ||
    attachmentIds.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Similar issues are matched as you type: on the title, or in a quick
  // report (where the title is optional) on the start of the description.
  const similarQuery =
    values.title.trim() || (mode === "report" ? values.description.trim().slice(0, 160) : "");
  const sideHasFields =
    !inModal && mode === "detailed";

  /** The send button's word: a report is sent, a task posted, an issue created. */
  const submitLabel = isUploading
    ? "Uploading…"
    : mode === "report"
      ? pending
        ? "Sending…"
        : "Send report"
      : taskModal
        ? pending
          ? "Posting…"
          : "+ Post task"
        : pending
          ? "Creating…"
          : "Create issue";

  /**
   * What the deliverable is handed over as. It is one field, used twice: in the
   * full report's sidebar under the type, and as its own row in the quick report,
   * where a marketing task still has to say what the reviewer will open.
   * The task modal puts the explanation in the closed select instead of under it.
   */
  const deliveryFormatField = (
    <div className="space-y-1.5">
      <label htmlFor="deliveryFormat" className="text-sm font-medium text-slate-700">
        Delivery Format
      </label>
      <Select
        id="deliveryFormat"
        name="deliveryFormat"
        value={values.deliveryFormat}
        onChange={(event) => setValue("deliveryFormat", event.target.value)}
        {...errs.attrs("deliveryFormat")}
      >
        <option value="">{taskModal ? DELIVERY_FORMAT_HELPER : "Select a delivery format"}</option>
        {DELIVERY_FORMATS.map((format) => (
          <option key={format} value={format}>
            {format}
          </option>
        ))}
      </Select>
      <FieldError formId={errs.formId} field="deliveryFormat" errors={errs.fieldErrors} />
      {taskModal ? null : (
        <p className="text-xs text-zk-muted">{DELIVERY_FORMAT_HELPER}</p>
      )}
    </div>
  );

  /**
   * What the task pays, in $ (#rewards). It waits for a type, because the
   * points a task is worth are read against the kind of work it is. Leaving
   * it blank hands the reward to the agents' estimates, as it always was.
   */
  const pointsField = (
    <div className="space-y-1.5">
      <label htmlFor="points" className="text-sm font-medium text-slate-700">
        Points
      </label>
      <Input
        id="points"
        name="points"
        type="number"
        min={REWARD_MIN}
        max={REWARD_MAX}
        step={1}
        disabled={!values.typeId}
        placeholder={values.typeId ? `${REWARD_MIN}–${REWARD_MAX}` : "Pick a type first"}
        value={values.points}
        onChange={(event) => setValue("points", event.target.value)}
        {...errs.attrs("points")}
      />
      <FieldError formId={errs.formId} field="points" errors={errs.fieldErrors} />
    </div>
  );

  /**
   * What kind of task this is. On the full page they sit in the sidebar beside
   * the description; in a task modal there is no sidebar, so they come first,
   * the way the form asks for them. A GitHub PR is engineering proof, so a task
   * modal does not ask for one.
   */
  const typeField = types.length > 0 ? (
    <div className="space-y-1.5">
      <label htmlFor="typeId" className="text-sm font-medium text-slate-700">
        Type
      </label>
      <Select
        id="typeId"
        name="typeId"
        value={values.typeId}
        onChange={(event) => void changeType(event.target.value)}
        {...errs.attrs("typeId")}
      >
        {taskModal ? <option value="">Choose a type</option> : null}
        {types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </Select>
      <FieldError formId={errs.formId} field="typeId" errors={errs.fieldErrors} />
    </div>
  ) : null;

  const detailFields = (
    <>
      {taskModal ? (
        <div className="create-task-row">
          {typeField}
          {pointsField}
        </div>
      ) : (
        typeField
      )}
      {deliveryFormatField}
      {inModal ? null : (
        <div className="space-y-1.5">
          <label htmlFor="proofLinks" className="text-sm font-medium text-slate-700">
            GitHub PR
          </label>
          <Textarea
            id="proofLinks"
            name="proofLinks"
            rows={3}
            placeholder={"https://github.com/organization/repo/pull/123"}
            value={values.proofLinks}
            onChange={(event) => setValue("proofLinks", event.target.value)}
            {...errs.attrs("proofLinks")}
          />
          <FieldError formId={errs.formId} field="proofLinks" errors={errs.fieldErrors} />
          <p className="text-xs text-zk-muted">
            Optional. One GitHub link per line (e.g. https://github.com/organization/repo/pull/123).
          </p>
        </div>
      )}
    </>
  );

  return (
    <form
      ref={formRef}
      className="create-issue-form space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || isUploading) return;
        setError(null);
        setCanRetry(false);
        errs.clear();
        const formData = new FormData();
        formData.set("title", values.title);
        // The task form asks why the work is worth doing as its own box, but
        // the idea it files has one body of text, so the reason goes on the end.
        const why = values.whyThisHelps.trim();
        const body = why
          ? `${values.description.trimEnd()}\n\n**Why this helps:** ${why}`
          : values.description;
        formData.set(
          "description",
          mode === "report" && includeFrom && reportedFrom
            ? `${body.trimEnd()}\n\n${reportedFromLine(reportedFrom)}`
            : body,
        );
        formData.set("attachmentIds", attachmentIds.join(","));
        formData.set("isReport", mode === "report" ? "true" : "false");
        // The project the form was opened in (#project-urls); the action checks it is in the workspace.
        if (projectId) formData.set("projectId", projectId);
        // What the deliverable is handed over as. Asked in both modes, because a
        // quick marketing report still has to say so (lib/delivery-formats.ts).
        if (values.deliveryFormat) formData.set("deliveryFormat", values.deliveryFormat);
        if (mode === "detailed") {
          formData.set("typeId", values.typeId);
          formData.set("proofLinks", values.proofLinks);
          if (values.points) formData.set("points", values.points);
        }
        startTransition(async () => {
          try {
            const result: ActionResult = await createBugAction(formData);
            if (result.error) {
              // A field-specific error goes beside its control and takes
              // focus there; only an error about no field in particular
              // stays as the form-level alert at the bottom.
              if (result.field || result.fieldErrors) errs.show(result);
              else setError(result.error);
            } else {
              clearDraft();
            }
          } catch (error) {
            if (isIssueCreatedRedirect(error)) clearDraft();
            unstable_rethrow(error);
            setError(submitFailureMessage(navigator.onLine));
            setCanRetry(true);
          }
        });
      }}
    >
      {isRestored ? (
        <DraftBanner
          onDiscard={discardDraft}
          message="Restored unsaved draft from this browser"
        />
      ) : null}

      {inModal ? null : mode === "detailed" ? (
        <p className="create-mode-note text-sm text-zk-text2">
          Short on time?{" "}
          <button type="button" onClick={() => setMode("report")} className="create-mode-link">
            Send a quick report
          </button>
        </p>
      ) : (
        <p className="create-mode-note text-sm text-zk-text2">
          Quick report: tell us what happened. We&apos;ll sort out the details.{" "}
          <button type="button" onClick={() => setMode("detailed")} className="create-mode-link">
            Add more detail
          </button>
        </p>
      )}

      <ErrorSummary errors={errs.fieldErrors} labels={FIELD_LABELS} />

      <div className={sideHasFields ? "create-layout" : "create-layout create-layout--single"}>
        <div className="create-main create-fields space-y-4">
          {/* A quick report has no title: the first line of what happened is
              enough to go on. A task is named. */}
          {inModal && mode === "report" ? null : (
              <div className="space-y-1.5">
                <label htmlFor="title" className="text-sm font-medium text-slate-700">
                  Title
                </label>
                <Input
                  id="title"
                  name="title"
                  required={mode === "detailed"}
                  minLength={mode === "detailed" ? 3 : undefined}
                  maxLength={TITLE_MAX_LENGTH}
                  placeholder={
                    taskModal
                      ? "e.g. Write a blog post on our pricing changes"
                      : mode === "report"
                        ? "Short summary (optional — auto-generated from description if empty)"
                        : "Short summary of the issue"
                  }
                  value={values.title}
                  onChange={(event) => setValue("title", event.target.value)}
                  {...errs.attrs("title")}
                />
                {taskModal ? null : (
                  <CharacterCounter
                    length={values.title.length}
                    max={TITLE_MAX_LENGTH}
                    className="text-right"
                  />
                )}
                <FieldError formId={errs.formId} field="title" errors={errs.fieldErrors} />
                {taskModal ? null : <SimilarIssues title={similarQuery} />}
              </div>
          )}
          {taskModal ? detailFields : null}
          <div className={taskModal ? "space-y-1.5" : "create-description space-y-1.5"}>
            <label
              id="description-label"
              htmlFor="description"
              className="text-sm font-medium text-slate-700"
            >
              {mode === "report" ? "What happened?" : "Description"}
            </label>
            {/* A task is one box among five, so it stays a plain box; the full
                page's description is where markdown and pasted screenshots
                earn their toolbar. */}
            {taskModal ? (
              <Textarea
                id="description"
                name="description"
                required
                minLength={10}
                maxLength={5000}
                rows={4}
                placeholder="What should be delivered, and how will reviewers know it is done?"
                value={values.description}
                onChange={(event) => setValue("description", event.target.value)}
                {...errs.attrs("description")}
              />
            ) : (
              <MarkdownEditor
                id="description"
                labelId="description-label"
                name="description"
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                placeholder={
                  mode === "report"
                    ? "Describe what happened in your own words. What were you doing, and what went wrong?"
                    : "Steps to reproduce, expected vs actual, environment…"
                }
                value={values.description}
                onChange={(val) => setValue("description", val)}
                onUploadingChange={setEditorUploading}
                users={mentionUsers}
                {...errs.attrs("description")}
                footer={
                  <p className="text-xs text-slate-500">
                    {mode === "report"
                      ? "Markdown is supported. Plain language is welcome; our agents will structure the report."
                      : "Markdown is supported. Be specific: what should happen, what actually happens, and how to reproduce it."}
                  </p>
                }
              />
            )}
            <FieldError formId={errs.formId} field="description" errors={errs.fieldErrors} />
          </div>
          {taskModal ? (
            <div className="space-y-1.5">
              <label htmlFor="whyThisHelps" className="text-sm font-medium text-slate-700">
                Why this helps
              </label>
              <Textarea
                id="whyThisHelps"
                name="whyThisHelps"
                rows={3}
                maxLength={1000}
                placeholder="e.g. Our focus is organic sign-ups, and the pricing page is our top landing page."
                value={values.whyThisHelps}
                onChange={(event) => setValue("whyThisHelps", event.target.value)}
              />
            </div>
          ) : null}
          {inModal && !taskModal ? <SimilarIssues title={similarQuery} /> : null}
          {inModal && mode === "detailed" ? null : (
            <fieldset className="create-attachments space-y-1.5">
              <legend className="text-sm font-medium text-slate-700">
                Screenshots and files
              </legend>
              <p className="text-xs text-slate-500">
                Optional. No GitHub account needed: attach a screenshot, console log
                or recording export straight to the report.
              </p>
              <AttachmentPicker
                name="attachmentIdsPicker"
                onChange={setAttachmentIds}
                onUploadingChange={setPickerUploading}
                disabled={pending}
              />
            </fieldset>
          )}
          {inModal && reportedFrom && includeFrom ? (
            <div className="create-from flex flex-wrap items-center gap-2 rounded-xl bg-zk-bg px-3 py-2 text-sm text-zk-text2">
              <span className="min-w-0 flex-1">
                We&apos;ll include the page you were on:{" "}
                <span className="font-semibold text-zk-text break-all">{reportedFrom}</span>
              </span>
              <button
                type="button"
                onClick={() => setIncludeFrom(false)}
                className="create-mode-link"
                aria-label={`Remove ${reportedFrom} from the report`}
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
        {sideHasFields ? (
          <aside className="create-side create-fields space-y-4" aria-label="Issue details">
            {detailFields}
          </aside>
        ) : null}
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="alert">
          <p className="text-sm text-red-600">{error}</p>
          {canRetry ? (
            <button
              type="button"
              disabled={pending || isUploading}
              onClick={() => formRef.current?.requestSubmit()}
              className="text-sm font-medium text-teal-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {inModal ? (
        <>
          {/* The quick report is one screen, so the field that says what the
              reviewer will open belongs on it, not only on the full form. The
              task form already asks for it above the description. */}
          {mode === "report" ? deliveryFormatField : null}
          <div className="create-modal-actions flex flex-wrap items-center gap-3">
            {/* A full page load on purpose: a client-side navigation would be
                intercepted again and keep the modal open. The draft is saved
                first (it normally saves after a pause), so the full form opens
                with what was typed. */}
            {mode === "report" ? (
              <a
                href={newIssuePath(projectSlug)}
                className="create-mode-link create-more-detail"
                onClick={() => saveDraftToStorage(draftKey, values)}
              >
                Add more detail
              </a>
            ) : null}
            <span className="flex-1" />
            <Button type="button" variant="secondary" className="create-cancel" onClick={() => onCancel?.()}>
              Cancel
            </Button>
            <Button className="create-submit" type="submit" disabled={pending || isUploading}>
              {submitLabel}
            </Button>
          </div>
        </>
      ) : (
        <Button className="create-submit" type="submit" disabled={pending || isUploading}>
          {submitLabel}
        </Button>
      )}
      {/* While the idea goes to Claude to be written up, show the work happening. */}
      {pending ? <ClaudeWorking className="mt-3" /> : null}
    </form>
  );
}

export { CreateIssueForm as CreateBugForm };
