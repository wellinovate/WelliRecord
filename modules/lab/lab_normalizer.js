/**
 * Standardizes test names, categories, and units for laboratory results.
 * Prevents typos (e.g. "Hemalogbin" vs "Hemoglobin"), assigns clinical
 * categories (hematology, chemistry, microbiology, serology, etc.) instead
 * of defaulting to "other", and cleans up corrupted units (e.g. "g/fl").
 */

const TEST_NAME_CANONICAL_MAP = [
  { pattern: /^hema[l|t]og?bin$/i, canonical: "Hemoglobin", category: "hematology", defaultUnit: "g/dL" },
  { pattern: /^(hgb|hb)$/i, canonical: "Hemoglobin", category: "hematology", defaultUnit: "g/dL" },
  { pattern: /^(fbc|cbc|full blood count|complete blood count)$/i, canonical: "Full Blood Count", category: "hematology", defaultUnit: null },
  { pattern: /^(pcv|packed cell volume)$/i, canonical: "Packed Cell Volume", category: "hematology", defaultUnit: "%" },
  { pattern: /^(wbc|white blood cells?|white blood cell count)$/i, canonical: "White Blood Cell Count", category: "hematology", defaultUnit: "x10^9/L" },
  { pattern: /^(platelets?|platelet count)$/i, canonical: "Platelet Count", category: "hematology", defaultUnit: "x10^9/L" },
  { pattern: /^(esr|erythrocyte sedimentation rate)$/i, canonical: "ESR", category: "hematology", defaultUnit: "mm/hr" },

  { pattern: /^lipid profile$/i, canonical: "Lipid Profile", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(total cholesterol|cholesterol)$/i, canonical: "Total Cholesterol", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(hdl|hdl cholesterol|hdl-c)$/i, canonical: "HDL Cholesterol", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(ldl|ldl cholesterol|ldl-c)$/i, canonical: "LDL Cholesterol", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(triglycerides|tg)$/i, canonical: "Triglycerides", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(fbs|fasting blood sugar|fasting plasma glucose|fpg)$/i, canonical: "Fasting Blood Sugar", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(rbs|random blood sugar|random plasma glucose)$/i, canonical: "Random Blood Sugar", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(hba1c|glycated hemoglobin|hemoglobin a1c)$/i, canonical: "HbA1c", category: "chemistry", defaultUnit: "%" },
  { pattern: /^(lft|liver function tests?)$/i, canonical: "Liver Function Tests", category: "chemistry", defaultUnit: null },
  { pattern: /^(kft|rft|renal function tests?|kidney function tests?|e\/u\/cr|eucr)$/i, canonical: "Renal Function Tests (E/U/Cr)", category: "chemistry", defaultUnit: null },
  { pattern: /^(creatinine|serum creatinine)$/i, canonical: "Serum Creatinine", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(urea|blood urea nitrogen|bun)$/i, canonical: "Blood Urea", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(uric acid)$/i, canonical: "Uric Acid", category: "chemistry", defaultUnit: "mg/dL" },
  { pattern: /^(alt|sgpt)$/i, canonical: "ALT (SGPT)", category: "chemistry", defaultUnit: "U/L" },
  { pattern: /^(ast|sgot)$/i, canonical: "AST (SGOT)", category: "chemistry", defaultUnit: "U/L" },
  { pattern: /^(alp|alkaline phosphatase)$/i, canonical: "Alkaline Phosphatase (ALP)", category: "chemistry", defaultUnit: "U/L" },

  { pattern: /^(urinalysis|urine analysis|urine dipstick)$/i, canonical: "Urinalysis", category: "urinalysis", defaultUnit: null },
  { pattern: /^(stool microscopy|stool m\/c\/s)$/i, canonical: "Stool Microscopy", category: "microbiology", defaultUnit: null },
  { pattern: /^(urine microscopy|urine m\/c\/s)$/i, canonical: "Urine M/C/S", category: "microbiology", defaultUnit: null },

  { pattern: /^(mp|malaria parasite|malaria test|malaria rdt|malaria microscopy)$/i, canonical: "Malaria Parasite (MP)", category: "serology", defaultUnit: null },
  { pattern: /^(widal|widal test|typhoid test)$/i, canonical: "Widal Test", category: "serology", defaultUnit: null },
  { pattern: /^(hbsag|hepatitis b surface antigen|hepatitis b)$/i, canonical: "Hepatitis B (HBsAg)", category: "serology", defaultUnit: null },
  { pattern: /^(hcv|hepatitis c antibody|hepatitis c)$/i, canonical: "Hepatitis C (HCV)", category: "serology", defaultUnit: null },
  { pattern: /^(hiv|hiv 1\/2|hiv screening)$/i, canonical: "HIV 1/2 Screening", category: "serology", defaultUnit: null },
  { pattern: /^(blood group|blood grouping & rhesus|abo & rh)$/i, canonical: "Blood Group & Rhesus", category: "serology", defaultUnit: null },
  { pattern: /^(genotype|hb genotype|hemoglobin genotype)$/i, canonical: "Hemoglobin Genotype", category: "serology", defaultUnit: null },
  { pattern: /^(pregnancy test|pt|urine pregnancy test|upt|beta-hcg)$/i, canonical: "Pregnancy Test (hCG)", category: "serology", defaultUnit: null },
];

const UNIT_NORMALIZATION_MAP = {
  "g/fl": "mg/dL",
  "g/l": "g/dL",
  "g/dl": "g/dL",
  "mg/dl": "mg/dL",
  "mmol/l": "mmol/L",
  "umol/l": "µmol/L",
  "iu/l": "IU/L",
  "u/l": "U/L",
  "mm/h": "mm/hr",
  "mm/hr": "mm/hr",
};

export const normalizeLabResultData = ({
  testName = "",
  category = "other",
  unit = "",
  specimen,
}) => {
  let normalizedTestName = testName.trim();
  let normalizedCategory = category;
  let normalizedUnit = (unit || "").trim();

  // 1. Match against known test profiles
  for (const item of TEST_NAME_CANONICAL_MAP) {
    if (item.pattern.test(normalizedTestName)) {
      normalizedTestName = item.canonical;
      if (!normalizedCategory || normalizedCategory === "other") {
        normalizedCategory = item.category;
      }
      // If unit is missing or invalid (like g/fl for lipid or g/l for hgb), standardise
      if (!normalizedUnit && item.defaultUnit) {
        normalizedUnit = item.defaultUnit;
      }
      break;
    }
  }

  // 2. Unit casing and typo fix
  const lowerUnit = normalizedUnit.toLowerCase();
  if (UNIT_NORMALIZATION_MAP[lowerUnit]) {
    // If it's Hemoglobin and unit was g/l or g/dl -> g/dL
    if (normalizedTestName === "Hemoglobin" && (lowerUnit === "g/l" || lowerUnit === "g/dl" || lowerUnit === "g/fl")) {
      normalizedUnit = "g/dL";
    } else if (normalizedTestName === "Lipid Profile" && lowerUnit === "g/fl") {
      normalizedUnit = "mg/dL";
    } else {
      normalizedUnit = UNIT_NORMALIZATION_MAP[lowerUnit];
    }
  }

  // 3. Fallback category inferencing if still "other"
  if (!normalizedCategory || normalizedCategory === "other") {
    const lowerName = normalizedTestName.toLowerCase();
    if (lowerName.includes("blood") || lowerName.includes("hem") || lowerName.includes("cell")) {
      normalizedCategory = "hematology";
    } else if (lowerName.includes("sugar") || lowerName.includes("glucose") || lowerName.includes("cholesterol") || lowerName.includes("protein") || lowerName.includes("enzyme")) {
      normalizedCategory = "chemistry";
    } else if (lowerName.includes("urine")) {
      normalizedCategory = "urinalysis";
    } else if (lowerName.includes("culture") || lowerName.includes("swab") || lowerName.includes("microscopy")) {
      normalizedCategory = "microbiology";
    } else if (lowerName.includes("antigen") || lowerName.includes("antibody") || lowerName.includes("serum") || lowerName.includes("widal") || lowerName.includes("malaria")) {
      normalizedCategory = "serology";
    }
  }

  return {
    testName: normalizedTestName,
    category: normalizedCategory || "other",
    unit: normalizedUnit || undefined,
    specimen: specimen?.trim() || undefined,
  };
};
