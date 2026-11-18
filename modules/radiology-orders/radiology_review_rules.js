// Review, patient note and release for imaging reports. Pure: no database.

export const NOTE_TYPES = ["preparation", "repeat_needed", "follow_up", "other"];

// A written report waits here. `reported` means written, not yet released to the patient.
export const canReview = (order) => order?.status === "reported" && order?.review?.state !== "approved" && Boolean(order?.report?.findings);
export const canRelease = (order) => order?.status === "reported" && order?.review?.state === "approved" && !order?.releasedAt;
export const canEditNote = (order) => ["requested", "scheduled", "in-progress", "images-uploaded", "reported"].includes(order?.status);

// The person who wrote the report cannot approve it.
export const reviewerConflict = (order, reviewerId) => Boolean(reviewerId) && String(order?.report?.reportedBy || "") === String(reviewerId);

export const cleanReview = (input = {}) => {
  const decision = input.decision;
  const comment = String(input.comment || "").trim().slice(0, 1000);
  const errors = [];
  if (decision !== "approve" && decision !== "return") errors.push("Choose approve or return.");
  if (decision === "return" && comment.length < 5) errors.push("Say what needs correcting.");
  return { value: { decision, comment }, errors };
};

export const cleanNote = (input = {}) => {
  const text = String(input.text || "").trim().slice(0, 600);
  const issueType = NOTE_TYPES.includes(input.issueType) ? input.issueType : "other";
  return { text, issueType };
};

// Direct status changes may not skip the report or the release.
export const statusChangeError = (to) => {
  if (to === "reported") return "A report is written with the report form.";
  if (to === "delivered") return "The report is released to the patient with the release step, after a senior approves it.";
  return null;
};
