import mongoose from "mongoose";

export class BaseService {
  constructor(Model) {
    this.Model = Model;
  }

  async create(data) {
    const doc = await this.Model.create(data);
    return doc;
  }

  async getById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid record id");
    }

    const doc = await this.Model.findById(id);

    if (!doc) {
      throw new Error("Record not found");
    }

    return doc;
  }

  async getByPatientId(patientId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      throw new Error("Invalid patient id");
    }

    const { page = 1, limit = 20, sort = { createdAt: -1 } } = options;

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

  async update(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid record id");
    }

    const doc = await this.Model.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      throw new Error("Record not found");
    }

    return doc;
  }
}
