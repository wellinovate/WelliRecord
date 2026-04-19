import redisClient from "../../shared/config/redis.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import * as medicalHistoryService from "./users_services.js";

function getPagination(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export async function getMedicalHistorySummary(req, res, next) {
  try {
    const authUser = req.user;
    const { actor, patientId, isSelf } = await resolvePatientAccessContext({
      patientId: req.user.sub,
      authUser,
    });


    const data = await medicalHistoryService.getMedicalHistorySummary(
      patientId,
    );

    return res.status(200).json({
      success: true,
      message: "Medical history summary fetched successfully",
      data,
    });
  } catch (error) {
    console.log("🚀 ~ getMedicalHistorySummary ~ error:", error);
    next(error);
  }
}
export async function getMedicalHistorySummaryByProviders(req, res, next) {
  try {
    const {patientId} = req.params
    const authUser = req.user;
    const { actor, patientId: patientIds, isSelf } = await resolvePatientAccessContext({
      patientId: patientId,
      authUser,
    });


    const data = await medicalHistoryService.getMedicalHistorySummary(
      patientIds,
    );

    return res.status(200).json({
      success: true,
      message: "Medical history summary fetched successfully",
      data,
    });
  } catch (error) {
    console.log("🚀 ~ getMedicalHistorySummary ~ error:", error);
    next(error);
  }
}

export async function getPatientVitals(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientVitals(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Vitals fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientDiagnoses(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientDiagnoses(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Diagnoses fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientMedications(req, res, next) {
  try {

    const authUser = req.user;
    const { actor, patientId, isSelf } = await resolvePatientAccessContext({
      patientId: req.user.sub,
      authUser,
    });
    console.log("🚀 ~ getPatientMedications ~ patientId:", patientId)
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientMedications(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Medications fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientProcedures(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientProcedures(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Procedures fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientImmunizations(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientImmunizations(
      patientId,
      {
        limit,
        skip,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Immunizations fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientLabResults(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientLabResults(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Lab results fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPatientAllergies(req, res, next) {
  try {
    const { patientId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const data = await medicalHistoryService.getPatientAllergies(patientId, {
      limit,
      skip,
    });

    return res.status(200).json({
      success: true,
      message: "Allergies fetched successfully",
      ...data,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

// controllers/userProfile.controller.ts

export const fetchUserProfile = async (req, res) => {
  try {
    const accountId = req.user.sub; // from auth middleware
    console.log("🚀 ~ fetchUserProfile ~ accountId:", accountId)


    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // const cacheKey = `user:profile:${accountId}`;



    // // 1. Check Redis first
    // const cachedProfile = await redisClient.get(cacheKey);

    // if (cachedProfile) {
    //   return res.status(200).json({
    //     success: true,
    //     source: "redis",
    //     data: JSON.parse(cachedProfile),
    //   });
    // }

    const profile = await medicalHistoryService.getUserProfile(accountId);

    // 3. Save to Redis for 10 minutes
    // await redisClient.setEx(cacheKey, 600, JSON.stringify(profile));

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};



export const updateUserProfileController = async (
  req,
  res
) => {
  try {
    const userId = req.user?.sub;
    // console.log("🚀 ~ updateUserProfileController ~ userId:", userId)

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const updatedProfile = await medicalHistoryService.updateUserProfileService({
      userId,
      payload: req.body,
    });

     if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Clear stale cache
    // await redisClient.del(`user:profile:${userId}`);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedProfile,
    });
  } catch (error) {
    console.error("updateUserProfileController error:", error);

    const knownErrors = [
      "Invalid user id",
      "Profile not found",
      "Invalid dateOfBirth",
      "No valid fields provided for update",
      "Each emergency contact must have a name",
      "Each emergency contact must have a phone number",
      "Full name must be at least 2 characters",
      "Emergency contacts must be an array",
    ];

    const statusCode = knownErrors.includes(error.message) ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500 ? "Failed to update profile" : error.message,
    });
  }
};