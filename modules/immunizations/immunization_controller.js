import { BaseController } from "../../shared/libs/base_controller.js";
import { immunizationService } from "./immunization_service.js";

class ImmunizationController extends BaseController {
  constructor() {
    super(immunizationService);
  }
}

export const immunizationController = new ImmunizationController();