import {
  registerNewPatientService,
  registerPatientService,
  searchProvidersService,
  searchNearbyOrganizationsService,
} from "./organizations_services.js";
import {
  uploadVerificationDocumentService,
  getVerificationStatusService,
  getMyOrganizationService,
  uploadOrganizationLogoService,
  removeOrganizationLogoService,
} from "./verification_services.js";

export const uploadOrganizationLogoController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const profile = await uploadOrganizationLogoService({
      accountId,
      file: req.file,
    });

    return res.status(200).json({
      success: true,
      message: "Logo updated",
      data: { logo: profile.logo },
    });
  } catch (error) {
    next(error);
  }
};

export const removeOrganizationLogoController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    await removeOrganizationLogoService({ accountId });

    return res.status(200).json({
      success: true,
      message: "Logo removed",
      data: { logo: null },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadVerificationDocumentController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const profile = await uploadVerificationDocumentService({
      accountId,
      file: req.file,
    });

    return res.status(200).json({
      success: true,
      message: "Document submitted for review",
      data: {
        verificationStatus: profile.verificationStatus,
        verificationDocumentName: profile.verificationDocumentName,
        verificationDocumentUploadedAt: profile.verificationDocumentUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getVerificationStatusController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const status = await getVerificationStatusService({ accountId });

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

export const registerPatientController = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, gender, dateOfBirth } =
      req.body.newPatientForm;

    const fullName = [firstName, lastName]
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(" ");

    // 🔑 from auth middleware
    const organizationId = req.user?.sub;
    console.log(
      "🚀 ~ registerPatientController ~ organizationId:",
      organizationId,
    );
    const createdBy = req.user?.sub;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    if (!fullName || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        message: "fullName and dateOfBirth are required",
      });
    }

    const result = await registerPatientService({
      fullName,
      gender,
      email,
      phone,
      dateOfBirth,
      organizationId,
      createdBy,
    });

    return res.status(201).json({
      success: true,
      message: result.isNew
        ? "Patient registered successfully"
        : "Patient already exists, linked to organization",
      data: {
        patientId: result.patient._id,
        patientOrganizationId: result.patientOrganization._id,
        isNew: result.isNew,
      },
    });
  } catch (error) {
    console.log("🚀 ~ registerPatientController ~ error:", error);
    next(error);
  }
};

export const registerNewPatientController = async (req, res, next) => {
  try {
    const { fullName, dateOfBirth, gender, phone, email } = req.body;

    const organizationId = req.user?.organizationId;
    const createdBy = req.user?._id;

    if (!fullName || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        message: "fullName and dateOfBirth are required",
      });
    }

    const result = await registerNewPatientService({
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      organizationId,
      createdBy,
    });

    return res.status(201).json({
      success: true,
      message: result.isNew
        ? "New patient registered"
        : "Existing patient matched and linked",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const searchProvidersController = async (req, res, next) => {
  try {
    const result = await searchProvidersService({
      search: req.query.search || "",
      page: req.query.page || 1,
      limit: req.query.limit || 20,
    });
    console.log("🚀 ~ searchProvidersController ~ result:", result)

    return res.status(200).json({
      success: true,
      message: "Care directory fetched successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const searchNearbyOrganizationsController = async (req, res, next) => {
  try {
    const items = await searchNearbyOrganizationsService({
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
    });

    return res.status(200).json({
      success: true,
      message: "Nearby registered facilities fetched successfully",
      items,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyOrganizationController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;
    const profileId = req.user?.profileId;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: "Organization context missing",
      });
    }

    const organization = await getMyOrganizationService({ accountId, profileId });

    return res.status(200).json({
      success: true,
      data: organization,
    });
  } catch (error) {
    next(error);
  }
};
