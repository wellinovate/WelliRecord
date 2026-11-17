import mongoose from "mongoose";

const { Schema } = mongoose;

const labTestCatalogSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Patient-facing menu grouping (e.g. "Serology", "Cardiac markers").
    // This is separate from the lab department field already used on
    // LabOrder ("Hematology" / "Chemical Pathology" / "Microbiology" /
    // "Histopathology" / "Immunology") — see labDepartment below.
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Suggested routing department for this test, matching the enum
    // already used on the LabOrder "category" field. Front desk / lab
    // staff can still override it per order — this is a default, not
    // an enforced value.
    labDepartment: {
      type: String,
      enum: ["Hematology", "Chemical Pathology", "Microbiology", "Histopathology", "Immunology", "General/Panel"],
      required: true,
    },

    // Alternate names a front-desk user might search by
    // (e.g. "Ulcer Test" for H. pylori, "Widal Test" for Typhoid).
    aliases: {
      type: [String],
      default: [],
    },

    // Off by default for anything that isn't a standard, evidence-based
    // lab test — see lab_test_catalog_seed_data.js for which entries
    // this applies to and why. Inactive entries are excluded from the
    // order-form dropdown but kept in the collection for visibility.
    isActive: {
      type: Boolean,
      default: true,
    },

    notes: {
      type: String,
      default: "",
    },

    // Structured definition (see lab_test_catalog_v2.js). Rows without a
    // key are the older flat names and have no analytes.
    key: { type: String, trim: true },
    specimen: { type: String, default: "" },
    container: { type: String, default: "" },
    fastingRequired: { type: Boolean, default: false },
    turnaroundHours: { type: Number },
    analytes: { type: [Schema.Types.Mixed], default: [] },
    // Reference ranges are defaults and have not been clinically reviewed.
    reviewStatus: { type: String, default: "" },
    catalogVersion: { type: String, default: "" },
  },
  { timestamps: true },
);

labTestCatalogSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: "string" } } });
labTestCatalogSchema.index({ name: "text", aliases: "text" });
labTestCatalogSchema.index({ category: 1, name: 1 }, { unique: true });

export const LabTestCatalog = mongoose.model("LabTestCatalog", labTestCatalogSchema);
