import { BaseController } from "../../shared/libs/base_controller.js";
import { labResultService } from "./lab_result_service.js";

class LabResultController extends BaseController {
  constructor() {
    super(labResultService);
  }
}

export const labResultController = new LabResultController();