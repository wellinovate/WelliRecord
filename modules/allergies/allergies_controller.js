import { BaseController } from "../../shared/libs/base_controller.js";
import { allergyService } from "./allergies_services.js";

class AllergyController extends BaseController {
  constructor() {
    super(allergyService);
  }
}

export const allergyController = new AllergyController();