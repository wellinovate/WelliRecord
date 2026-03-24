// import { BaseController } from "../../shared/libs/base_controller.js";
// import { vitalService } from "./vital_service.js";

// class VitalController extends BaseController {
//   constructor() {
//     super(vitalService);
//   }
// }

// export const vitalController = new VitalController();

import { createVitalService, getPatientVitalsService } from "./vital_service.js";
import { getPatientVitalsQuerySchema } from "./vital_validation.js";

export const createVitalController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createVitalService({
      payload,
      authUser,
    });
    console.log("🚀 ~ createVitalController ~ result:", result)

    return res.status(201).json({
      success: true,
      message: "Vital record created successfully",
      data: result,
    });
  } catch (error) {
  console.log("🚀 ~ createVitalController ~ error:", error);
    next(error);
  }
};



export const getPatientVitalsController = async (req, res, next) => {
  try {
    const { patientId: patientIds } = req.validated;
    const { page = 1, limit = 10 } = getPatientVitalsQuerySchema.parse(req.query);

    const authUser = req.user;
    const patientId = patientIds ? patientIds : authUser.sub

    


    const result = await getPatientVitalsService({
      patientId,
      page,
      limit,
      authUser,
    });

    return res.status(200).json({
      success: true,
      message: "Patient vitals fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyVitalsController = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = getPatientVitalsQuerySchema.parse(req.query);

    const authUser = req.user;
    const patientId = authUser.sub
    console.log("🚀 ~ getMyVitalsController ~ patientId:", patientId)

    


    const result = await getPatientVitalsService({
      patientId,
      page,
      limit,
      authUser,
    });
    console.log("🚀 ~ getMyVitalsController ~ result:", result)

    return res.status(200).json({
      success: true,
      message: "Patient vitals fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

