import { BaseService } from "../../shared/libs/base_service.js";
import { labResultModel } from "./lab_model.js";

class LabResultService extends BaseService {
  constructor() {
    super(labResultModel);
  }
}

export const labResultService = new LabResultService();