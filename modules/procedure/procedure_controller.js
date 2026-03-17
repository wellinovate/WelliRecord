import { BaseController } from "../../shared/libs/base_controller.js";
import { procedureService } from "./procedure_service.js";

class ProcedureController extends BaseController {
  constructor() {
    super(procedureService);
  }
}

export const procedureController = new ProcedureController();