import mongoose from "mongoose";
import { BaseService } from "../../shared/libs/base_service.js";
import { vitalModel } from "./vitals_model.js";


class VitalService extends BaseService {
  constructor() {
    super(vitalModel);
  }

  async getByPatientId(patientId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      throw new Error("Invalid patient id");
    }

    const {
      page = 1,
      limit = 20,
      sort = { measuredAt: -1 },
    } = options;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      this.Model.find({ patientId }).sort(sort).skip(skip).limit(Number(limit)),
      this.Model.countDocuments({ patientId }),
    ]);

    return {
      items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }
}

export const vitalService = new VitalService();