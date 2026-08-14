import { generateUsername } from "../../shared/utils/generateUsername.js";
import { UserProfile } from "./user_profile_model.js";
import { Account } from "../accounts/account_model.js";
import { performance } from "node:perf_hooks";
import cloudinary from "../../shared/config/cloudinary.js";

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

function buildBaseMatch(patientObjectId) {
  return {
    patientId: patientObjectId,
  };
}

async function getPagedRecords(
  Model,
  patientObjectId,
  options,
  sort = { createdAt: -1 },
) {
  const match = buildBaseMatch(patientObjectId);

  const [records, total] = await Promise.all([
    Model.find(match).sort(sort).skip(options.skip).limit(options.limit).lean(),

    Model.countDocuments(match),
  ]);

  return {
    total,
    records,
  };
}

async function getCategorySummary({
  Model,
  patientObjectId,
  category,
  metricBuilder,
  select = "_id createdAt updatedAt recordedAt",
  sort = { updatedAt: -1, recordedAt: -1, createdAt: -1 },
  requestId,
}) {
  const start = performance.now();

  const match = { patientId: patientObjectId };

  const [total, latestRecord] = await Promise.all([
    Model.countDocuments(match),
    Model.findOne(match).sort(sort).select(select).lean(),
  ]);

  console.log(`⏱ SUMMARY ${category}:`, {
    requestId,
    durationMs: Number((performance.now() - start).toFixed(2)),
    total,
  });

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

export async function getMedicalHistorySummary(patientId, options = {}) {
  const { requestId } = options;
  const totalStart = performance.now();

  const patientObjectId = toObjectId(patientId);

  const [
    vitals,
    diagnoses,
    medications,
    procedures,
    immunizations,
    labResults,
    allergies,
  ] = await Promise.all([
    getCategorySummary({
      Model: vitalModel,
      patientObjectId,
      category: "vitals",
      requestId,
      select: "_id bloodPressure heartRate createdAt updatedAt recordedAt",
      metricBuilder: (latest) => {
        if (!latest) return null;

        return {
          latestBloodPressure:
            latest.bloodPressure?.systolic && latest.bloodPressure?.diastolic
              ? `${latest.bloodPressure.systolic}/${latest.bloodPressure.diastolic} mmHg`
              : null,
          latestHeartRate: latest.heartRate ?? null,
        };
      },
    }),

    getCategorySummary({
      Model: diagnosisModel,
      patientObjectId,
      category: "diagnoses",
      requestId,
      select:
        "_id diagnosisName conditionName status createdAt updatedAt recordedAt",
      metricBuilder: (latest, total) => {
        return {
          activeCount: total,
          latestDiagnosis:
            latest?.diagnosisName || latest?.conditionName || null,
        };
      },
    }),

    getCategorySummary({
      Model: medicationModel,
      patientObjectId,
      category: "medications",
      requestId,
      select:
        "_id medicationName drugName status createdAt updatedAt recordedAt",
      metricBuilder: (latest, total) => {
        return {
          activeCount: total,
          latestMedication: latest?.medicationName || latest?.drugName || null,
        };
      },
    }),

    getCategorySummary({
      Model: procedureModel,
      patientObjectId,
      category: "procedures",
      requestId,
      select:
        "_id procedureName title performedAt createdAt updatedAt recordedAt",
      sort: { performedAt: -1, updatedAt: -1, createdAt: -1 },
      metricBuilder: (latest, total) => {
        return {
          totalProcedures: total,
          latestProcedure: latest?.procedureName || latest?.title || null,
        };
      },
    }),

    getCategorySummary({
      Model: immunizationModel,
      patientObjectId,
      category: "immunizations",
      requestId,
      select: "_id vaccineName dateGiven createdAt updatedAt recordedAt",
      sort: { dateGiven: -1, updatedAt: -1, createdAt: -1 },
      metricBuilder: (latest, total) => {
        return {
          totalImmunizations: total,
          latestVaccine: latest?.vaccineName || null,
        };
      },
    }),

    getCategorySummary({
      Model: labResultModel,
      patientObjectId,
      category: "lab_results",
      requestId,

      select: "_id testName labName resultDate createdAt updatedAt recordedAt",
      sort: { resultDate: -1, updatedAt: -1, createdAt: -1 },
      metricBuilder: (latest, total) => {
        return {
          totalLabResults: total,
          latestTestName: latest?.testName || latest?.labName || null,
        };
      },
    }),

    getCategorySummary({
      Model: allergyModel,
      patientObjectId,
      category: "allergies",
      requestId,

      select: "_id allergen substance severity createdAt updatedAt recordedAt",
      metricBuilder: (latest, total) => {
        return {
          totalAllergies: total,
          latestAllergen: latest?.allergen || latest?.substance || null,
        };
      },
    }),
  ]);

  console.log("⏱ SUMMARY service total:", {
    durationMs: Number((performance.now() - totalStart).toFixed(2)),
  });

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

// Fields returned as-is from the UserProfile document. Kept as one
// list so a field added to the schema only needs to be added here to
// become visible through this endpoint, instead of also needing a
// matching line inside a hand-written return object that's easy to
// forget (this is how `homeAddress` ended up collected at signup but
// never returned here — see updateUserProfileService for the same
// field on the write side).
const READABLE_PROFILE_FIELDS = [
  "wrId",
  "fullName",
  "firstName",
  "middleName",
  "lastName",
  "email",
  "phone",
  "gender",
  "dateOfBirth",
  "homeAddress",
  "avatar",
  "emergencyContacts",
  "notificationPreferences",
  "bloodGroup",
  "genotype",
  "confirmedNone",
  "isLicensed",
  "createdAt",
  "updatedAt",
];

export const getUserProfile = async (accountId) => {
  try {
    const account = await Account.findById(accountId).select("email isVerified");

    const profile = await UserProfile.findOne({
      accountId: accountId,
    });

    if (profile && !profile.wrId) {
      profile.wrId = generateWelliRecordId();
      await profile.save();
    }

    if (!profile) {
      return {
        id: null,
        isVerified: Boolean(account?.isVerified),
      };
    }

    const result = {
      id: profile._id,
      isVerified: Boolean(account?.isVerified),
    };

    for (const field of READABLE_PROFILE_FIELDS) {
      result[field] = profile[field];
    }

    return result;
  } catch (error) {
    console.error("🚀 ~ getUserProfile ~ error:", error);
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

// Free-text fields with no rule beyond "trim it, default to empty
// string if cleared" — no write-once restriction, no enum, no nested
// shape. Handled generically below so adding one of these later means
// adding a name to this list, not a new hand-written `if (... in
// payload)` block that the read side (READABLE_PROFILE_FIELDS above)
// then also needs to remember to match.
const SIMPLE_STRING_FIELDS = ["firstName", "middleName", "lastName"];

// Same, but the field is allowed to be explicitly cleared to null
// rather than falling back to "".
const NULLABLE_STRING_FIELDS = ["avatar", "homeAddress"];

export const updateUserProfileService = async ({ userId, payload }) => {
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

  for (const field of SIMPLE_STRING_FIELDS) {
    if (field in payload) {
      updateData[field] = sanitizeString(payload[field]) || "";
    }
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    if (field in payload) {
      updateData[field] = sanitizeNullableString(payload[field]);
    }
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

  if ("bloodGroup" in payload) {
    const allowed = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "Unknown", null];
    if (!allowed.includes(payload.bloodGroup)) {
      throw new Error("Invalid blood group");
    }
    updateData.bloodGroup = payload.bloodGroup || null;
  }

  if ("genotype" in payload) {
    const allowed = ["AA", "AS", "AC", "SS", "SC", "Unknown", null];
    if (!allowed.includes(payload.genotype)) {
      throw new Error("Invalid genotype");
    }
    updateData.genotype = payload.genotype || null;
  }

  if ("confirmedNone" in payload) {
    if (
      typeof payload.confirmedNone !== "object" ||
      payload.confirmedNone === null ||
      Array.isArray(payload.confirmedNone)
    ) {
      throw new Error("confirmedNone must be an object");
    }

    const allowedKeys = ["allergies", "medications", "diagnoses"];

    const existingConfirmedNone = profile.confirmedNone?.toObject
      ? profile.confirmedNone.toObject()
      : profile.confirmedNone || {};

    const sanitizedConfirmedNone = { ...existingConfirmedNone };
    for (const key of allowedKeys) {
      if (key in payload.confirmedNone) {
        sanitizedConfirmedNone[key] = Boolean(payload.confirmedNone[key]);
      }
    }

    updateData.confirmedNone = sanitizedConfirmedNone;
  }

  if ("notificationPreferences" in payload) {
    if (
      typeof payload.notificationPreferences !== "object" ||
      payload.notificationPreferences === null ||
      Array.isArray(payload.notificationPreferences)
    ) {
      throw new Error("notificationPreferences must be an object");
    }

    const allowedKeys = [
      "labResultsReady",
      "consentRequests",
      "appointmentReminders",
      "emergencyModeAlerts",
      "medicationReminders",
      "accessAuditLog",
    ];

    const existingPrefs = profile.notificationPreferences?.toObject
      ? profile.notificationPreferences.toObject()
      : profile.notificationPreferences || {};

    const sanitizedPrefs = { ...existingPrefs };
    for (const key of allowedKeys) {
      if (key in payload.notificationPreferences) {
        sanitizedPrefs[key] = Boolean(payload.notificationPreferences[key]);
      }
    }

    updateData.notificationPreferences = sanitizedPrefs;
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

const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Uploads a patient's profile photo to Cloudinary and stores the resulting
// URL on their profile. Mirrors the pattern already used for organization
// verification document uploads (see verification_services.js).
export const uploadAvatarService = async ({ accountId, file }) => {
  if (!file) {
    const error = new Error("No image was uploaded");
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error("Only JPG, PNG, and WEBP images are accepted");
    error.statusCode = 400;
    throw error;
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    const error = new Error("Image must be under 5MB");
    error.statusCode = 400;
    throw error;
  }

  const profile = await UserProfile.findOne({ accountId });

  if (!profile) {
    const error = new Error("Profile not found");
    error.statusCode = 404;
    throw error;
  }

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "wellirecord/patient-avatars",
        resource_type: "image",
        public_id: `${accountId}_${Date.now()}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(file.buffer);
  }).catch((cloudinaryError) => {
    console.error("🚀 ~ uploadAvatarService ~ Cloudinary upload failed:", cloudinaryError);
    const error = new Error("Failed to upload image. Please try again.");
    error.statusCode = 502;
    throw error;
  });

  profile.avatar = uploadResult.secure_url;
  await profile.save();

  return profile;
};
