import { LabTestCatalog } from "./lab_test_catalog_model.js";
import { DEFAULT_LAB_TEST_CATALOG } from "./lab_test_catalog_seed_data.js";

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
