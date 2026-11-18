import { LabTestCatalog } from "./lab_test_catalog_model.js";
import { DEFAULT_LAB_TEST_CATALOG } from "./lab_test_catalog_seed_data.js";
import { STRUCTURED_TESTS, CATALOG_VERSION, REVIEW_STATUS } from "./lab_test_catalog_v2.js";

const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const toCatalogDoc = (t) => ({
  key: t.key,
  name: t.name,
  category: t.category,
  labDepartment: t.labDepartment,
  aliases: t.aliases || [],
  notes: t.notes || "",
  specimen: t.specimen || "",
  container: t.container || "",
  fastingRequired: Boolean(t.fasting),
  turnaroundHours: t.turnaroundHours,
  analytes: t.analytes,
  reviewStatus: REVIEW_STATUS,
  catalogVersion: CATALOG_VERSION,
  isActive: true,
});

// Brings the structured tests into the collection. Safe to run on every start:
// a test is matched by key, then by an older row with the same category and name
// (which is adopted), otherwise inserted. Older flat rows that name the same test
// (by name or alias) are switched off so the order form does not list it twice.
export const syncStructuredCatalog = async () => {
  for (const t of STRUCTURED_TESTS) {
    const doc = toCatalogDoc(t);
    let row = await LabTestCatalog.findOne({ key: t.key });
    if (!row) row = await LabTestCatalog.findOne({ category: t.category, name: t.name, key: { $exists: false } });
    if (row) {
      if (row.catalogVersion === CATALOG_VERSION && row.key === t.key) continue;
      row.set(doc);
      await row.save();
    } else {
      await LabTestCatalog.create(doc);
    }
    const names = [t.name, ...(t.aliases || [])].map((n) => new RegExp(`^${esc(n.trim())}$`, "i"));
    await LabTestCatalog.updateMany(
      { key: { $exists: false }, name: { $in: names }, isActive: true },
      { $set: { isActive: false, notes: `Replaced by the structured test "${t.name}".` } },
    );
  }
};

// Accepts the row id or the stable test key.
export const getCatalogTestService = async (idOrKey) =>
  /^[0-9a-f]{24}$/i.test(idOrKey) ? LabTestCatalog.findById(idOrKey).lean() : LabTestCatalog.findOne({ key: idOrKey }).lean();


// Idempotent — only seeds if the collection is genuinely empty, so
// this is safe to call on every server start without duplicating rows
// (same pattern as notification template seeding).
export const seedDefaultLabTestCatalog = async () => {
  const count = await LabTestCatalog.countDocuments();
  if (count === 0) {
    await LabTestCatalog.insertMany(
      DEFAULT_LAB_TEST_CATALOG.map((t) => ({ isActive: true, aliases: [], notes: "", ...t })),
    );
  }
  await syncStructuredCatalog();
};

// Returns active tests grouped by category, in the order categories
// were first seen — this is what the order-form dropdown consumes.
export const listCatalogGroupedService = async () => {
  const tests = await LabTestCatalog.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();

  const grouped = [];
  const indexByCategory = new Map();

  for (const test of tests) {
    if (!indexByCategory.has(test.category)) {
      indexByCategory.set(test.category, grouped.length);
      grouped.push({ category: test.category, tests: [] });
    }
    const group = grouped[indexByCategory.get(test.category)];
    group.tests.push({
      id: test._id,
      name: test.name,
      labDepartment: test.labDepartment,
      key: test.key || null,
      structured: Array.isArray(test.analytes) && test.analytes.length > 0,
      specimen: test.specimen || "",
      fastingRequired: Boolean(test.fastingRequired),
    });
  }

  return grouped;
};

export const searchCatalogService = async ({ query }) => {
  if (!query || !query.trim()) {
    return [];
  }

  return LabTestCatalog.find(
    { isActive: true, $text: { $search: query.trim() } },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(20)
    .lean();
};
