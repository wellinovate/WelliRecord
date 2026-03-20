import {
  registerNewPatientService,
  registerPatientService,
} from "./organizations_services.js";

export const registerPatientController = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, gender, dateOfBirth } =
      req.body.newPatientForm;

    const fullName = [firstName, lastName]
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(" ");

    // 🔐 from auth middleware
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
