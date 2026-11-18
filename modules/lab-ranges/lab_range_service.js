import { LabRangeOverride } from "./lab_range_model.js";
import { validateRanges } from "./lab_range_rules.js";
import { STRUCTURED_TESTS } from "../lab-tests-catalog/lab_test_catalog_v2.js";

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const loadOverrides = async (organizationId, testKey) =>
  organizationId && testKey ? LabRangeOverride.find({ organizationId, testKey }).select("code ranges").lean() : [];

export const listOverridesService = async (organizationId) =>
  LabRangeOverride.find({ organizationId }).sort({ testKey: 1, code: 1 }).lean();

export const setOverrideService = async ({ organizationId, testKey, code, ranges, reason, userName }) => {
  const test = STRUCTURED_TESTS.find((t) => t.key === testKey);
  const analyte = test?.analytes.find((a) => a.code === code);
  if (!analyte) throw httpError("That test or result field is not in the catalog.", 404);
  const out = validateRanges(analyte, ranges);
  if (out.errors.length) throw httpError(out.errors.join(" "), 400);
  return LabRangeOverride.findOneAndUpdate(
    { organizationId, testKey, code },
    { $set: { ranges: out.ranges, reason: String(reason || "").slice(0, 300), updatedBy: userName } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
};

export const removeOverrideService = async ({ organizationId, testKey, code }) => {
  await LabRangeOverride.deleteOne({ organizationId, testKey, code });
  return { removed: true };
};
