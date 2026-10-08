import { vitalModel } from "../vitals/vitals_model.js";
import { accessGrantModel } from "./access_grant_model.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { UserProfile } from "../users/user_profile_model.js";
// import { accessAuditModel } from "./access_audit_model.js";

import {
  grantPatientAccess,
  findActiveAccessGrant,
  buildClinicalAccessFilter,
} from "./access_grant_service.js";

import { validateCreateAccessGrant } from "./access_grant_validation.js";

const getAuthUserId = (req) => {
  // console.log("🚀 ~ getAuthUserId ~ req:", req.user)
  return  req.user?.sub;
};

const getAuthPatientProfileId = (req) => {
  // return req.user?.profileId || req.user?.userProfileId || req.profileId;
  // console.log("🚀 ~ getAuthPatientProfileId ~ req.user?.sub:", req.user)
  return req.user?.profileId;
};

const getAuthOrganizationId = (req) => {
  return (
    req.user?.organizationProfileId ||
    req.user?.organizationId ||
    req.organizationProfileId ||
    null
  );
};

export const createAccessGrant = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    // console.log("🚀 ~ createAccessGrant ~ patientId:", patientId)

    const validation = validateCreateAccessGrant(req.body);
    // console.log("🚀 ~ createAccessGrant ~ validation:", validation)
   

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid access grant payload",
        errors: validation.errors,
      });
    }

    const {
      granteeUserId,
      granteeOrganizationId,
      granteeType,
      accessScope,
      category,
      recordId,
      encounterId,
      recordFrom,
      recordTo,
      durationDays,
      expiresAt,
      permissions,
      purpose,
      notes,
    } = validation.data;
    
    const grantedBy = getAuthUserId(req);
    // console.log("🚀 ~ createAccessGrant ~ grantedBy:", grantedBy)
    const authPatientProfileId = getAuthPatientProfileId(req);

    if (!grantedBy) {
      return res.status(401).json({
        success: false,
        message: "Authentication user not found.",
      });
    }
    
    // console.log("🚀 ~ createAccessGrant ~ authPatientProfileId:", authPatientProfileId)
    // console.log("🚀 ~ createAccessGrant ~ patientId:", patientId)
    if (String(grantedBy) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "Only the patient can grant access to this record.",
      });
    }
    
    // console.log("🚀 ~ createAccessGrant ~ YYYYYYYYYYYY:", granteeOrganizationId)
    const grant = await grantPatientAccess({
      patientId : authPatientProfileId,
      grantedBy,

      granteeUserId,
      granteeOrganizationId,
      granteeType,

      accessScope,
      category,
      recordId,
      encounterId,

      recordFrom,
      recordTo,

      durationDays,
      expiresAt,

      permissions,
      purpose,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: "Access granted successfully.",
      data: grant,
    });
  } catch (error) {
  console.log("🚀 ~ createAccessGrant ~ error:", error)
    next(error);
  }
};

export const getMyGrantedAccess = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    // console.log("🚀 ~ getMyGrantedAccess ~ patientId:", patientId)

    const userId = getAuthUserId(req);
    const authPatientProfileId = getAuthPatientProfileId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication user not found.",
      });
    }

    if (String(userId) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view access grants for this patient.",
      });
    }

    const grants = await accessGrantModel
      .find({
        patientId: authPatientProfileId,
        grantedBy: userId,
      })
      .populate({
        path: "granteeUserId",
        select: "email organizationName wrOrgId role accountType",
      })
      .populate({
        path: "granteeOrganizationId",
        select: "organizationName organizationType wrOrgId",
      })
      .sort({ createdAt: -1 })
      .lean();
    console.log("🚀 ~ getMyGrantedAccess ~ grants:", grants)

    return res.status(200).json({
      success: true,
      count: grants.length,
      data: grants,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientVitalsForProvider = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const providerUserId = getAuthUserId(req);
    const organizationId = getAuthOrganizationId(req);

    if (!providerUserId) {
      return res.status(401).json({
        success: false,
        message: "Authentication user not found.",
      });
    }

    const grant = await findActiveAccessGrant({
      patientId,
      userId: providerUserId,
      organizationId,
      category: "vitals",
    });

    if (!grant) {
      return res.status(403).json({
        success: false,
        message: "You do not have consent to access this patient's vitals.",
      });
    }

    const filter = buildClinicalAccessFilter({
      grant,
      patientId,
      category: "vitals",
    });

    const vitals = await vitalModel
      .find(filter)
      .sort({ measuredAt: -1 })
      .lean();

    // await accessAuditModel.create({
    //   patientId,
    //   accessedBy: providerUserId,
    //   organizationId,
    //   grantId: grant._id,
    //   category: "vitals",
    //   action: "view",
    //   ipAddress: req.ip,
    //   userAgent: req.headers["user-agent"],
    // });

    return res.status(200).json({
      success: true,
      access: {
        grantId: grant._id,
        accessScope: grant.accessScope,
        permissions: grant.permissions,
        startsAt: grant.startsAt,
        expiresAt: grant.expiresAt,
        recordFrom: grant.recordFrom,
        recordTo: grant.recordTo,
      },
      count: vitals.length,
      data: vitals,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyGrantedAccessAsProvider = async (req, res, next) => {
  try {
    const actor = await resolveActorContext(req.user);

    if (!actor.isOrganizationActor) {
      return res.status(403).json({
        success: false,
        message: "Only provider accounts can view grants issued to them.",
      });
    }

    // Matches how findActiveAccessGrant checks granteeship elsewhere:
    // either this specific staff member, or (if they belong to one)
    // their organization was named as grantee.
    const granteeConditions = [{ granteeUserId: actor.userId }];
    if (actor.organizationId) {
      granteeConditions.push({ granteeOrganizationId: actor.organizationId });
    }

    const grants = await accessGrantModel
      .find({
        status: "active",
        $or: granteeConditions,
      })
      .populate({
        path: "patientId",
        select: "fullName wrId",
      })
      .select(
        "patientId accessScope category permissions startsAt expiresAt status",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: grants.length,
      data: grants,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeAccessGrant = async (req, res, next) => {
  try {
    const { grantId } = req.params;

    const userId = getAuthUserId(req);
    // console.log("🚀 ~ revokeAccessGrant ~ userId:", userId)

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication user not found.",
      });
    }

    const grant = await accessGrantModel.findById(grantId);
    console.log("🚀 ~ revokeAccessGrant ~ grant:", grant)

    if (!grant) {
      return res.status(404).json({
        success: false,
        message: "Access grant not found.",
      });
    }

    if (String(grant.grantedBy) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot revoke this access grant.",
      });
    }

    if (grant.status === "revoked") {
      return res.status(200).json({
        success: true,
        message: "Access grant is already revoked.",
        data: grant,
      });
    }

    grant.status = "revoked";
    grant.revokedAt = new Date();
    grant.revokedBy = userId;

    await grant.save();

    return res.status(200).json({
      success: true,
      message: "Access revoked successfully.",
      data: grant,
    });
  } catch (error) {
    console.log("🚀 ~ revokeAccessGrant ~ error:", error)
  }
};

export const expireOldAccessGrants = async () => {
  const now = new Date();

  await accessGrantModel.updateMany(
    {
      status: "active",
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        status: "expired",
      },
    },
  );
};

const REQUEST_CATEGORIES = [
  "vitals", "medications", "allergies", "diagnoses", "lab-results",
  "radiology", "procedures", "immunizations", "vision",
];

// Provider-side: ask a patient for view access. Creates a `pending` grant
// that gives no access until the patient approves it (the mobile app's
// Consent screen lists pending grants and lets the patient approve or
// reject). findActiveAccessGrant only matches status "active", so a
// pending request cannot be used to read anything.
export const requestPatientAccess = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const actor = await resolveActorContext(req.user);

    if (!actor.isOrganizationActor || !actor.organizationId) {
      return res.status(403).json({
        success: false,
        message: "Only provider accounts can request patient access.",
      });
    }

    const { accessScope, category, durationDays, purpose } = req.body || {};
    if (!["full-record", "category"].includes(accessScope)) {
      return res.status(400).json({
        success: false,
        message: "accessScope must be full-record or category.",
      });
    }
    if (accessScope === "category" && !REQUEST_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid record category.",
      });
    }
    const days = durationDays === undefined ? 30 : Number(durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: "durationDays must be between 1 and 365.",
      });
    }

    const patient = await UserProfile.findById(patientId).lean();
    if (!patient || !patient.accountId) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const organization = await OrganizationProfile.findOne({
      accountId: actor.organizationId,
    }).lean();
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization profile not found.",
      });
    }

    const duplicate = await accessGrantModel.exists({
      patientId: patient._id,
      granteeOrganizationId: organization._id,
      accessScope,
      category: accessScope === "category" ? category : null,
      status: { $in: ["pending", "active"] },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "A request or active grant already exists for this scope.",
      });
    }

    const now = new Date();
    const grant = await accessGrantModel.create({
      patientId: patient._id,
      grantedBy: patient.accountId,
      requestedBy: organization._id,
      granteeType: "organization",
      granteeOrganizationId: organization._id,
      accessScope,
      category: accessScope === "category" ? category : null,
      startsAt: now,
      expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      permissions: { view: true, download: false, reshare: false, write: false },
      purpose: typeof purpose === "string" ? purpose.slice(0, 300) : null,
      status: "pending",
    });

    return res.status(201).json({ success: true, data: grant });
  } catch (error) {
    next(error);
  }
};
