// src/controllers/provider.controller.js
import { Provider } from "../models/provider.model.js";

// POST /api/v1/providers
export const createProviderController = async (req, res) => {
  try {
    const payload = req.body;

    // optional: basic required fields check (keep simple)
    const required = [
      "firstName",
      "lastName",
      "primarySpecialty",
      "experienceYears",
      "pricePerSession",
    ];
    for (const field of required) {
      if (payload?.[field] === undefined || payload?.[field] === null || payload?.[field] === "") {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    const provider = await Provider.create(payload);

    return res.status(201).json({
      message: "Provider created",
      provider,
    });
  } catch (err) {
    // handle common mongoose duplicate key error
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
      return res.status(409).json({ message: `${key} already exists` });
    }

    return res.status(500).json({
      message: "Failed to create provider",
      error: err?.message,
    });
  }
};

// GET /api/v1/providers
export const getAllProvidersController = async (req, res) => {
  try {
    // simple filters (optional)
    const { primarySpecialty, isActive, isVerified } = req.query;

    const filter = {};
    if (primarySpecialty) filter.primarySpecialty = primarySpecialty;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (isVerified !== undefined) filter.isVerified = isVerified === "true";

    const providers = await Provider.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      count: providers.length,
      providers,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch providers",
      error: err?.message,
    });
  }
};

// GET /api/v1/providers/:id
export const getOneProviderController = async (req, res) => {
  try {
    const { id } = req.params;

    const provider = await Provider.findById(id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    return res.status(200).json({ provider });
  } catch (err) {
    return res.status(400).json({
      message: "Invalid provider id",
      error: err?.message,
    });
  }
};
