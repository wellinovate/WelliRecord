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

    console.log("FFFFFFFFFFFFFFFFFFFFFFFFFFFF ~ patientId:", patientId);

    const data = await medicalHistoryService.getMedicalHistorySummary(
      patientId,
    );
    console.log("🚀 ~ getMedicalHistorySummary ~ data:", data);

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
