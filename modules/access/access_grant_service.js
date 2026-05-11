import { accessGrantModel } from "./access_grant_model.js";

export const grantFullHistoryAccess = async ({
  patientId,
  grantedBy,
  granteeUserId,
  granteeOrganizationId = null,
  granteeType = "provider",
  durationDays = 7,
  purpose = null,
}) => {
  const now = new Date();

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  const grant = await accessGrantModel.create({
    patientId,
    grantedBy,
    granteeType,
    granteeUserId,
    granteeOrganizationId,
    accessScope: "full-record",

    // full past history
    recordFrom: null,
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

  return grant;
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

const CATEGORY_DATE_FIELD = {
  vitals: "measuredAt",
  medications: "createdAt",
  allergies: "createdAt",
  diagnoses: "createdAt",
  "lab-results": "createdAt",
  procedures: "createdAt",
  immunizations: "createdAt",
};

export const buildClinicalAccessFilter = ({
  grant,
  patientId,
  category,
}) => {
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