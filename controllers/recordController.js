import HealthRecord from "../Models/HealthRecord.js";


export const createHealthRecord = async (req, res ) => {
  try {
    const { id, title, date, type, provider, summary, status } = req.body;

    if (!id || !title || !date || !type || !provider) {
      return res.status(400).json({
        message: "Missing required fields: id, title, date, type, provider",
      });
    }

    // Prevent duplicates by id (rec_001 style)
    const exists = await HealthRecord.findOne({ id }).lean();
    if (exists) {
      return res.status(409).json({ message: `Record with id '${id}' already exists.` });
    }

    const record = await HealthRecord.create({
      id,
      title,
      date,
      type,
      provider,
      summary: summary ?? "",
      status: status ?? "Pending",
    });

    return res.status(201).json(record);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to create record",
      error: err?.message ?? String(err),
    });
  }
};

/**
 * GET /api/records
 * List records (latest first)
 */
export const getHealthRecords = async (_req , res) => {
  try {
    const records = await HealthRecord.find({})
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(records);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch records",
      error: err?.message ?? String(err),
    });
  }
};

/**
 * GET /api/records/:id
 * Read one record by "id" (e.g. rec_001)
 */
export const getHealthRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await HealthRecord.findOne({ id }).lean();
    if (!record) {
      return res.status(404).json({ message: `Record '${id}' not found.` });
    }

    return res.status(200).json(record);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch record",
      error: err?.message ?? String(err),
    });
  }
};

/**
 * PATCH /api/records/:id
 * Update allowed fields only
 */
export const updateHealthRecord = async (req, res) => {
  try {
    const { id } = req.params;

    // Whitelist updates (avoid someone updating internal fields)
    const allowedFields = ["title", "date", "type", "provider", "summary", "status"];

    const update = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update." });
    }

    const updated = await HealthRecord.findOneAndUpdate(
      { id },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: `Record '${id}' not found.` });
    }

    return res.status(200).json(updated);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update record",
      error: err?.message ?? String(err),
    });
  }
};
