// Source: diagnostic centre test flyer supplied by Wins, Aug 2026.
//
// Decisions made while converting the flyer into structured data:
//
// 1. "Ultra Sound Scan", "X-ray", and "ECG" (flyer section 1) are left
//    out of this catalog. They're imaging/cardiology procedures, not
//    lab tests, and LabOrdersPage already has a separate Imaging &
//    Radiology Hub tab for them.
//
// 2. Flyer section 15 ("Routine Check-Up Tests") is not seeded as its
//    own category. Every test in it (Malaria, Widal, FBS, FBC,
//    Cholesterol, Urinalysis, Stool M/C/S) already exists as an
//    individual entry in another section. Seeding it separately would
//    create duplicate catalog rows for the same test. If a "Routine
//    Check-Up" bundle/panel needs to be orderable as one line item,
//    that's a package feature to build on top of this catalog, not a
//    duplicate set of test names.
//
// 3. The flyer labels section 3 "CHEM 14 TEST" and lists "AST (SGOT)"
//    and "ALT (SGOT)" as two separate line items. In standard lab
//    terminology AST maps to SGOT and ALT maps to SGPT — the flyer's
//    own footnote flags this same discrepancy. Both entries are kept
//    exactly as labeled on the flyer (nothing silently corrected) —
//    confirm the correct labeling with the source lab before this
//    goes live.
//
// 4. "Quantum Resonance Analysis" and "Hunter NLS Full Body Health
//    Check-Up" are bioresonance/"quantum medicine" devices. They are
//    not evidence-based diagnostic tests recognized by mainstream lab
//    medicine. They're seeded here (so the flyer's full contents are
//    represented) but set isActive: false, which excludes them from
//    the order-form dropdown. Flag for Wins: decide whether these
//    belong in a clinical records platform at all before flipping
//    isActive to true.
//
// 5. Obvious flyer typos are corrected in `name` ("Kotinine" ->
//    "Cotinine"; "SGOT" duplicate label issue noted above but left
//    alone since it's a labeling question, not a spelling one).

export const DEFAULT_LAB_TEST_CATALOG = [
  // 1. General / pre-employment / screening
  ...[
    "Annual General Check-Up",
    "Comprehensive Check-Up",
    "Pre-marital Health Check-Up",
    "Food Handlers Test",
    "Pre-employment Screening",
    "Domestic Staff Test",
    "School Admission Test",
    "Fitness Test",
    "Antenatal Test",
    "STD Test",
    "UTI Test",
    "STI Test",
    "DNA Test",
    "HLA Test",
    "PCR Test",
    "ANA Test",
    "Ovulation Monitoring",
    "Body Check-Up",
  ].map((name) => ({ name, category: "General, pre-employment & screening", labDepartment: "General/Panel" })),

  {
    name: "Quantum Resonance Analysis",
    category: "General, pre-employment & screening",
    labDepartment: "General/Panel",
    isActive: false,
    notes: "Bioresonance device test — not an evidence-based diagnostic method. Confirm before enabling.",
  },
  {
    name: "Hunter NLS Full Body Health Check-Up",
    category: "General, pre-employment & screening",
    labDepartment: "General/Panel",
    isActive: false,
    notes: "Bioresonance device test — not an evidence-based diagnostic method. Confirm before enabling.",
  },

  // 2. Serology
  ...[
    { name: "HIV 1 & 2 Test" },
    { name: "Hepatitis B" },
    { name: "Hepatitis C" },
    { name: "Hepatitis A" },
    { name: "Hepatitis B Profile" },
    { name: "Hepatitis B Viral Load" },
    { name: "HIV Viral Load" },
    { name: "Syphilis (VDRL)" },
    { name: "H. pylori (Ulcer Test)", aliases: ["Ulcer Test"] },
    { name: "Herpes Simplex Virus 1" },
    { name: "Herpes Simplex Virus 2" },
    { name: "Human Papilloma Virus (HPV)" },
    { name: "Tuberculosis (TB Serology)" },
    { name: "TORCH Panel" },
  ].map((t) => ({ ...t, category: "Serology", labDepartment: "Immunology" })),

  // 3. Chemistry (Chem 14) — see note 3 above re: AST/ALT labeling
  ...[
    "AST (SGOT)",
    "ALT (SGOT)",
    "ALP",
    "Total Bilirubin",
    "Direct Bilirubin",
    "Albumin",
    "Total Protein",
    "Blood Glucose",
    "Creatinine",
    "Urea",
    "Sodium",
    "Potassium",
    "Chloride",
    "Bicarbonate",
  ].map((name) => ({ name, category: "Chemistry (Chem 14)", labDepartment: "Chemical Pathology" })),

  // 4. Lipid profile
  ...["Cholesterol", "Triglycerides", "HDL", "LDL", "VLDL"].map((name) => ({
    name,
    category: "Lipid profile",
    labDepartment: "Chemical Pathology",
  })),

  // 5. Organ function
  ...[
    "Liver Function Test (LFT)",
    "Kidney Function Test (KFT)",
    "Cardiac Profile Test (Heart)",
    "Pancreatic Function Test",
    "Lung Function Test",
  ].map((name) => ({ name, category: "Organ function", labDepartment: "Chemical Pathology" })),

  // 6. Thyroid
  ...["TSH", "T3", "T4", "Free T3", "Free T4"].map((name) => ({
    name,
    category: "Thyroid",
    labDepartment: "Chemical Pathology",
  })),

  // 7. Diabetes profile
  ...[
    "HbA1c",
    "Fasting Blood Sugar",
    "Random Blood Sugar",
    "OGTT",
    "Glucose 2 Hours PP",
  ].map((name) => ({ name, category: "Diabetes profile", labDepartment: "Chemical Pathology" })),

  // 8. Fertility / hormonal profile
  ...[
    { name: "LH" },
    { name: "FSH" },
    { name: "Prolactin" },
    { name: "Progesterone" },
    { name: "AMH" },
    { name: "β-hCG", aliases: ["B-hCG", "Beta hCG"] },
  ].map((t) => ({ ...t, category: "Fertility & hormonal profile", labDepartment: "Immunology" })),

  // 9. Microbiology
  ...[
    "Urine M/C/S",
    "HVS M/C/S",
    "Stool M/C/S",
    "Throat Swab M/C/S",
    "Wound Swab M/C/S",
    "ECS M/C/S",
    "Urethral Swab M/C/S",
    "Occult Blood Test",
    "Blood Culture",
    "H. pylori Stool Antigen",
    "Microfilarial Test",
    "Malaria Test",
    "Widal Test",
    "Sputum AFB/M/C/S",
    "Semen Analysis/M/C/S",
    "Chlamydia",
    "Gonorrhea",
  ].map((name) => ({ name, category: "Microbiology", labDepartment: "Microbiology" })),

  // 10. Cancer markers
  ...[
    { name: "PSA", notes: "Prostate cancer marker" },
    { name: "CEA", notes: "Marker used across several cancer types" },
    { name: "CA 125", notes: "Ovarian cancer marker" },
    { name: "CA 15-3" },
    { name: "CA 27.29", notes: "Breast cancer marker" },
    { name: "CA 19-9", notes: "Pancreatic/GI cancer marker" },
    { name: "AFP", notes: "Liver cancer marker" },
  ].map((t) => ({ ...t, category: "Cancer markers", labDepartment: "Immunology" })),

  // 11. Cardiac markers
  ...["Troponin I", "CK-MB", "Myoglobin", "BNP"].map((name) => ({
    name,
    category: "Cardiac markers",
    labDepartment: "Chemical Pathology",
  })),

  // 12. Nutritional deficiency
  ...[
    "Vitamin A",
    "Vitamin B1",
    "Vitamin B2",
    "Vitamin B3",
    "Vitamin B6",
    "Vitamin D3",
    "Vitamin E",
    "Vitamin C",
    "Vitamin K",
    "Essential Amino Acids",
    "Trace Elements",
  ].map((name) => ({ name, category: "Nutritional deficiency", labDepartment: "Chemical Pathology" })),

  // 13. Allergy
  {
    name: "Allergy Panel",
    category: "Allergy",
    labDepartment: "Immunology",
  },

  // 14. Drugs / toxicology
  ...[
    "Tramadol",
    "Marijuana",
    "Opiate",
    "MDMA",
    "Ketamine",
    "Cotinine",
    "Benzodiazepines",
    "Barbiturates",
    "Alcohol",
    "Amphetamine",
    "Morphine",
    "Cocaine",
  ].map((name) => ({ name, category: "Drugs & toxicology", labDepartment: "Chemical Pathology" })),
];
