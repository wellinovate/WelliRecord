import { BaseController } from "../../shared/libs/base_controller.js";
import { diagnosisService } from "./diagnosis_services.js";

class DiagnosisController extends BaseController {
  constructor() {
    super(diagnosisService);
  }
}

export const diagnosisController = new DiagnosisController();