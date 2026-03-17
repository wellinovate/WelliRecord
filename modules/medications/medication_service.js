import { BaseService } from "../../shared/libs/base_service.js";
import { medicationModel } from "./medications_model.js";

class MedicationService extends BaseService {
  constructor() {
    super(medicationModel);
  }
}

export const medicationService = new MedicationService();