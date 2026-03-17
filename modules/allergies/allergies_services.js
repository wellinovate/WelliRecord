import { BaseService } from "../../shared/libs/base_service.js";
import { allergyModel } from "./allergies_model.js";

class AllergyService extends BaseService {
  constructor() {
    super(allergyModel);
  }
}

export const allergyService = new AllergyService();