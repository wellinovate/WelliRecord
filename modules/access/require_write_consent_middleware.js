import { resolveActorContext } from "../vitals/vital_service.js";
import { findActiveAccessGrant } from "./access_grant_service.js";

// Must run after `protect` and after `validate` (needs
// req.validated.patientId — the parsed body, not the raw one).
//
// Blocks a provider write (lab order, prescription, ...) unless the
// patient has an active AccessGrant naming this provider or their
// organization as grantee, scoped to `category`, with
// permissions.write === true. Previously nothing enforced this at
// all — createLabOrderService and createMedicationService wrote
// straight to the DB for any authenticated provider with clinical
// scope access, regardless of patient consent. Reads were already
// gated this way via resolveConsentAccess; this is the write-side
// counterpart, using the same findActiveAccessGrant lookup.
//
// The org owner/admin account is exempt, same as
// resolvePatientRecordAccess already treats it for viewing a chart —
// a facility shouldn't be locked out of its own admin functions.
// Staff (accountType "user", not the org owner) always need an
// explicit grant; an active Encounter does NOT substitute for one —
// createEncounterService has no consent check of its own, so treating
// an encounter as sufficient would just be a second, easier path to
// the same unconsented write this middleware exists to close.
//
// Usage: place after `protect`, `restrictClinicalScope`,
// `requirePermission`, and `validate` on a write route:
//   router.post("/", protect, restrictClinicalScope("lab-orders"),
//     requirePermission("create_lab_orders"), validate(schema),
//     requireWriteConsent("lab-results"), createLabOrderController);
export const requireWriteConsent = (category) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const actor = await resolveActorContext(req.user);

    // Patients writing their own records aren't gated by provider
    // consent — this middleware only restricts provider-side writes.
    if (!actor.isOrganizationActor) {
      return next();
    }

    if (actor.isOrgOwner) {
      return next();
    }

    const patientId = req.validated?.patientId || req.body?.patientId;

    if (!patientId) {
      // No patientId to check consent against. Let the validator/
      // service layer surface the missing-field error instead of
      // this middleware masking it with a misleading 403.
      return next();
    }

    const grant = await findActiveAccessGrant({
      patientId,
      userId: actor.userId,
      organizationId: actor.organizationId,
      category,
    });

    if (!grant || grant.permissions?.write !== true) {
      return res.status(403).json({
        success: false,
        message:
          "This patient has not granted write access for this record type.",
      });
    }

    return next();
  } catch (error) {
    next(error);
  }
};
