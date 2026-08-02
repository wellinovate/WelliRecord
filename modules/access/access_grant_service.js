import mongoose from "mongoose";
import { accessGrantModel } from "./access_grant_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

// Builds the right Mongo query for whichever ID format was submitted.
// Patients only ever see the WR-XXXX-XXXX form (wrOrgId), so that has
// to resolve just as reliably as a raw ObjectId typed by an internal
// tool or copied from an API response.
const buildIdLookup = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? { _id: value } : { wrOrgId: value };

const validateGranteeExists = async ({
  granteeType,
  granteeUserId,
  granteeOrganizationId,
}) => {
  if (granteeType === "provider") {
    const provider = await OrganizationProfile.findOne({
      ...buildIdLookup(granteeUserId),
      organizationType: "individaul_provider",
    });

    if (!provider) {
      const error = new Error("Provider account not found.");
      console.log("🚀 ~ validateGranteeExists ~ error:", error)
      error.statusCode = 404;
      throw error;
    }

    return provider;
  }

  if (granteeType === "organization") {
    const organization = await OrganizationProfile.findOne(
      buildIdLookup(granteeOrganizationId),
    );

    if (!organization) {
      const error = new Error("Organization account not found.");
      console.log("🚀 ~ validateGranteeExists ~ error:", error)
      error.statusCode = 404;
      throw error;
    }

    return organization;
  }

  const error = new Error("Unsupported grantee type.");
  console.log("🚀 ~ validateGranteeExists ~ error:", error)
  error.statusCode = 400;
  throw error;
};

export const grantPatientAccess = async ({
  patientId,
  grantedBy,

  granteeUserId,
  granteeOrganizationId = null,
  granteeType = "provider",

  accessScope,
  category = null,
  recordId = null,
  encounterId = null,

  recordFrom = null,
  recordTo = null,

  durationDays = 7,
  expiresAt = null,

  permissions = {},
  purpose = null,
  notes = null,
}) => {
  console.log("🚀 ~ grantPatientAccess ~ granteeOrganizationId:", granteeOrganizationId)
  const now = new Date();

  try {
    const grantee = await validateGranteeExists({
      granteeType,
      granteeUserId,
      granteeOrganizationId,
    });

    let finalExpiresAt = expiresAt ? new Date(expiresAt) : null;

    if (!finalExpiresAt && durationDays) {
      finalExpiresAt = new Date(now);
      finalExpiresAt.setDate(finalExpiresAt.getDate() + Number(durationDays));
    }

    const safePermissions = {
      view: permissions.view ?? true,
      download: permissions.download ?? false,
      reshare: permissions.reshare ?? false,
      write: permissions.write ?? false,
    };
    console.log("🚀 ~ grantPatientAccess ~ safePermissions:", safePermissions)

    const grant = await accessGrantModel.create({
      patientId,
      grantedBy,

      granteeType,

      // Always the resolved document's real _id — never the raw string
      // the caller sent. That string might have been a wrOrgId, which
      // is not a valid value to store on a ref field.
      granteeUserId: granteeType === "provider" ? grantee._id : null,

      granteeOrganizationId:
        granteeType === "organization" ? grantee._id : null,

      accessScope,
      category,
      recordId,
      encounterId,

      recordFrom: recordFrom ? new Date(recordFrom) : null,
      recordTo: recordTo ? new Date(recordTo) : null,

      startsAt: now,
      expiresAt: finalExpiresAt,

      permissions: safePermissions,

      purpose,
      notes,

      status: "active",
      reviewedAt: now,
    });

    return grant;
  } catch (error) {
    console.log("🚀 ~ grantPatientAccess ~ error:", error);
  }
};

export const grantRecentHistoryAccess = async ({
  patientId,
  grantedBy,
  granteeUserId,
  durationDays = 7,
  monthsBack = 12,
  purpose = null,
}) => {
  const now = new Date();

  const recordFrom = new Date(now);
  recordFrom.setMonth(recordFrom.getMonth() - monthsBack);

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  return accessGrantModel.create({
    patientId,
    grantedBy,
    granteeType: "provider",
    granteeUserId,
    accessScope: "full-record",

    // only records within this history range
    recordFrom,
    recordTo: null,

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
};

export const findActiveAccessGrant = async ({
  patientId,
  userId,
  organizationId = null,
  category = null,
  recordId = null,
  encounterId = null,
}) => {
  const now = new Date();

  const granteeConditions = [
    {
      granteeUserId: userId,
    },
  ];

  if (organizationId) {
    granteeConditions.push({
      granteeOrganizationId: organizationId,
    });
  }

  const scopeConditions = [
    {
      accessScope: "full-record",
    },
  ];

  if (category) {
    scopeConditions.push({
      accessScope: "category",
      category,
    });
  }

  if (recordId) {
    scopeConditions.push({
      accessScope: "single-record",
      recordId,
    });
  }

  if (encounterId) {
    scopeConditions.push({
      accessScope: "encounter",
      encounterId,
    });
  }

  const grant = await accessGrantModel.findOne({
    patientId,
    status: "active",

    $or: granteeConditions,

    startsAt: {
      $lte: now,
    },

    $and: [
      {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      {
        $or: scopeConditions,
      },
    ],

    "permissions.view": true,
  });

  return grant;
};


export const resolveConsentAccess = async ({
  actor,
  authUser,
  patientId,
  category,
  baseFilter = {},
}) => {
  
  
  /**
   * SELF ACCESS
  */
 if (actor.isPatientActor) {
    if(actor.userId.toString() !== authUser.sub.toString()) {
      const error = new Error("Unauthorized: Actor user ID does not match authenticated user.");
      console.log("🚀 ~ resolveConsentAccess ~ error:", error)
      error.statusCode = 403;
      throw error;
    }
    return {
      mode: "self",

      permissions: {
        view: true,
        download: true,
      },

      filter: {
        ...baseFilter,
        patientId,
      },
    };
  }

  /**
   * ORGANIZATION ACCESS
   */
  if (actor.isOrganizationActor) {
    /**
     * 1. Check explicit patient consent
     */
    const grant = await findActiveAccessGrant({
      patientId,
      organizationId: actor.organizationId,
      userId: actor.userId,
      category,
    });

    /**
     * EXPLICIT CONSENT ACCESS
     */
    if (grant) {
      return {
        mode: "consent",

        grant,

        permissions: grant.permissions,

        filter: {
          ...baseFilter,

          ...buildClinicalAccessFilter({
            grant,
            patientId,
            category,
          }),
        },
      };
    }

    /**
     * 2. Fallback to implicit operational access
     *
     * Org can only see records created by itself.
     */
    return {
      mode: "operational",

      grant: null,

      permissions: {
        view: true,
        download: false,
      },

      filter: {
        ...baseFilter,

        patientId,

        $or: [
          {
            organizationId: actor.organizationId,
          },
          {
            providerId: actor.userId,
          },
        ],
      },
    };
  }

  const error = new Error("Unauthorized");
  error.statusCode = 403;
  throw error;
};

const CATEGORY_DATE_FIELD = {
  vitals: "measuredAt",
  medications: "createdAt",
  allergies: "createdAt",
  diagnoses: "createdAt",
  "lab-results": "createdAt",
  procedures: "createdAt",
  immunizations: "createdAt",
};

export const buildClinicalAccessFilter = ({ grant, patientId, category }) => {
  const dateField = CATEGORY_DATE_FIELD[category] || "createdAt";

  const filter = {
    patientId,
    recordStatus: { $ne: "entered-in-error" },
  };

  if (grant.accessScope === "encounter") {
    filter.encounterId = grant.encounterId;
  }

  if (grant.accessScope === "single-record") {
    filter._id = grant.recordId;
  }

  const dateRange = {};

  if (grant.recordFrom) {
    dateRange.$gte = grant.recordFrom;
  }

  if (grant.recordTo) {
    dateRange.$lte = grant.recordTo;
  }

  if (Object.keys(dateRange).length > 0) {
    filter[dateField] = dateRange;
  }

  return filter;
};
