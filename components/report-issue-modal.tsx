"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { CreateIssueForm } from "@/components/create-issue-form";
import { buildDraftKey, removeDraftFromStorage } from "@/lib/form-drafts";

type FormProps = Omit<ComponentProps<typeof CreateIssueForm>, "variant" | "onCancel" | "onDirtyChange">;

/**
 * Quick report in a modal over the current page (#report-modal). Opened by the
 * intercepted /issues/new route, and by the Marketing workspace's "New task"
 * button. A direct visit or refresh of the report page is not intercepted and
 * shows the full page instead. A native <dialog> gives the focus trap, Esc, an
 * inert background and focus return to whatever opened it.
 */
export function ReportIssueModal({
  title = "Report an issue",
  subtitle = "Tell us what happened. We'll sort out the details.",
  ...props
}: FormProps & {
  /** The heading, when the page opening it calls the task something else. */
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepWritingRef = useRef<HTMLButtonElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (confirming) keepWritingRef.current?.focus();
  }, [confirming]);

  const close = useCallback(() => {
    dialogRef.current?.close();
    router.back();
  }, [router]);

  // Every way out (close button, Cancel, Esc, a click on the dimmed page)
  // asks first when something unsent has been typed or attached.
  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else close();
  }, [dirty, close]);

  const discard = () => {
    removeDraftFromStorage(
      buildDraftKey({ userId: props.currentUserId, formType: "create-bug", projectId: props.projectId }),
    );
    close();
  };

  return (
    // Esc is handled by onCancel; onClick only catches a click on the
    // backdrop, which has no keyboard equivalent to add.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className="report-modal"
      aria-labelledby="report-modal-title"
      aria-describedby="report-modal-subtitle"
      onCancel={(event) => {
        event.preventDefault();
        if (confirming) setConfirming(false);
        else requestClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="relative">
        <div className="report-modal-header">
          <div>
            <h2 id="report-modal-title">{title}</h2>
            <p id="report-modal-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="report-modal-close" aria-label="Close" onClick={requestClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="report-modal-body">
          <CreateIssueForm {...props} variant="modal" onCancel={requestClose} onDirtyChange={setDirty} />
        </div>
        {confirming ? (
          <div className="report-modal-confirm">
            <div role="alertdialog" aria-modal="true" aria-labelledby="report-discard-title" aria-describedby="report-discard-body">
              <h3 id="report-discard-title">Discard this report?</h3>
              <p id="report-discard-body">You&apos;ve written something that hasn&apos;t been sent yet.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="create-mode-link px-3" onClick={discard}>
                  Discard
                </button>
                <button
                  ref={keepWritingRef}
                  type="button"
                  className="create-submit inline-flex min-h-11 items-center rounded-full bg-zk-accent px-5 text-sm font-bold text-white"
                  onClick={() => setConfirming(false)}
                >
                  Keep writing
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
