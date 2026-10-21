// Independent practitioners: a certified doctor, nurse, lab scientist and so on who works on their own
// and is also a patient. Pure rules, no database, so they can be tested alone.

export const PROFESSIONS = [
  "doctor",
  "dentist",
  "nurse",
  "midwife",
  "pharmacist",
  "lab_scientist",
  "radiographer",
  "physiotherapist",
  "optometrist",
  "other",
];

// The Nigerian regulator that normally licenses each profession. Shown as a hint; the person can name another.
export const LICENSE_BODY_HINTS = {
  doctor: "MDCN",
  dentist: "MDCN",
  nurse: "NMCN",
  midwife: "NMCN",
  pharmacist: "PCN",
  lab_scientist: "MLSCN",
  radiographer: "RRBN",
  physiotherapist: "MRTB",
  optometrist: "OPTRABN",
  other: "",
};

const clip = (v, n) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, n);

/**
 * Cleans the signup or profile form. Returns { ok: true, value } or { ok: false, errors }.
 * With partial = true only the fields that were sent are checked (profile update).
 */
export function cleanPractitionerInput(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("profession")) {
    const p = clip(body.profession, 40);
    if (!PROFESSIONS.includes(p)) errors.profession = "Choose your profession from the list.";
    else value.profession = p;
  }
  if (!partial || has("licenseNumber")) {
    const l = clip(body.licenseNumber, 60);
    if (l.length < 3) errors.licenseNumber = "Enter your practising licence number.";
    else value.licenseNumber = l;
  }
  if (!partial || has("licenseBody")) {
    const b = clip(body.licenseBody, 80);
    if (!b && !partial) errors.licenseBody = "Name the body that licenses you, for example MDCN.";
    else if (b || has("licenseBody")) value.licenseBody = b;
  }
  if (has("practiceName")) value.practiceName = clip(body.practiceName, 120);
  if (has("specialty")) value.specialty = clip(body.specialty, 120);
  if (has("bio")) value.bio = String(body.bio ?? "").trim().slice(0, 1000);
  if (has("officeAddress")) value.officeAddress = clip(body.officeAddress, 200);
  if (has("contactPhone")) value.contactPhone = clip(body.contactPhone, 30);
  if (has("yearsExperience")) {
    const y = Number(body.yearsExperience);
    if (!Number.isInteger(y) || y < 0 || y > 70) errors.yearsExperience = "Years of experience must be between 0 and 70.";
    else value.yearsExperience = y;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** The name patients see: the person's own practice name, else "Dr Name" or the plain name. */
export function practiceDisplayName({ practiceName, fullName, profession }) {
  const given = clip(practiceName, 120);
  if (given) return given;
  const name = clip(fullName, 120) || "Practitioner";
  return profession === "doctor" || profession === "dentist" ? `Dr ${name.replace(/^dr\.?\s+/i, "")}` : name;
}

/**
 * Changing what the licence check was based on puts an approved practitioner back in review.
 * Name, bio and address changes do not.
 */
export function needsReverification(before, after) {
  if (before.verificationStatus !== "approved") return false;
  return ["profession", "licenseNumber", "licenseBody"].some(
    (k) => after[k] !== undefined && String(after[k] ?? "") !== String(before[k] ?? ""),
  );
}

export const PATIENT_ONLY_ROLES = new Set(["patient"]);
