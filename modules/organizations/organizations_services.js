import { PatientIdentity } from "./patient/patient_identity_model.js";
import { OrganizationProfile } from "./organizations_model.js";
import { PatientOrganization } from "./patient_organization_model.js";


export const createOrganizationProfile = async (payload, session) => {
  const [profile] = await OrganizationProfile.create(
    [
      {
        accountId: payload.accountId,
        wrOrgId: payload.wrOrgId,
        organizationName: payload.organizationName,
        organizationType: payload.organizationType,
        officeAddress: payload.officeAddress || null,
        registrationNumber: payload.registrationNumber || null,
        licenseNumber: payload.licenseNumber || null,
        contactPersonName: payload.contactPersonName || null,
        contactPersonRole: payload.contactPersonRole || null,
      },
    ],
    { session }
  );
  
  return profile;
};




/**
 * Register patient to organization
 */
export const registerPatientService = async ({
  fullName,
  dateOfBirth,
  gender,
  phone,
  email,
  organizationId,
  createdBy,
}) => {
  // 🔍 STEP 1: try to find existing patient
  let patient = await PatientIdentity.findOne({
    $or: [
      { phone: phone || null },
      { email: email || null },
      {
        fullName: new RegExp(`^${fullName}$`, "i"),
      },
    ],
    isMerged: false,
  });

  let isNew = false;

  // 🆕 STEP 2: create if not found
  if (!patient) {
    patient = await PatientIdentity.create({
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      isProvisional: true,
      createdByOrganizationId: organizationId,
    });

    isNew = true;
  }

  // 🔗 STEP 3: link patient to organization
  let patientOrg = await PatientOrganization.findOne({
    patientIdentity: patient._id,
    organizationId,
  });
  
  if (!patientOrg) {
    patientOrg = await PatientOrganization.create({
      patientId: patient._id,
      patientIdentity: patient._id,
      organizationId,
      relationshipType: "registered",
      externalPatientId: generatePatientCode(),
      createdBy,
      firstSeenAt: new Date(),
    });
  } else {
    // update last seen
    patientOrg.lastSeenAt = new Date();
    await patientOrg.save();
  }

  return {
    patient,
    patientOrganization: patientOrg,
    isNew,
  };
};

/**
 * simple hospital patient ID generator
 */
function generatePatientCode() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WR-${random}`;
}



export const registerNewPatientService = async ({
  fullName,
  dateOfBirth,
  gender,
  phone,
  email,
  organizationId,
  createdBy,
}) => {
  // 🔍 Try match existing (important)
  let patient = await PatientIdentity.findOne({
    $or: [
      { phone: phone || null },
      { email: email || null },
      {
        fullName: new RegExp(`^${fullName}$`, "i"),
        dateOfBirth,
      },
    ],
    isMerged: false,
  });

  let isNew = false;

  if (!patient) {
    patient = await PatientIdentity.create({
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      isProvisional: true,
      createdByOrganizationId: organizationId,
    });

    isNew = true;
  }

  // 🔗 Link to organization
  let relation = await PatientOrganization.findOne({
    patientId: patient._id,
    organizationId,
  });

  if (!relation) {
    relation = await PatientOrganization.create({
      patientId: patient._id,
      organizationId,
      relationshipType: "registered",
      externalPatientId: generatePatientCode(),
      createdBy,
    });
  }

  return {
    patient,
    relation,
    isNew,
  };
};




const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const searchProvidersService = async ({
  search = "",
  page = 1,
  limit = 20,
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const searchableTypes = [
    "healthcare_provider",
    "diagnostic",
    "pharmacy",
    "telehealth",
    "individaul_provider", // keep as stored in your DB for now
  ];

  const query = {
    organizationType: { $in: searchableTypes },
    isLicensed: true,
  };

  if (search && search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), "i");

    query.$or = [
      { organizationName: regex },
      { officeAddress: regex },
      { email: regex },
      { phone: regex },
      { contactPersonName: regex },
      { contactPersonRole: regex },
      { wrOrgId: regex },
    ];
  }

  const [items, total] = await Promise.all([
    OrganizationProfile.find()
      .sort({ updatedAt: -1, organizationName: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    OrganizationProfile.countDocuments(query),
  ]);
  console.log("🚀 ~ searchProvidersService ~ items:", items)

  const mapped = items.map((item) => {
    const isIndividualProvider =
      item.organizationType === "individaul_provider";

    return {
      _id: item._id,
      fullName: isIndividualProvider
        ? item.organizationName
        : item.contactPersonName || null,
      organizationName: item.organizationName,
      organizationType: item.organizationType,
      email: item.email || null,
      phone: item.phone || null,
      specialty: item.contactPersonRole || null,
      telemedicineAvailable: item.organizationType === "telehealth",
      organization: {
        _id: item._id,
        name: item.organizationName,
        address: item.officeAddress || null,
      },
    };
  });

  return {
    items: mapped,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
};