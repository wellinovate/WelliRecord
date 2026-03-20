// import mongoose from "mongoose";
// import { BaseService } from "../../shared/libs/base_service.js";
// import { vitalModel } from "./vitals_model.js";


// class VitalService extends BaseService {
//   constructor() {
//     super(vitalModel);
//   }

//   async getByPatientId(patientId, options = {}) {
//     if (!mongoose.Types.ObjectId.isValid(patientId)) {
//       throw new Error("Invalid patient id");
//     }

//     const {
//       page = 1,
//       limit = 20,
//       sort = { measuredAt: -1 },
//     } = options;

//     const skip = (Number(page) - 1) * Number(limit);

//     const [items, total] = await Promise.all([
//       this.Model.find({ patientId }).sort(sort).skip(skip).limit(Number(limit)),
//       this.Model.countDocuments({ patientId }),
//     ]);

//     return {
//       items,
//       pagination: {
//         total,
//         page: Number(page),
//         limit: Number(limit),
//         pages: Math.ceil(total / Number(limit)),
//       },
//     };
//   }
// }

// export const vitalService = new VitalService();

import mongoose from "mongoose";
import { vitalModel } from "./vitals_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
// import { Patient } from "../patients/patient_model.js"; // adjust path/model name
// import { Encounter } from "../encounters/encounter_model.js"; // optional, if validating encounter existence

export const createVitalService = async ({ payload, authUser }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const organizationIdFromUser = authUser?.sub || null;
    const recordedBy = authUser?.sub || null;

    if (!recordedBy) {
      const error = new Error("Authenticated user is required");
      error.statusCode = 401;
      throw error;
    }

    // Stronger safety: do not trust organizationId fully from client
    const organizationId =
      payload.organizationId || organizationIdFromUser || null;

    // Optional: verify patient exists
    const patientFromUserProfile = await UserProfile.findById(payload.patientId).session(session);
    const patientFromPatientIdentity = await PatientIdentity.findById(payload.patientId).session(session);
    const check =  patientFromUserProfile || patientFromPatientIdentity 
    if (!check) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    const vital = await vitalModel.create(
      [
        {
          patientId: payload.patientId,
          recordedBy,
          providerId: payload.providerId || recordedBy,
          organizationId,
          encounterId: payload.encounterId || null,

          source: payload.source || "provider",
          createdContext: payload.createdContext || "provider-chart",
          ownershipType: payload.ownershipType || "shared",
          visibility: payload.visibility || "shared",
          patientAccess: payload.patientAccess || "full",
          patientVisible:
            payload.patientVisible !== undefined ? payload.patientVisible : true,

          bloodPressure: payload.bloodPressure,
          heartRate: payload.heartRate,
          temperature: payload.temperature,
          respiratoryRate: payload.respiratoryRate,
          oxygenSaturation: payload.oxygenSaturation,
          weight: payload.weight,
          height: payload.height,
          bloodGlucose: payload.bloodGlucose,
          measuredAt: payload.measuredAt || new Date(),
          notes: payload.notes || undefined,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    const created = vital[0];

    return {
      id: created._id,
      patientId: created.patientId,
      providerId: created.providerId,
      organizationId: created.organizationId,
      encounterId: created.encounterId,
      source: created.source,
      createdContext: created.createdContext,
      measuredAt: created.measuredAt,
      bloodPressure: created.bloodPressure,
      heartRate: created.heartRate,
      temperature: created.temperature,
      respiratoryRate: created.respiratoryRate,
      oxygenSaturation: created.oxygenSaturation,
      weight: created.weight,
      height: created.height,
      bmi: created.bmi,
      bloodGlucose: created.bloodGlucose,
      notes: created.notes,
      recordStatus: created.recordStatus,
      clinicalStatus: created.clinicalStatus,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};


export const getPatientVitalsService = async ({
  patientId,
  page = 1,
  limit = 10,
  authUser,
}) => {
  const organizationId = authUser?.organizationId || null;
  const skip = (page - 1) * limit;

  const filter = {
    patientId,
    recordStatus: "active",
    clinicalStatus: "active",
  };

  if (organizationId) {
    filter.organizationId = organizationId;
  }

  const [vitals, total] = await Promise.all([
    vitalModel
      .find(filter)
      .sort({ measuredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    vitalModel.countDocuments(filter),
  ]);

  return {
    items: vitals.map((item) => ({
      id: item._id,
      patientId: item.patientId,
      source: item.source,
      measuredAt: item.measuredAt,
      bloodPressure: item.bloodPressure || null,
      heartRate: item.heartRate ?? null,
      temperature: item.temperature || null,
      respiratoryRate: item.respiratoryRate ?? null,
      oxygenSaturation: item.oxygenSaturation ?? null,
      weight: item.weight || null,
      height: item.height || null,
      bmi: item.bmi ?? null,
      bloodGlucose: item.bloodGlucose || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};