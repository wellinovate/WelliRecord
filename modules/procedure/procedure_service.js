import { BaseService } from "../../shared/libs/base_service.js";
import { procedureModel } from "./procedure_model.js";

class ProcedureService extends BaseService {
  constructor() {
    super(procedureModel);
  }
}

export const procedureService = new ProcedureService();