import { addDoctorToOrganizationService, getDoctorsService, searchDoctorForOrganizationService } from "./membership_services.js";

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

    const result = await searchDoctorForOrganizationService({
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

export const addDoctorToOrganizationController = async (req, res, next) => {
    try {
      const { doctorIdentityId } = req.validated;
    // const organizationId = req.user?.organizationId;
    const organizationId = req.user.sub;
    const createdBy = req.user?.sub;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Organization context is required",
      });
    }

    const result = await addDoctorToOrganizationService({
      doctorIdentityId,
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

export const getDoctorsController = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const organizationId = req.user?.sub;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const result = await getDoctorsService({
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