import { BaseService } from "../../shared/libs/base_service.js";
import { immunizationModel } from "./immunizations_model.js";

class ImmunizationService extends BaseService {
  constructor() {
    super(immunizationModel);
  }
}

export const immunizationService = new ImmunizationService();