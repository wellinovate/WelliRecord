import crypto from "node:crypto";
import { accessGrantModel } from "./access_grant_model.js";
import { buildClinicalAccessFilter } from "./access_grant_service.js";
import { allergyModel } from "../allergies/allergies_model.js";
import { medicationModel } from "../medications/medications_model.js";

/**
 * Generates a URL-safe share token. Not a JWT — this is an opaque,
 * unguessable identifier looked up directly against the AccessGrant
 * collection, the same way a One-Time Access Token or QR code payload
 * would be. 24 random bytes, base64url-encoded, ~32 characters.
 */
const generateShareToken = () =>
  crypto.randomBytes(24).toString("base64url");

/**
 * Creates a WelliBridge share link grant. Thin wrapper around the same
 * AccessGrant model every other grant type uses — a share link is not a
 * separate system, it's a grant with granteeType "link" and a token
 * instead of a known provider/organization identity.
 */
export const createShareLink = async ({
  patientId,
  grantedBy,

  accessScope = "category",
  category = null,

  durationHours = 24,
  oneTimeUse = false,

  purpose = null,
}) => {
  const now = new Date();

  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + Number(durationHours || 24));

  let shareToken = generateShareToken();

  // Extremely unlikely given 24 random bytes, but guard against a
  // collision anyway rather than trust probability alone.
  let existing = await accessGrantModel.findOne({ shareToken });
  let attempts = 0;
  while (existing && attempts < 5) {
    shareToken = generateShareToken();
    existing = await accessGrantModel.findOne({ shareToken });
    attempts += 1;
  }
  if (existing) {
    throw new Error("Could not generate a unique share token. Please try again.");
  }

  const grant = await accessGrantModel.create({
    patientId,
    grantedBy,

    granteeType: "link",
    shareToken,
    oneTimeUse,

    accessScope,
    category,

    startsAt: now,
    expiresAt,

    permissions: {
      view: true,
      download: false,
      reshare: false,
      write: false,
    },

    purpose,

    status: "active",
    reviewedAt: now,
  });

  return grant;
};

/**
 * Resolves a share token to an active, unexpired, unused grant. Mirrors
 * resolveConsentAccess's return shape ({ mode, grant, permissions, filter })
 * so bridge_controller.js can query clinical models the same way every
 * other authenticated consent-scoped endpoint already does.
 */
export const resolveBridgeAccess = async ({ token }) => {
  const grant = await accessGrantModel.findOne({
    shareToken: token,
    granteeType: "link",
  });

  if (!grant) {
    const error = new Error("This link is invalid or does not exist.");
    error.statusCode = 404;
    error.code = "BRIDGE_LINK_NOT_FOUND";
    throw error;
  }

  if (grant.status === "revoked") {
    const error = new Error("This link has been revoked by the patient.");
    error.statusCode = 410;
    error.code = "BRIDGE_LINK_REVOKED";
    throw error;
  }

  if (grant.expiresAt && grant.expiresAt <= new Date()) {
    const error = new Error("This link has expired.");
    error.statusCode = 410;
    error.code = "BRIDGE_LINK_EXPIRED";
    throw error;
  }

  if (grant.oneTimeUse && grant.usedAt) {
    const error = new Error("This link has already been used and can only be viewed once.");
    error.statusCode = 410;
    error.code = "BRIDGE_LINK_ALREADY_USED";
    throw error;
  }

  const filter = buildClinicalAccessFilter({
    grant,
    patientId: grant.patientId,
    category: grant.accessScope === "category" ? grant.category : null,
  });

  return {
    mode: "bridge",
    grant,
    permissions: grant.permissions,
    filter,
  };
};

/**
 * Marks a one-time-use link as consumed. Called after a successful view,
 * not before — a failed/partial render shouldn't burn the one allowed
 * view.
 */
export const markBridgeLinkUsed = async (grantId) => {
  await accessGrantModel.findByIdAndUpdate(grantId, { usedAt: new Date() });
};

/**
 * Fetches the actual clinical data bundle for a resolved bridge grant.
 * Scoped to allergies + current medications for now — the two categories
 * that matter for the founding "allergy wasn't there" scenario this
 * whole feature exists to prevent. Additional categories (labs,
 * immunizations, diagnoses, vitals) can be added the same way, following
 * the exact pattern already used in access_grant_controller.js's
 * getPatientVitalsForProvider, which this deliberately mirrors.
 *
 * Note: `filter` already includes recordStatus handling via
 * buildClinicalAccessFilter (recordStatus is a real field on both
 * models, inherited from the shared clinicalMetadataFields plugin in
 * shared/database/clinical_metadata.js — verified directly, not
 * assumed). clinicalStatus is allergy-specific and additional to that.
 */
export const getBridgeRecordBundle = async ({ grant, filter }) => {
  const wantsAllergies =
    grant.accessScope !== "category" || grant.category === "allergies";
  const wantsMedications =
    grant.accessScope !== "category" || grant.category === "medications";

  const [allergies, medications] = await Promise.all([
    wantsAllergies
      ? allergyModel
          .find({ ...filter, clinicalStatus: "active" })
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),

    wantsMedications
      ? medicationModel
          .find(filter)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  return { allergies, medications };
};
