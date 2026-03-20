import { getPatientDetailService, getPatientsService, linkPatientService, linkPatientToOrganizationService, searchPatientForOrganizationService } from "./patient_service.js";

export const getPatientsController = async (req, res, next) => {
  try {
    const { search, page, limit, id } = req.query;
    // const organizationId = req.user?.organizationId;
    const organizationId = id;

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
    console.log("🚀 ~ getPatientDetailController ~ patientId:", patientId)
    const organizationId = req.user?.sub;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await getPatientDetailService({
      patientId,
      organizationId,
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
    const { identifier, identifierType, id } = req.validated;
    console.log("🚀 ~ searchPatientForOrganizationController ~ identifier:", identifier)
    // const organizationId = req.user?.organizationId;
    const organizationId = id;

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
    next(error);
  }
};

export const linkPatientToOrganizationController = async (req, res, next) => {
  try {
    const { patientIdentityId, id } = req.validated;
    // const organizationId = req.user?.organizationId;
    const organizationId = id;
    const createdBy = id;

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
