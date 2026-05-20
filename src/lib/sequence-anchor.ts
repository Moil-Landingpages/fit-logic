// Step selection for the campaign queue.
//
// Pulls the "what should this recipient do right now?" decision out of the
// queue worker so the same logic runs from both the manual Send Now path
// (app/api/process-campaign-queue) and the daily cron (app/api/cron/schedule),
// and so the anchored-sequence semantics live in one place.
//
// Anchor modes (campaigns.anchor_type):
//   relative           — delay_days = days after the previous step's sent_at
//                        (the original semantics; preserved exactly).
//   before_appointment — delay_days = days BEFORE recipient.anchor_at.
//   after_appointment  — delay_days = days AFTER  recipient.anchor_at.

export type AnchorType = "relative" | "before_appointment" | "after_appointment";

export interface SequenceStepLite {
  step_number: number;
  delay_days: number;
}

export interface RecipientLite {
  current_step: number | null;
  anchor_at: string | null;
}

/**
 * Steps that should have fired more than this far in the past are skipped
 * instead of sent. Without a grace window, enrolling a patient one minute
 * after the target_send_at would still trigger the send — usually undesirable
 * for "5 days before appointment" reminders that the recipient would receive
 * AFTER their appointment.
 */
export const OVERDUE_GRACE_MS = 12 * 60 * 60 * 1000; // 12h

const DAY_MS = 86_400_000;

export type StepDecision =
  /** This step is ready — caller should send it now. */
  | { action: "send"; step: SequenceStepLite }
  /** Sequence has no step (currentStep + 1) — caller should mark recipient completed. */
  | { action: "complete"; isFirstSendAttempt: boolean; availableSteps: number[] }
  /** Next step's target is in the future — caller should leave recipient as-is and try again later. */
  | { action: "wait"; step: SequenceStepLite; targetAt: Date }
  /** Anchored campaign but recipient.anchor_at is null — caller should mark failed. */
  | { action: "missing_anchor"; step: SequenceStepLite };

interface PickOpts {
  anchorType: AnchorType;
  sequences: SequenceStepLite[];
  recipient: RecipientLite;
  /**
   * For relative sequences only: timestamp of the last successful send for
   * the previous step (campaign_send_log.sent_at). Used to honor the original
   * "days since last send" gate. Null on the very first step.
   */
  lastSentAt: string | null;
  now: Date;
}

/**
 * Pick the next step a recipient should advance through, skipping past-due
 * anchored steps along the way.
 *
 * The caller passes in the recipient's CURRENT step number and gets back EITHER
 * the step to send next or a directive (wait / complete / missing_anchor) AND
 * an updated current_step that reflects any overdue skips. The caller is
 * responsible for persisting that current_step before sending.
 */
export interface PickResult {
  decision: StepDecision;
  /**
   * Steps that were skipped because their target_send_at is more than
   * OVERDUE_GRACE_MS in the past. Caller should log these to
   * campaign_send_log with status='skipped' and bump recipient.current_step
   * past them.
   */
  skippedOverdue: SequenceStepLite[];
  /** The current_step value the caller should write before/after acting on the decision. */
  effectiveCurrentStep: number;
}

export function pickNextActionableStep(opts: PickOpts): PickResult {
  const { anchorType, sequences, recipient, lastSentAt, now } = opts;
  let currentStep = recipient.current_step ?? 0;
  const skippedOverdue: SequenceStepLite[] = [];
  const availableSteps = sequences.map((s) => s.step_number);

  // Loop so we can skip a run of overdue anchored steps in one pass.
  // Bound the loop at sequences.length to guarantee termination even if
  // step_numbers are non-contiguous (find() returns undefined → complete).
  for (let guard = 0; guard <= sequences.length; guard++) {
    const isFirstSendAttempt = currentStep === 0;
    const next = sequences.find((s) => s.step_number === currentStep + 1);

    if (!next) {
      return {
        decision: { action: "complete", isFirstSendAttempt, availableSteps },
        skippedOverdue,
        effectiveCurrentStep: currentStep,
      };
    }

    if (anchorType === "relative") {
      // Original semantics: days since previous step's sent_at. The very first
      // step (lastSentAt = null) has no prior send, so delay_days is ignored.
      if (next.delay_days > 0 && lastSentAt) {
        const elapsed = now.getTime() - new Date(lastSentAt).getTime();
        if (elapsed < next.delay_days * DAY_MS) {
          const targetAt = new Date(new Date(lastSentAt).getTime() + next.delay_days * DAY_MS);
          return {
            decision: { action: "wait", step: next, targetAt },
            skippedOverdue,
            effectiveCurrentStep: currentStep,
          };
        }
      }
      return {
        decision: { action: "send", step: next },
        skippedOverdue,
        effectiveCurrentStep: currentStep,
      };
    }

    // Anchored modes — need a concrete anchor_at on the recipient.
    if (!recipient.anchor_at) {
      return {
        decision: { action: "missing_anchor", step: next },
        skippedOverdue,
        effectiveCurrentStep: currentStep,
      };
    }

    const anchorMs = new Date(recipient.anchor_at).getTime();
    const offsetMs = next.delay_days * DAY_MS;
    const targetMs =
      anchorType === "before_appointment" ? anchorMs - offsetMs : anchorMs + offsetMs;
    const nowMs = now.getTime();

    if (nowMs < targetMs) {
      return {
        decision: { action: "wait", step: next, targetAt: new Date(targetMs) },
        skippedOverdue,
        effectiveCurrentStep: currentStep,
      };
    }
    if (nowMs - targetMs > OVERDUE_GRACE_MS) {
      // Step is past-due → skip it and consider the next one.
      skippedOverdue.push(next);
      currentStep = next.step_number;
      continue;
    }
    return {
      decision: { action: "send", step: next },
      skippedOverdue,
      effectiveCurrentStep: currentStep,
    };
  }

  // Defensive fallback — shouldn't be reachable because the find() branch
  // above terminates the loop, but TypeScript can't see that.
  return {
    decision: { action: "complete", isFirstSendAttempt: false, availableSteps },
    skippedOverdue,
    effectiveCurrentStep: currentStep,
  };
}
