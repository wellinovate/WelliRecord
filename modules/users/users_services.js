import { generateUsername } from "../../shared/utils/generateUsername.js";
import { UserProfile } from "./user_profile_model.js";

import mongoose from "mongoose";

import { vitalModel } from "../vitals/vitals_model.js";
import { diagnosisModel } from "../diagnoses/diagnoses_model.js";
import { medicationModel } from "../medications/medications_model.js";
import { procedureModel } from "../procedure/procedure_model.js";
import { immunizationModel } from "../immunizations/immunizations_model.js";
import { labResultModel } from "../lab/lab_model.js";
import { allergyModel } from "../allergies/allergies_model.js";
import { generateWelliRecordId } from "../../shared/utils/helper.js";

export const createUserProfile = async (payload, session) => {
  console.log("🚀 ~ createUserProfile ~ profile:", payload);

  const username = payload.username || generateUsername(payload.email);
  const [profile] = await UserProfile.create(
    [
      {
        accountId: payload.accountId,
        fullName: payload.fullName,
        username: username || null,
        firstName: payload.firstName || "",
        middleName: payload.middleName || "",
        lastName: payload.lastName || "",
        email: payload.email,
        phone: payload.phone || null,
        homeAddress: payload.homeAddress,
        gender: payload.gender,
      },
    ],
    { session },
  );

  return profile;
};

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid patientId");
  }
  return new mongoose.Types.ObjectId(id);
}

function buildBaseMatch(patientId) {
  return {
    patientId: toObjectId(patientId),
  };
}

async function getPagedRecords(Model, patientId, options, sort) {
  const match = buildBaseMatch(patientId);

  const [records, total] = await Promise.all([
    Model.findById(patientId)
      .sort(sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean(),
    Model.countDocuments(match),
  ]);
  console.log("🚀 ~ getPagedRecords ~ records:", records);

  return {
    total,
    records,
  };
}

async function getCategorySummary(Model, patientId, category, metricBuilder) {
  const match = buildBaseMatch(patientId);

  const [total, latestRecord] = await Promise.all([
    Model.countDocuments(match),
    Model.findOne(match)
      .sort({ updatedAt: -1, recordedAt: -1, createdAt: -1 })
      .lean(),
  ]);

  return {
    category,
    recordCount: total,
    lastUpdatedAt:
      latestRecord?.updatedAt ||
      latestRecord?.recordedAt ||
      latestRecord?.createdAt ||
      null,
    summaryMetric: metricBuilder(latestRecord, total),
  };
}

export async function getMedicalHistorySummary(patientId) {
  console.log("🚀 ~ getMedicalHistorySummary ~ patientId:", patientId);
  const [
    vitals,
    diagnoses,
    medications,
    procedures,
    immunizations,
    labResults,
    allergies,
  ] = await Promise.all([
    getCategorySummary(vitalModel, patientId, "vitals", (latest) => {
      if (!latest) return null;

      return {
        latestBloodPressure:
          latest.bloodPressure?.systolic && latest.bloodPressure?.diastolic
            ? `${latest.bloodPressure.systolic}/${latest.bloodPressure.diastolic} mmHg`
            : null,
        latestHeartRate: latest.heartRate ?? null,
      };
    }),

    getCategorySummary(
      diagnosisModel,
      patientId,
      "diagnoses",
      (latest, total) => {
        if (!latest) {
          return { activeCount: 0 };
        }

        return {
          activeCount: total,
          latestDiagnosis: latest.diagnosisName || latest.conditionName || null,
        };
      },
    ),

    getCategorySummary(
      medicationModel,
      patientId,
      "medications",
      (latest, total) => {
        if (!latest) {
          return { activeCount: 0 };
        }

        return {
          activeCount: total,
          latestMedication: latest.medicationName || latest.drugName || null,
        };
      },
    ),

    getCategorySummary(
      procedureModel,
      patientId,
      "procedures",
      (latest, total) => {
        if (!latest) {
          return { totalProcedures: 0 };
        }

        return {
          totalProcedures: total,
          latestProcedure: latest.procedureName || latest.title || null,
        };
      },
    ),

    getCategorySummary(
      immunizationModel,
      patientId,
      "immunizations",
      (latest, total) => {
        if (!latest) {
          return { totalImmunizations: 0 };
        }

        return {
          totalImmunizations: total,
          latestVaccine: latest.vaccineName || null,
        };
      },
    ),

    getCategorySummary(
      labResultModel,
      patientId,
      "lab_results",
      (latest, total) => {
        if (!latest) {
          return { totalLabResults: 0 };
        }

        return {
          totalLabResults: total,
          latestTestName: latest.testName || latest.labName || null,
        };
      },
    ),

    getCategorySummary(
      allergyModel,
      patientId,
      "allergies",
      (latest, total) => {
        if (!latest) {
          return { totalAllergies: 0 };
        }

        return {
          totalAllergies: total,
          latestAllergen: latest.allergen || latest.substance || null,
        };
      },
    ),
  ]);
  console.log("🚀 ~ getMedicalHistorySummary ~ vitals:", vitals);

  return {
    vitals,
    diagnoses,
    medications,
    procedures,
    immunizations,
    lab_results: labResults,
    allergies,
  };
}

export async function getPatientVitals(patientId, options) {
  return getPagedRecords(vitalModel, patientId, options);
}

export async function getPatientDiagnoses(patientId, options) {
  return getPagedRecords(diagnosisModel, patientId, options);
}

export async function getPatientMedications(patientId, options) {
  return getPagedRecords(medicationModel, patientId, options);
}

export async function getPatientProcedures(patientId, options) {
  return getPagedRecords(procedureModel, patientId, options);
}

export async function getPatientImmunizations(patientId, options) {
  return getPagedRecords(immunizationModel, patientId, options);
}

export async function getPatientLabResults(patientId, options) {
  return getPagedRecords(labResultModel, patientId, options);
}

export async function getPatientAllergies(patientId, options) {
  return getPagedRecords(allergyModel, patientId, options);
}

// services/userProfile.service.ts

export const getUserProfile = async (accountId) => {
  try {
    const profile = await UserProfile.findOne({
      accountId: accountId,
    }).populate("accountId", "email"); // optional
    // .lean();
    console.log("🚀 ~ getUserProfile ~ profile:", profile);

    if (profile && !profile.wrId) {
      profile.wrId = generateWelliRecordId();
      console.log("🚀 ~ getUserProfile ~ profile.wrId:", profile.wrId);
      await profile.save();
      console.log(profile);
    }

    if (!profile) {
      throw new Error("Profile not found");
    }

    return {
      id: profile._id,
      wrId: profile.wrId,
      fullName: profile.fullName,
      firstName: profile.firstName,
      middleName: profile.middleName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      gender: profile.gender,
      dateOfBirth: profile.dateOfBirth,
      avatar: profile.logo, // rename here
      emergencyContacts: profile.emergencyContacts,
      isLicensed: profile.isLicensed,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    console.log("🚀 ~ getUserProfile ~ error:", error);
  }
};

const sanitizeString = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed;
};

const sanitizeNullableString = (value) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim();
};

export const updateUserProfileService = async ({ userId, payload }) => {
  console.log("🚀 ~ updateUserProfileService ~ payload:", payload)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user id");
  }

  const profile = await UserProfile.findOne({ accountId: userId });

  if (!profile) {
    throw new Error("Profile not found");
  }

  const updateData = {};

  if ("phone" in payload) {
    if (profile.phone) {
      throw new Error("Phone cannot be changed once set");
    }

    const phone = sanitizeString(payload.phone);
    if (!phone) {
      throw new Error("Phone is required");
    }

    updateData.phone = phone;
  }

  if ("gender" in payload) {
    if (profile.gender) {
      throw new Error("Gender cannot be changed once set");
    }

    const allowedGenders = ["Male", "Female", "Other"];
    const gender = sanitizeString(payload.gender);

    if (!gender || !allowedGenders.includes(gender)) {
      throw new Error("Invalid gender");
    }

    updateData.gender = gender;
  }

  // Editable fields only
  if ("avatar" in payload) {
    updateData.avatar = sanitizeNullableString(payload.avatar);
  }

  if ("dateOfBirth" in payload) {
    if (payload.dateOfBirth === null || payload.dateOfBirth === "") {
      updateData.dateOfBirth = null;
    } else {
      const parsed = new Date(payload.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid dateOfBirth");
      }
      updateData.dateOfBirth = parsed;
    }
  }

  if ("firstName" in payload) {
    updateData.firstName = sanitizeString(payload.firstName) || "";
  }

  if ("middleName" in payload) {
    updateData.middleName = sanitizeString(payload.middleName) || "";
  }

  if ("lastName" in payload) {
    updateData.lastName = sanitizeString(payload.lastName) || "";
  }

  if ("fullName" in payload) {
    const fullName = sanitizeString(payload.fullName) || "";
    if (fullName.length < 2) {
      throw new Error("Full name must be at least 2 characters");
    }
    updateData.fullName = fullName;
  }

  if ("emergencyContacts" in payload) {
    if (!Array.isArray(payload.emergencyContacts)) {
      throw new Error("Emergency contacts must be an array");
    }

    updateData.emergencyContacts = payload.emergencyContacts.map((contact) => {
      const name = sanitizeString(contact.name) || "";
      const relationship = sanitizeString(contact.relationship) || "";
      const phone = sanitizeString(contact.phone) || "";

      if (!name) {
        throw new Error("Each emergency contact must have a name");
      }

      if (!phone) {
        throw new Error("Each emergency contact must have a phone number");
      }

      return {
        name,
        relationship,
        phone,
      };
    });
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No valid fields provided for update");
  }

  const updatedProfile = await UserProfile.findByIdAndUpdate(
    profile._id,
    { $set: updateData },
    { new: true, runValidators: true },
  ).lean();

  return updatedProfile;
};
