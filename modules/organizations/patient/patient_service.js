import mongoose from "mongoose";
import {
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
} from "../../../shared/utils/helper.js";
import { Account } from "../../accounts/account_model.js";
import { Encounter } from "../../encounter/encounter_model.js";
import { UserProfile } from "../../users/user_profile_model.js";
import { PatientOrganization } from "../patient_organization_model.js";

export const getPatientsService = async ({
  organizationId,
  search,
  page = 1,
  limit = 10,
}) => {
  const skip = (page - 1) * limit;

  // 🔍 Build search filter
  let patientFilter = {};

  if (search) {
    patientFilter = {
      $or: [
        { fullName: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ],
    };
  }

  // 🔗 Get patient-organization relationships
  const relations = await PatientOrganization.find({
    organizationId,
    status: "active",
  })
    .populate({
      path: "patientId",
      select: "fullName dateOfBirth gender phone email",
    })
    .populate({
      path: "patientIdentity",
      select: "fullName dateOfBirth gender phone email",
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  // console.log("🚀 ~ getPatientsService ~ relations:", relations);

  const filtered = relations.filter((r) => r.patientId || r.patientIdentity);

  const normalizedPatients = filtered.map((r) => {
    const patient = r.patientId || r.patientIdentity;

    return {
      relation: r,
      patient,
      patientRefId: patient._id,
    };
  });

  const patientIds = normalizedPatients.map((item) => item.patientRefId);

  const lastEncounters = await Encounter.aggregate([
    {
      $match: {
        patientId: { $in: patientIds },
        organizationId,
      },
    },
    {
      $sort: { startedAt: -1 },
    },
    {
      $group: {
        _id: "$patientId",
        lastVisit: { $first: "$startedAt" },
        status: { $first: "$status" },
      },
    },
  ]);

  const encounterMap = {};
  lastEncounters.forEach((e) => {
    encounterMap[e._id.toString()] = e;
  });

  const patients = normalizedPatients.map(({ relation, patient }) => {
    const encounter = encounterMap[patient._id.toString()];

    return {
      patientId: patient._id,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,

      externalPatientId: relation.externalPatientId,
      relationshipType: relation.relationshipType,
      lastSeenAt: relation.lastSeenAt,

      source: relation.patientId ? "patientId" : "patientIdentity",

      lastVisit: encounter?.lastVisit || null,
      encounterStatus: encounter?.status || null,
    };
  });

  const total = await PatientOrganization.countDocuments({
    organizationId,
    status: "active",
  });

  return {
    patients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getPatientDetailService = async ({
  patientId,
  organizationId,
}) => {
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    const error = new Error("Invalid patientId");
    error.statusCode = 400;
    throw error;
  }

  const relationByPatientId = await PatientOrganization.findOne({
    patientId,
    organizationId,
    status: "active",
  })
    .populate({
      path: "patientId",
      select:
        "fullName firstName lastName dateOfBirth accountId gender phone email wrId",
      populate: {
        path: "accountId",
        select: "email fullName phone gender createdAt",
      },
    })
    .lean();
  console.log("🚀 ~ getPatientDetailService ~ relationByPatientId:", relationByPatientId)

  const relationByPatientIdentity = await PatientOrganization.findOne({
    patientIdentity: patientId,
    organizationId,
    status: "active",
  })
    .populate({
      path: "patientIdentity",
      select: "fullName firstName lastName dateOfBirth gender phone email wrId",
    })
    .lean();

  const patient =
    relationByPatientId?.patientId ||
    relationByPatientIdentity?.patientIdentity;

  const relation = relationByPatientId || relationByPatientIdentity;

  if (!relation) {
    const error = new Error("Patient not found for this organization");
    error.statusCode = 404;
    throw error;
  }

  if (!patient) {
    const error = new Error("Patient record is missing");
    error.statusCode = 404;
    throw error;
  }

  return {
    patientIdentityId: patient._id,
    wrId: patient.wrId || null,
    fullName:
      patient.fullName ||
      `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
    dateOfBirth: patient.dateOfBirth || null,
    gender: patient.gender || null,
    phone: patient.phone || patient.accountId.phone,
    email: patient.email || null,
    registered: patient.accountId.createdAt,

    relationship: {
      id: relation._id,
      relationshipType: relation.relationshipType,
      externalPatientId: relation.externalPatientId,
      status: relation.status,
      firstSeenAt: relation.firstSeenAt,
      lastSeenAt: relation.lastSeenAt,
      createdAt: relation.createdAt,
      updatedAt: relation.updatedAt,
    },
  };
};

export const linkPatientService = async ({
  patientIdentityId,
  organizationId,
  createdBy,
}) => {
  // 🔍 Ensure patient exists
  const patient = await PatientOrganization.findById(patientIdentityId);

  if (!patient) {
    throw new Error("Patient not found");
  }

  // 🔗 Check if already linked
  let relation = await PatientOrganization.findOne({
    patientId: patient._id,
    organizationId,
  });

  if (relation) {
    return {
      patient,
      relation,
      alreadyLinked: true,
    };
  }

  // 🆕 Create relationship
  relation = await PatientOrganization.create({
    patientId: patient._id,
    organizationId,
    relationshipType: "registered",
    externalPatientId: generatePatientCode(),
    createdBy,
  });

  return {
    patient,
    relation,
    alreadyLinked: false,
  };
};

function generatePatientCode() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WR-${random}`;
}

export const searchPatientForOrganizationService = async ({
  identifier,
  identifierType,
  organizationId,
}) => {
  let patient = null;
  const value = String(identifier || "").trim();

  if (identifierType === "wrId") {
    patient = await UserProfile.findOne({ wrId: value });
  }

  if (identifierType === "email") {
    console.log(
      "🚀 ~ searchPatientForOrganizationService ~ identifierType:",
      identifierType,
    );
    patient = await UserProfile.findOne({
      email: normalizeEmail(value),
    });
    console.log("🚀 ~ searchPatientForOrganizationService ~ patient:", patient);
  }

  if (identifierType === "phone") {
    patient = await UserProfile.findOne({
      phone: normalizePhone(value),
    });
  }

  // if (identifierType === "qr") {
  //   const parsed = parsePatientQrPayload(value);

  //   if (parsed?.wrId) {
  //     patient = await PatientIdentity.findOne({ wrId: parsed.wrId });
  //   }
  // }

  if (!patient) {
    const error = new Error("Patient not found");
    error.statusCode = 404;
    throw error;
  }

  const existingLink = await PatientOrganization.findOne({
    patientId: patient._id,
    organizationId,
  });

  return {
    patientIdentityId: patient._id,
    wrId: patient.wrId || null,
    fullName:
      patient.fullName ||
      `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
    dateOfBirth: patient.dateOfBirth || null,
    gender: patient.gender || null,
    maskedEmail: maskEmail(patient.email),
    maskedPhone: maskPhone(patient.phone),
    alreadyLinked: Boolean(existingLink),
  };
};

export const linkPatientToOrganizationService = async ({
  patientIdentityId,
  organizationId,
  createdBy,
}) => {
  const patient = await UserProfile.findById(patientIdentityId);
  console.log("🚀 ~ linkPatientToOrganizationService ~ patient:", patient);

  if (!patient) {
    const error = new Error("Patient not found");
    error.statusCode = 404;
    throw error;
  }

  let relation = await PatientOrganization.findOne({
    patientId: patient._id,
    organizationId,
  });
  console.log("🚀 ~ linkPatientToOrganizationService ~ relation:", relation);

  if (relation) {
    return {
      patientIdentityId: patient._id,
      organizationPatientId: relation._id,
      externalPatientId: relation.externalPatientId,
      alreadyLinked: true,
    };
  }

  relation = await PatientOrganization.create({
    patientId: patient._id,
    organizationId,
    relationshipType: "registered",
    externalPatientId: generatePatientCode(),
    createdBy,
  });
  console.log("🚀 ~ linkPatientToOrganizationService ~ relation:", relation);

  return {
    patientIdentityId: patient._id,
    organizationPatientId: relation._id,
    externalPatientId: relation.externalPatientId,
    alreadyLinked: false,
  };
};
