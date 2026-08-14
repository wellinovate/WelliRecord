import {
  getPatientDetailService,
  getPatientsService,
  linkPatientService,
  linkPatientToOrganizationService,
  searchPatientForOrganizationService,
} from "./patient_service.js";
import { resolveActorContext } from "../../vitals/vital_service.js";

export const getPatientsController = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;

    // BUGFIX: this read req.user?.organizationId directly, which the
    // JWT only ever sets for the account that owns the organization
    // (signAccessToken, shared/utils/helper.js) — every staff member
    // (doctor, nurse, ...) got "Organization context missing" and
    // could never list patients at all. Same underlying issue as
    // resolveActorContext's classification bug; reusing that resolver
    // here instead of a third copy of the same fix.
    const actor = await resolveActorContext(req.user);
    const organizationId = actor.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const result = await getPatientsService({
      organizationId,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });

    return res.status(200).json({
      success: true,
      message: "Patients fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientDetailController = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { emergencyAccess, emergencyReason } = req.query;
    const organizationId = req.user?.sub;
    const authUser = req.user;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await getPatientDetailService({
      patientId,
      organizationId,
      authUser,
      emergencyAccess: emergencyAccess === "true" || emergencyAccess === true,
      emergencyReason: emergencyReason || null,
    });

    return res.status(200).json({
      success: true,
      message: "Patient fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const linkPatientController = async (req, res, next) => {
  try {
    const { patientIdentityId } = req.body;

    const organizationId = req.user?.organizationId;
    const createdBy = req.user?._id;

    if (!patientIdentityId) {
      return res.status(400).json({
        success: false,
        message: "patientIdentityId is required",
      });
    }

    const result = await linkPatientService({
      patientIdentityId,
      organizationId,
      createdBy,
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyLinked
        ? "Patient already linked"
        : "Patient linked successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const searchPatientForOrganizationController = async (
  req,
  res,
  next,
) => {
  try {
    const { identifier, identifierType } = req.validated;
    
    // const organizationId = req.user?.organizationId;
    const organizationId = req.user.sub;
    console.log("🚀 ~ searchPatientForOrganizationController ~ req.user:", req.user)
    console.log("🚀 ~ searchPatientForOrganizationController ~ organizationId:", organizationId)

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await searchPatientForOrganizationService({
      identifier,
      identifierType,
      organizationId,
    });

    return res.status(200).json({
      success: true,
      message: "Patient found",
      data: result,
    });
  } catch (error) {
    console.log("🚀 ~ searchPatientForOrganizationController ~ error:", error);
    next(error);
  }
};

export const searchDoctorForOrganizationController = async (
  req,
  res,
  next,
) => {
  try {
    const { identifier, identifierType } = req.validated;
    
    // const organizationId = req.user?.organizationId;
    const organizationId = req.user.sub;
    console.log("🚀 ~ searchPatientForOrganizationController ~ organizationId:", organizationId)

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await searchPatientForOrganizationService({
      identifier,
      identifierType,
      organizationId,
    });

    return res.status(200).json({
      success: true,
      message: "Patient found",
      data: result,
    });
  } catch (error) {
    console.log("🚀 ~ searchPatientForOrganizationController ~ error:", error);
    next(error);
  }
};

export const linkPatientToOrganizationController = async (req, res, next) => {
  try {
    const { patientIdentityId } = req.validated;
    // const organizationId = req.user?.organizationId;
    const organizationId = req.user.organizationId;
    const createdBy = req.user?.sub;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await linkPatientToOrganizationService({
      patientIdentityId,
      organizationId,
      createdBy,
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyLinked
        ? "Patient already linked"
        : "Patient linked successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
