import { BaseController } from "../../shared/libs/base_controller.js";
import { medicationService } from "./medication_service.js";

class MedicationController extends BaseController {
  constructor() {
    super(medicationService);
  }
}

export const medicationController = new MedicationController();