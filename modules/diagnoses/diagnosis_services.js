import { BaseService } from "../../shared/libs/base_service.js";
import { diagnosisModel } from "./diagnoses_model.js";

class DiagnosisService extends BaseService {
  constructor() {
    super(diagnosisModel);
  }
}

export const diagnosisService = new DiagnosisService();