export class BaseController {
  constructor(service) {
    this.service = service;

    this.create = this.create.bind(this);
    this.getById = this.getById.bind(this);
    this.getByPatientId = this.getByPatientId.bind(this);
    this.update = this.update.bind(this);
  }

  async create(req, res, next) {
    try {
      const result = await this.service.create(req.body);

      return res.status(201).json({
        success: true,
        message: "Record created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const result = await this.service.getById(req.params.id);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByPatientId(req, res, next) {
    try {
      const { page, limit } = req.query;

      const result = await this.service.getByPatientId(req.params.patientId, {
        page,
        limit,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const result = await this.service.update(req.params.id, req.body);

      return res.status(200).json({
        success: true,
        message: "Record updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}