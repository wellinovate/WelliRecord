import { generateUsername } from "../../shared/utils/generateUsername.js";
import { UserProfile } from "./user_profile_model.js";

import mongoose from "mongoose";

import {vitalModel} from "../vitals/vitals_model.js";
import {diagnosisModel} from "../diagnoses/diagnoses_model.js";
import {medicationModel} from "../medications/medications_model.js";
import {procedureModel} from "../procedure/procedure_model.js";
import {immunizationModel} from "../immunizations/immunizations_model.js";
import {labResultModel} from "../lab/lab_model.js";
import {allergyModel} from "../allergies/allergies_model.js";

export const createUserProfile = async (payload, session) => {
  const username =
    payload.username || generateUsername(payload.email);
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
        gender: payload.gender || null,
        homeAddress: payload.homeAddress || null,
      },
    ],
    { session }
  );
  console.log("🚀 ~ createUserProfile ~ profile:", profile)

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

async function getPagedRecords(
  Model,
  patientId,
  options,
  sort
) {
  const match = buildBaseMatch(patientId);

  const [records, total] = await Promise.all([
    Model.findById(patientId).sort(sort).skip(options.skip).limit(options.limit).lean(),
    Model.countDocuments(match),
  ]);
  console.log("🚀 ~ getPagedRecords ~ records:", records)

  return {
    total,
    records,
  };
}

async function getCategorySummary(
  Model,
  patientId,
  category,
  metricBuilder
) {
  const match = buildBaseMatch(patientId);

  const [total, latestRecord] = await Promise.all([
    Model.countDocuments(match),
    Model.findOne(match).sort({ updatedAt: -1, recordedAt: -1, createdAt: -1 }).lean(),
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
  console.log("🚀 ~ getMedicalHistorySummary ~ patientId:", patientId)
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

    getCategorySummary(diagnosisModel, patientId, "diagnoses", (latest, total) => {
      if (!latest) {
        return { activeCount: 0 };
      }

      return {
        activeCount: total,
        latestDiagnosis: latest.diagnosisName || latest.conditionName || null,
      };
    }),

    getCategorySummary(medicationModel, patientId, "medications", (latest, total) => {
      if (!latest) {
        return { activeCount: 0 };
      }

      return {
        activeCount: total,
        latestMedication: latest.medicationName || latest.drugName || null,
      };
    }),

    getCategorySummary(procedureModel, patientId, "procedures", (latest, total) => {
      if (!latest) {
        return { totalProcedures: 0 };
      }

      return {
        totalProcedures: total,
        latestProcedure: latest.procedureName || latest.title || null,
      };
    }),

    getCategorySummary(immunizationModel, patientId, "immunizations", (latest, total) => {
      if (!latest) {
        return { totalImmunizations: 0 };
      }

      return {
        totalImmunizations: total,
        latestVaccine: latest.vaccineName || null,
      };
    }),

    getCategorySummary(labResultModel, patientId, "lab_results", (latest, total) => {
      if (!latest) {
        return { totalLabResults: 0 };
      }

      return {
        totalLabResults: total,
        latestTestName: latest.testName || latest.labName || null,
      };
    }),

    getCategorySummary(allergyModel, patientId, "allergies", (latest, total) => {
      if (!latest) {
        return { totalAllergies: 0 };
      }

      return {
        totalAllergies: total,
        latestAllergen: latest.allergen || latest.substance || null,
      };
    }),
  ]);
    console.log("🚀 ~ getMedicalHistorySummary ~ vitals:", vitals)

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

export async function getPatientVitals(
  patientId,
  options
) {
  return getPagedRecords(vitalModel, patientId, options);
}

export async function getPatientDiagnoses(
  patientId,
  options
) {
  return getPagedRecords(diagnosisModel, patientId, options);
}

export async function getPatientMedications(
  patientId,
  options
) {
  return getPagedRecords(medicationModel, patientId, options);
}

export async function getPatientProcedures(
  patientId,
  options
) {
  return getPagedRecords(procedureModel, patientId, options);
}

export async function getPatientImmunizations(
  patientId,
  options
) {
  return getPagedRecords(immunizationModel, patientId, options);
}

export async function getPatientLabResults(
  patientId,
  options
) {
  return getPagedRecords(labResultModel, patientId, options);
}

export async function getPatientAllergies(
  patientId,
  options
) {
  return getPagedRecords(allergyModel, patientId, options);
}

// services/userProfile.service.ts

export const getUserProfile = async (accountId) => {
  const profile = await UserProfile.findOne({ accountId })
    .populate("accountId", "email") // optional
    .lean();

  if (!profile) {
    throw new Error("Profile not found");
  }

  return {
    id: profile._id,
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
};