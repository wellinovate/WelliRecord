import {
  createShareLink,
  resolveBridgeAccess,
  getBridgeRecordBundle,
  markBridgeLinkUsed,
} from "./bridge_service.js";
import { validateCreateShareLink } from "./bridge_validation.js";
import { UserProfile } from "../users/user_profile_model.js";

const getAuthUserId = (req) => req.user?.sub;
const getAuthPatientProfileId = (req) => req.user?.profileId;

/**
 * POST /api/v1/access-grants/patients/:patientId/access-grants/share-link
 * Authenticated — only the patient can create a share link for themselves.
 */
export const createShareLinkController = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const validation = validateCreateShareLink(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid share link payload",
        errors: validation.errors,
      });
    }

    const { accessScope, category, durationHours, oneTimeUse, purpose } =
      validation.data;

    const grantedBy = getAuthUserId(req);
    const authPatientProfileId = getAuthPatientProfileId(req);

    if (!grantedBy) {
      return res.status(401).json({
        success: false,
        message: "Authentication user not found.",
      });
    }

    if (String(grantedBy) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "Only the patient can create a share link for this record.",
      });
    }

    const grant = await createShareLink({
      patientId: authPatientProfileId,
      grantedBy,
      accessScope,
      category,
      durationHours,
      oneTimeUse,
      purpose,
    });

    const baseUrl = process.env.FRONTEND_URL || "https://www.wellirecord.com";

    return res.status(201).json({
      success: true,
      message: "Share link created.",
      data: {
        grant,
        shareUrl: `${baseUrl}/bridge/${grant.shareToken}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/bridge/:token
 * PUBLIC — no auth. This is the WelliBridge "Temporary Provider Portal":
 * any doctor with the link or QR code, with no WelliRecord account, can
 * view exactly the scoped, time-limited slice of the patient's record without
 * logging in.
 */
export const getSharedRecordController = async (req, res, next) => {
  try {
    const { token } = req.params;

    const access = await resolveBridgeAccess({ token });
    const { grant, filter } = access;

    const bundle = await getBridgeRecordBundle({ grant, filter });

    const patient = await UserProfile.findById(grant.patientId)
      .select("fullName firstName lastName dateOfBirth gender wrId bloodGroup genotype emergencyContacts")
      .lean();

    if (grant.oneTimeUse) {
      await markBridgeLinkUsed(grant._id);
    }

    // Blood group, genotype, and emergency contacts are only disclosed
    // on a full-record share — a category-scoped share (e.g. "just my
    // labs" for a referral) shouldn't also leak this. Emergency Card
    // links are always created with accessScope "full-record" (see
    // requestEmergencyShareLink in EmergencyCardPage.tsx), so this is
    // the boundary that actually matters in practice.
    const isFullRecord = grant.accessScope === "full-record";

    return res.status(200).json({
      success: true,
      data: {
        patient: patient
          ? {
              fullName: patient.fullName,
              wrId: patient.wrId,
              dateOfBirth: patient.dateOfBirth,
              gender: patient.gender,
              bloodGroup: isFullRecord ? patient.bloodGroup : null,
              genotype: isFullRecord ? patient.genotype : null,
              emergencyContacts: isFullRecord ? patient.emergencyContacts : [],
            }
          : null,
        scope: grant.accessScope,
        category: grant.category,
        expiresAt: grant.expiresAt,
        oneTimeUse: grant.oneTimeUse,
        allergies: bundle.allergies,
        medications: bundle.medications,
        labResults: bundle.labResults,
        diagnoses: bundle.diagnoses,
        vitals: bundle.vitals,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }
    next(error);
  }
};
