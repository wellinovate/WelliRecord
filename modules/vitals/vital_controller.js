import { BaseController } from "../../shared/libs/base_controller.js";
import { vitalService } from "./vital_service.js";

class VitalController extends BaseController {
  constructor() {
    super(vitalService);
  }
}

export const vitalController = new VitalController();