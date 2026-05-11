import { grantFullHistoryAccess } from "./access_grant_service.js";
import { accessGrantModel } from "./access_grant_model.js";

export const createFullHistoryGrant = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const {
      granteeUserId,
      granteeOrganizationId,
      granteeType = "provider",
      durationDays = 7,
      purpose,
    } = req.body;

    const grantedBy = req.user._id;

    // Critical: make sure the logged-in user owns this patient profile.
    // Do not skip this.
    if (String(req.user.profileId) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "Only the patient can grant access to this record.",
      });
    }

    const grant = await grantFullHistoryAccess({
      patientId,
      grantedBy,
      granteeUserId,
      granteeOrganizationId,
      granteeType,
      durationDays,
      purpose,
    });

    return res.status(201).json({
      success: true,
      message: "Access granted successfully.",
      data: grant,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyGrantedAccess = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    /**
     * Important:
     * The logged-in patient should only see grants for their own profile.
     */
    if (String(req.user.profileId) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view access grants for this patient.",
      });
    }

    const grants = await accessGrantModel
      .find({
        patientId,
        grantedBy: req.user._id,
      })
      .populate({
        path: "granteeUserId",
        select: "email role accountType",
      })
      .populate({
        path: "granteeOrganizationId",
        select: "organizationName organizationType wrOrgId",
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: grants.length,
      data: grants,
    });
  } catch (error) {
    console.log("🚀 ~ getMyGrantedAccess ~ error:", error);
    next(error);
  }
};

export const getPatientVitalsForProvider = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const providerUserId = req.user._id;

    /**
     * Use the correct organization profile field from your auth payload.
     * Change this if your middleware stores it differently.
     */
    const organizationId =
      req.user.organizationProfileId || req.user.organizationId || null;

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

    await accessAuditModel.create({
      patientId,
      accessedBy: providerUserId,
      organizationId,
      grantId: grant._id,
      category: "vitals",
      action: "view",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

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

export const revokeAccessGrant = async (req, res, next) => {
  try {
    const { grantId } = req.params;

    const grant = await accessGrantModel.findById(grantId);

    if (!grant) {
      return res.status(404).json({
        success: false,
        message: "Access grant not found.",
      });
    }

    if (String(grant.grantedBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You cannot revoke this access grant.",
      });
    }

    grant.status = "revoked";
    grant.revokedAt = new Date();
    grant.revokedBy = req.user._id;

    await grant.save();

    return res.status(200).json({
      success: true,
      message: "Access revoked successfully.",
      data: grant,
    });
  } catch (error) {
    next(error);
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

// import cron from "node-cron";
// import { expireOldAccessGrants } from "./access_grant_jobs.js";

// cron.schedule("*/10 * * * *", async () => {
//   await expireOldAccessGrants();
// });
