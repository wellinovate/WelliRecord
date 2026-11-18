// Structured lab test catalog: each test lists its analytes with unit, type, reference ranges and critical limits.
// Used by lab_result_engine.js to flag results and compute derived values.
//
// IMPORTANT: every range here is a default adult reference range taken from commonly published values.
// Nothing is reviewed yet (REVIEW_STATUS). Reference intervals depend on the analyser, the reagent kit and the
// population, so each lab must verify them before relying on the flags. Ranges for children are not set:
// a result for a child is recorded without a flag rather than being compared with an adult range.
// Immunoassay values that depend on the kit (troponin, FSH, LH, BNP and similar) have no range on purpose.
//
// Not included: LOINC codes (none are set rather than risk a wrong code), and cycle-dependent hormone ranges.

export const CATALOG_VERSION = "2026-11-17.1";
export const REVIEW_STATUS = "pending_clinical_review";

// ---------- builders ----------
const ADULT = { ageMin: 18, ageMax: 200 };
const n = (code, name, unit, o = {}) => ({
  code, name, type: "numeric", unit, dp: o.dp ?? 1, min: o.min ?? 0, max: o.max,
  ranges: o.ranges || [], altUnits: o.alt, refNote: o.ref,
});
const any = (low, high, o = {}) => ({ sex: "any", low, high, ...o }); // all ages
const adult = (low, high, o = {}) => ({ sex: "any", ...ADULT, low, high, ...o }); // 18 and over
const male = (low, high, o = {}) => ({ sex: "M", ...ADULT, low, high, ...o });
const female = (low, high, o = {}) => ({ sex: "F", ...ADULT, low, high, ...o });
const ch = (code, name, options, o = {}) => ({ code, name, type: "choice", options, abnormal: o.abnormal || [], critical: o.critical || [], refNote: o.ref });
const tx = (code, name) => ({ code, name, type: "text" });
const calc = (code, name, formula, unit, o = {}) => ({
  code, name, type: "calculated", formula, unit, dp: o.dp ?? 1, ranges: o.ranges || [], refNote: o.ref,
});

const NEG_POS = ["Negative", "Positive"];
const NR_R = ["Non-reactive", "Reactive"];
const GRADE = ["Negative", "Trace", "+", "++", "+++", "++++"];
const AMOUNT = ["Nil", "Few", "Moderate", "Many"];

const ANTIBIOTICS = [
  "Amoxicillin", "Amoxicillin-clavulanate", "Ampicillin", "Cloxacillin", "Cefuroxime", "Cefixime", "Ceftriaxone",
  "Ceftazidime", "Ciprofloxacin", "Levofloxacin", "Ofloxacin", "Gentamicin", "Amikacin", "Nitrofurantoin",
  "Cotrimoxazole", "Erythromycin", "Azithromycin", "Clindamycin", "Doxycycline", "Tetracycline", "Chloramphenicol",
  "Meropenem", "Imipenem", "Vancomycin",
];

// ---------- analyte library ----------
// Codes matter: the formulas in the engine read hb, pcv, rbc, tc, hdl, tg, tbil, dbil, tp, alb, na, cl, hco3, creat.
const A = {
  // Haematology
  hb: n("hb", "Haemoglobin", "g/dL", { min: 1, max: 30, alt: [{ unit: "g/L", factor: 0.1 }], ranges: [male(13.0, 17.0, { critLow: 7.0, critHigh: 20.0 }), female(12.0, 15.5, { critLow: 7.0, critHigh: 20.0 })] }),
  pcv: n("pcv", "PCV (haematocrit)", "%", { dp: 0, min: 5, max: 75, ranges: [male(40, 52, { critLow: 20, critHigh: 60 }), female(36, 46, { critLow: 20, critHigh: 60 })] }),
  rbc: n("rbc", "Red cell count", "x10^12/L", { dp: 2, min: 1, max: 9, ranges: [male(4.5, 5.9), female(4.1, 5.1)] }),
  mcv: calc("mcv", "MCV", "mcv", "fL", { ranges: [adult(80, 100)] }),
  mch: calc("mch", "MCH", "mch", "pg", { ranges: [adult(27, 33)] }),
  mchc: calc("mchc", "MCHC", "mchc", "g/dL", { ranges: [adult(32, 36)] }),
  rdw: n("rdw", "RDW", "%", { min: 5, max: 40, ranges: [adult(11.5, 14.5)] }),
  wbc: n("wbc", "White cell count", "x10^9/L", { min: 0.1, max: 500, ranges: [adult(4.0, 11.0, { critLow: 2.0, critHigh: 30.0 })] }),
  neut: n("neut", "Neutrophils", "%", { dp: 0, min: 0, max: 100, ranges: [adult(40, 75)] }),
  lymph: n("lymph", "Lymphocytes", "%", { dp: 0, min: 0, max: 100, ranges: [adult(20, 45)] }),
  mono: n("mono", "Monocytes", "%", { dp: 0, min: 0, max: 100, ranges: [adult(2, 10)] }),
  eos: n("eos", "Eosinophils", "%", { dp: 0, min: 0, max: 100, ranges: [adult(1, 6)] }),
  baso: n("baso", "Basophils", "%", { dp: 0, min: 0, max: 100, ranges: [adult(0, 1)] }),
  plt: n("plt", "Platelets", "x10^9/L", { dp: 0, min: 1, max: 3000, ranges: [adult(150, 400, { critLow: 20, critHigh: 1000 })] }),
  esr: n("esr", "ESR (Westergren)", "mm/hr", { dp: 0, min: 0, max: 200, ranges: [male(0, 15), female(0, 20)] }),
  retic: n("retic", "Reticulocytes", "%", { dp: 1, min: 0, max: 40, ranges: [adult(0.5, 2.5)] }),
  pt: n("pt", "Prothrombin time (PT)", "s", { min: 5, max: 200, ranges: [any(11.0, 13.5)] }),
  inr: n("inr", "INR", "", { dp: 2, min: 0.5, max: 15, ranges: [any(0.8, 1.2, { critHigh: 5.0 })], ref: "Target range differs for patients on anticoagulants" }),
  aptt: n("aptt", "APTT", "s", { min: 10, max: 300, ranges: [any(25, 35)] }),
  ddimer: n("ddimer", "D-dimer", "ug/mL FEU", { dp: 2, min: 0, max: 50, ranges: [adult(null, 0.5)], ref: "Depends on the assay" }),
  fib: n("fib", "Fibrinogen", "mg/dL", { dp: 0, min: 20, max: 1500, ranges: [adult(200, 400)] }),

  // Glucose
  glu_f: n("glu_f", "Fasting blood glucose", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }], ranges: [any(70, 99, { critLow: 40, critHigh: 500 })] }),
  glu_r: n("glu_r", "Random blood glucose", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }], ranges: [any(70, 139, { critLow: 40, critHigh: 500 })] }),
  glu_pp: n("glu_pp", "Blood glucose, 2 hours after meal", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }], ranges: [any(70, 139, { critLow: 40, critHigh: 500 })] }),
  hba1c: n("hba1c", "HbA1c", "%", { min: 2, max: 20, ranges: [adult(4.0, 5.6)], ref: "5.7 to 6.4 and 6.5 or more are higher than the usual range" }),
  ogtt_0: n("ogtt_0", "Glucose, fasting (0 min)", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }], ranges: [any(70, 99, { critLow: 40, critHigh: 500 })] }),
  ogtt_60: n("ogtt_60", "Glucose, 60 min", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }] }),
  ogtt_120: n("ogtt_120", "Glucose, 120 min", "mg/dL", { dp: 0, min: 5, max: 1500, alt: [{ unit: "mmol/L", factor: 18.016 }], ranges: [any(70, 139, { critLow: 40, critHigh: 500 })] }),

  // Electrolytes, kidney
  na: n("na", "Sodium", "mmol/L", { dp: 0, min: 80, max: 200, ranges: [any(135, 145, { critLow: 120, critHigh: 160 })] }),
  k: n("k", "Potassium", "mmol/L", { min: 1, max: 12, ranges: [any(3.5, 5.1, { critLow: 2.5, critHigh: 6.5 })] }),
  cl: n("cl", "Chloride", "mmol/L", { dp: 0, min: 60, max: 150, ranges: [any(98, 107)] }),
  hco3: n("hco3", "Bicarbonate", "mmol/L", { dp: 0, min: 2, max: 60, ranges: [any(22, 29)] }),
  urea: n("urea", "Urea", "mg/dL", { dp: 0, min: 1, max: 500, alt: [{ unit: "mmol/L", factor: 6.006 }], ranges: [adult(15, 45)] }),
  creat: n("creat", "Creatinine", "mg/dL", { dp: 2, min: 0.1, max: 30, alt: [{ unit: "umol/L", factor: 0.01131 }], ranges: [male(0.7, 1.3), female(0.6, 1.1)] }),
  egfr: calc("egfr", "eGFR (CKD-EPI 2021)", "egfr", "mL/min/1.73m2", { dp: 0, ranges: [adult(60, null)], ref: "Adults only. 60 or more is the usual range" }),
  ag: calc("ag", "Anion gap", "anion_gap", "mmol/L", { dp: 0, ranges: [any(8, 16)] }),
  ca: n("ca", "Calcium", "mg/dL", { min: 2, max: 25, alt: [{ unit: "mmol/L", factor: 4.008 }], ranges: [any(8.6, 10.2, { critLow: 6.5, critHigh: 13.0 })] }),
  phos: n("phos", "Phosphate", "mg/dL", { min: 0.3, max: 20, ranges: [adult(2.5, 4.5)] }),
  mg: n("mg", "Magnesium", "mg/dL", { min: 0.3, max: 10, ranges: [any(1.7, 2.2)] }),
  uric: n("uric", "Uric acid", "mg/dL", { min: 0.5, max: 25, ranges: [male(3.4, 7.0), female(2.4, 6.0)] }),

  // Liver
  alt: n("alt", "ALT (SGPT)", "U/L", { dp: 0, min: 1, max: 5000, ranges: [adult(7, 56)] }),
  ast: n("ast", "AST (SGOT)", "U/L", { dp: 0, min: 1, max: 5000, ranges: [adult(10, 40)] }),
  alp: n("alp", "Alkaline phosphatase", "U/L", { dp: 0, min: 1, max: 3000, ranges: [adult(44, 147)] }),
  ggt: n("ggt", "GGT", "U/L", { dp: 0, min: 1, max: 3000, ranges: [male(8, 61), female(5, 36)] }),
  tbil: n("tbil", "Total bilirubin", "mg/dL", { dp: 2, min: 0.05, max: 60, alt: [{ unit: "umol/L", factor: 0.0585 }], ranges: [adult(0.3, 1.2)] }),
  dbil: n("dbil", "Direct bilirubin", "mg/dL", { dp: 2, min: 0, max: 40, alt: [{ unit: "umol/L", factor: 0.0585 }], ranges: [adult(0, 0.3)] }),
  ibil: calc("ibil", "Indirect bilirubin", "indirect_bili", "mg/dL", { dp: 2, ranges: [adult(0.2, 0.9)] }),
  tp: n("tp", "Total protein", "g/dL", { min: 1, max: 15, ranges: [adult(6.0, 8.3)] }),
  alb: n("alb", "Albumin", "g/dL", { min: 0.5, max: 8, ranges: [adult(3.5, 5.0)] }),
  glob: calc("glob", "Globulin", "globulin", "g/dL", { ranges: [adult(2.0, 3.5)] }),
  agr: calc("agr", "Albumin/globulin ratio", "ag_ratio", "", { dp: 2, ranges: [adult(1.1, 2.5)] }),
  ldh: n("ldh", "LDH", "U/L", { dp: 0, min: 10, max: 5000, ranges: [adult(140, 280)] }),
  amylase: n("amylase", "Amylase", "U/L", { dp: 0, min: 1, max: 5000, ranges: [adult(30, 110)] }),
  lipase: n("lipase", "Lipase", "U/L", { dp: 0, min: 1, max: 5000, ranges: [adult(0, 160)] }),
  ck: n("ck", "Creatine kinase (CK)", "U/L", { dp: 0, min: 1, max: 50000, ranges: [male(39, 308), female(26, 192)] }),

  // Lipids (risk thresholds rather than reference intervals)
  tc: n("tc", "Total cholesterol", "mg/dL", { dp: 0, min: 20, max: 1500, alt: [{ unit: "mmol/L", factor: 38.67 }], ranges: [adult(null, 200, { text: "< 200 desirable" })] }),
  tg: n("tg", "Triglycerides", "mg/dL", { dp: 0, min: 10, max: 5000, alt: [{ unit: "mmol/L", factor: 88.57 }], ranges: [adult(null, 150, { text: "< 150 desirable" })] }),
  hdl: n("hdl", "HDL cholesterol", "mg/dL", { dp: 0, min: 5, max: 200, alt: [{ unit: "mmol/L", factor: 38.67 }], ranges: [male(40, null, { text: "> 40" }), female(50, null, { text: "> 50" })] }),
  ldl: calc("ldl", "LDL cholesterol (calculated)", "ldl", "mg/dL", { dp: 0, ranges: [adult(null, 130, { text: "< 130 (optimal < 100)" })], ref: "Not calculated when triglycerides are 400 mg/dL or more" }),
  vldl: calc("vldl", "VLDL cholesterol (calculated)", "vldl", "mg/dL", { dp: 0, ranges: [adult(null, 30)] }),
  nonhdl: calc("nonhdl", "Non-HDL cholesterol", "non_hdl", "mg/dL", { dp: 0 }),
  tchdl: calc("tchdl", "Total cholesterol / HDL ratio", "tc_hdl_ratio", "", { ranges: [adult(null, 5.0)] }),

  // Thyroid
  tsh: n("tsh", "TSH", "mIU/L", { dp: 2, min: 0.001, max: 500, ranges: [adult(0.4, 4.0)] }),
  ft4: n("ft4", "Free T4", "ng/dL", { dp: 2, min: 0.05, max: 10, ranges: [adult(0.8, 1.8)] }),
  ft3: n("ft3", "Free T3", "pg/mL", { dp: 2, min: 0.1, max: 30, ranges: [adult(2.3, 4.2)] }),
  t3: n("t3", "Total T3", "ng/dL", { dp: 0, min: 10, max: 1000, ranges: [adult(80, 200)] }),
  t4: n("t4", "Total T4", "ug/dL", { dp: 1, min: 0.5, max: 40, ranges: [adult(5.0, 12.0)] }),

  // Nutrition and iron
  ferritin: n("ferritin", "Ferritin", "ng/mL", { dp: 0, min: 1, max: 10000, ranges: [male(24, 336), female(11, 307)] }),
  iron: n("iron", "Serum iron", "ug/dL", { dp: 0, min: 1, max: 1000, ranges: [adult(60, 170)] }),
  tibc: n("tibc", "TIBC", "ug/dL", { dp: 0, min: 50, max: 1000, ranges: [adult(240, 450)] }),
  b12: n("b12", "Vitamin B12", "pg/mL", { dp: 0, min: 10, max: 10000, ranges: [adult(200, 900)] }),
  folate: n("folate", "Folate", "ng/mL", { min: 0.1, max: 100, ranges: [adult(3.0, null, { text: "> 3.0" })] }),
  vitd: n("vitd", "Vitamin D, 25-hydroxy", "ng/mL", { min: 1, max: 300, ranges: [adult(30, 100)] }),

  // Hormones and tumour markers
  prolactin: n("prolactin", "Prolactin", "ng/mL", { min: 0.5, max: 1000, ranges: [male(4.0, 15.2), female(4.8, 23.3)] }),
  testo: n("testo", "Testosterone, total", "ng/dL", { dp: 0, min: 1, max: 3000, ranges: [male(300, 1000), female(15, 70)] }),
  psa: n("psa", "PSA, total", "ng/mL", { dp: 2, min: 0, max: 1000, ranges: [male(null, 4.0)] }),
  afp: n("afp", "AFP", "ng/mL", { dp: 1, min: 0, max: 100000, ranges: [adult(null, 10)] }),
  cea: n("cea", "CEA", "ng/mL", { dp: 1, min: 0, max: 10000, ranges: [adult(null, 5.0)], ref: "Smokers can be higher" }),
  ca125: n("ca125", "CA 125", "U/mL", { dp: 1, min: 0, max: 100000, ranges: [female(null, 35)] }),
  ca153: n("ca153", "CA 15-3", "U/mL", { dp: 1, min: 0, max: 100000, ranges: [adult(null, 30)] }),
  ca199: n("ca199", "CA 19-9", "U/mL", { dp: 1, min: 0, max: 100000, ranges: [adult(null, 37)] }),
  crp: n("crp", "C-reactive protein (CRP)", "mg/L", { dp: 1, min: 0, max: 1000, ranges: [adult(null, 5)] }),
  aso: n("aso", "ASO titre", "IU/mL", { dp: 0, min: 0, max: 5000, ranges: [adult(null, 200)] }),
  bhcg: n("bhcg", "Beta-hCG, quantitative", "mIU/mL", { dp: 1, min: 0, max: 1000000, ref: "Interpret with the gestational age" }),

  // Kit-dependent immunoassays (no auto range)
  trop: n("trop", "Troponin I", "ng/mL", { dp: 3, min: 0, max: 1000, ref: "Per assay: use the kit's 99th percentile" }),
  ckmb: n("ckmb", "CK-MB", "ng/mL", { dp: 1, min: 0, max: 1000, ref: "Per assay" }),
  myo: n("myo", "Myoglobin", "ng/mL", { dp: 1, min: 0, max: 10000, ref: "Per assay" }),
  bnp: n("bnp", "BNP", "pg/mL", { dp: 0, min: 0, max: 100000, ref: "Per assay" }),
  fsh: n("fsh", "FSH", "mIU/mL", { dp: 1, min: 0, max: 500, ref: "Depends on cycle phase and kit" }),
  lh: n("lh", "LH", "mIU/mL", { dp: 1, min: 0, max: 500, ref: "Depends on cycle phase and kit" }),
  e2: n("e2", "Oestradiol", "pg/mL", { dp: 0, min: 0, max: 10000, ref: "Depends on cycle phase and kit" }),
  prog: n("prog", "Progesterone", "ng/mL", { dp: 1, min: 0, max: 500, ref: "Depends on cycle phase and kit" }),
  amh: n("amh", "AMH", "ng/mL", { dp: 2, min: 0, max: 100, ref: "Depends on age and kit" }),
  rf: n("rf", "Rheumatoid factor", "IU/mL", { dp: 0, min: 0, max: 5000, ref: "Per kit" }),

  // Urinalysis
  u_colour: tx("u_colour", "Colour"),
  u_appear: ch("u_appear", "Appearance", ["Clear", "Slightly turbid", "Turbid", "Bloody"], { abnormal: ["Turbid", "Bloody"] }),
  u_ph: n("u_ph", "pH", "", { dp: 1, min: 3, max: 10, ranges: [any(4.5, 8.0)] }),
  u_sg: n("u_sg", "Specific gravity", "", { dp: 3, min: 1.0, max: 1.06, ranges: [any(1.005, 1.030)] }),
  u_prot: ch("u_prot", "Protein", GRADE, { abnormal: GRADE.slice(1) }),
  u_glu: ch("u_glu", "Glucose", GRADE, { abnormal: GRADE.slice(1) }),
  u_ket: ch("u_ket", "Ketones", GRADE, { abnormal: GRADE.slice(1) }),
  u_blood: ch("u_blood", "Blood", GRADE, { abnormal: GRADE.slice(1) }),
  u_bili: ch("u_bili", "Bilirubin", GRADE, { abnormal: GRADE.slice(1) }),
  u_uro: ch("u_uro", "Urobilinogen", ["Normal", "+", "++", "+++"], { abnormal: ["+", "++", "+++"] }),
  u_nit: ch("u_nit", "Nitrite", NEG_POS, { abnormal: ["Positive"] }),
  u_leuk: ch("u_leuk", "Leukocyte esterase", GRADE, { abnormal: GRADE.slice(1) }),
  u_pus: n("u_pus", "Pus cells (WBC)", "/HPF", { dp: 0, min: 0, max: 1000, ranges: [any(0, 5)] }),
  u_rbc: n("u_rbc", "Red cells", "/HPF", { dp: 0, min: 0, max: 1000, ranges: [any(0, 3)] }),
  u_epi: ch("u_epi", "Epithelial cells", AMOUNT),
  u_cast: tx("u_cast", "Casts"),
  u_cryst: tx("u_cryst", "Crystals"),
  u_bact: ch("u_bact", "Bacteria", AMOUNT, { abnormal: ["Moderate", "Many"] }),
  u_yeast: ch("u_yeast", "Yeast cells", ["Nil", "Present"], { abnormal: ["Present"] }),
  u_sh: ch("u_sh", "Schistosoma haematobium ova", ["Not seen", "Seen"], { abnormal: ["Seen"] }),

  // Stool
  s_colour: tx("s_colour", "Colour"),
  s_consist: ch("s_consist", "Consistency", ["Formed", "Soft", "Loose", "Watery"]),
  s_mucus: ch("s_mucus", "Mucus", ["Nil", "Present"], { abnormal: ["Present"] }),
  s_blood: ch("s_blood", "Visible blood", ["Nil", "Present"], { abnormal: ["Present"] }),
  s_ova: tx("s_ova", "Ova, cysts and parasites"),
  s_pus: ch("s_pus", "Pus cells", AMOUNT, { abnormal: ["Moderate", "Many"] }),

  // Semen (WHO 2021 lower reference limits)
  sm_vol: n("sm_vol", "Volume", "mL", { min: 0, max: 20, ranges: [male(1.4, null, { text: ">= 1.4" })] }),
  sm_ph: n("sm_ph", "pH", "", { min: 5, max: 10, ranges: [male(7.2, null, { text: ">= 7.2" })] }),
  sm_conc: n("sm_conc", "Sperm concentration", "million/mL", { min: 0, max: 500, ranges: [male(16, null, { text: ">= 16" })] }),
  sm_total: n("sm_total", "Total sperm number", "million/ejaculate", { min: 0, max: 5000, ranges: [male(39, null, { text: ">= 39" })] }),
  sm_motil: n("sm_motil", "Total motility", "%", { dp: 0, min: 0, max: 100, ranges: [male(42, null, { text: ">= 42" })] }),
  sm_prog: n("sm_prog", "Progressive motility", "%", { dp: 0, min: 0, max: 100, ranges: [male(30, null, { text: ">= 30" })] }),
  sm_vital: n("sm_vital", "Vitality", "%", { dp: 0, min: 0, max: 100, ranges: [male(54, null, { text: ">= 54" })] }),
  sm_morph: n("sm_morph", "Normal forms", "%", { dp: 0, min: 0, max: 100, ranges: [male(4, null, { text: ">= 4" })] }),
  sm_wbc: n("sm_wbc", "Pus cells", "million/mL", { dp: 1, min: 0, max: 100, ranges: [male(null, 1.0, { text: "< 1.0" })] }),
  sm_appear: tx("sm_appear", "Appearance and liquefaction"),

  // Microbiology
  gram: tx("gram", "Gram stain"),
  growth: ch("growth", "Culture", ["No growth", "Growth"], { abnormal: ["Growth"] }),
  organism: tx("organism", "Organism isolated"),
  colony: tx("colony", "Colony count"),
  sens: { code: "sens", name: "Antibiotic sensitivity", type: "sensitivity", options: ANTIBIOTICS },
  comment: tx("comment", "Comment"),
};

const pick = (...codes) =>
  codes.map((c) => {
    if (!A[c]) throw new Error(`catalog: unknown analyte ${c}`);
    return A[c];
  });

const culture = () => pick("gram", "growth", "organism", "colony", "sens", "comment");
const NP = (code, name) => ch(code, name, NEG_POS, { abnormal: ["Positive"] });
const NRR = (code, name) => ch(code, name, NR_R, { abnormal: ["Reactive"] });

// ---------- tests ----------
// t(key, name, category, department, analytes, extra)
const t = (key, name, category, labDepartment, analytes, extra = {}) => ({
  key, name, category, labDepartment, analytes,
  specimen: extra.specimen, container: extra.container, fasting: extra.fasting || false,
  turnaroundHours: extra.tat, aliases: extra.aliases || [], notes: extra.notes || "",
});
// A test with one analyte from the library.
const single = (key, name, category, labDepartment, code, extra) => t(key, name, category, labDepartment, pick(code), extra);

const HAEM = "Haematology";
const COAG = "Coagulation";
const CHEM = "Chemistry";
const SERO = "Serology";
const MICRO = "Microbiology";
const DEPT_H = "Hematology";
const DEPT_C = "Chemical Pathology";
const DEPT_I = "Immunology";
const DEPT_M = "Microbiology";
const DEPT_P = "Histopathology";
const EDTA = "EDTA (purple)";
const SERUM = "Plain or gel (red or gold)";
const FLUORIDE = "Fluoride oxalate (grey)";
const CITRATE = "Citrate (blue)";

export const STRUCTURED_TESTS = [
  // Haematology
  t("fbc", "Full blood count (FBC)", HAEM, DEPT_H,
    pick("hb", "pcv", "rbc", "mcv", "mch", "mchc", "rdw", "wbc", "neut", "lymph", "mono", "eos", "baso", "plt"),
    { specimen: "Whole blood", container: EDTA, tat: 4, aliases: ["FBC", "CBC", "Complete blood count", "Full blood count"] }),
  single("hb", "Haemoglobin (Hb)", HAEM, DEPT_H, "hb", { specimen: "Whole blood", container: EDTA, tat: 2, aliases: ["Hb", "Haemoglobin", "Hemoglobin"] }),
  single("pcv", "PCV (haematocrit)", HAEM, DEPT_H, "pcv", { specimen: "Whole blood", container: EDTA, tat: 2, aliases: ["PCV", "Haematocrit", "Hematocrit"] }),
  single("esr", "ESR", HAEM, DEPT_H, "esr", { specimen: "Whole blood", container: EDTA, tat: 2, aliases: ["ESR", "Erythrocyte sedimentation rate"] }),
  single("retic", "Reticulocyte count", HAEM, DEPT_H, "retic", { specimen: "Whole blood", container: EDTA, tat: 4 }),
  t("blood_group", "Blood group and Rhesus", HAEM, DEPT_H, [
    ch("abo", "ABO group", ["A", "B", "AB", "O"]),
    ch("rh", "Rhesus (D)", ["Positive", "Negative"]),
  ], { specimen: "Whole blood", container: EDTA, tat: 2, aliases: ["Blood group", "ABO and Rh", "Blood grouping"] }),
  t("genotype", "Haemoglobin genotype", HAEM, DEPT_H, [
    ch("geno", "Genotype", ["AA", "AS", "AC", "SS", "SC", "CC"], { abnormal: ["AS", "AC", "SS", "SC", "CC"] }),
  ], { specimen: "Whole blood", container: EDTA, tat: 24, aliases: ["Genotype", "Hb electrophoresis"] }),
  t("sickling", "Sickling test", HAEM, DEPT_H, [NP("sickling", "Sickling test")], { specimen: "Whole blood", container: EDTA, tat: 4 }),
  t("g6pd", "G6PD screen", HAEM, DEPT_H, [ch("g6pd", "G6PD", ["Normal", "Deficient"], { abnormal: ["Deficient"] })], { specimen: "Whole blood", container: EDTA, tat: 24 }),
  t("blood_film", "Blood film comment", HAEM, DEPT_H, [tx("rbc_morph", "Red cell morphology"), tx("wbc_morph", "White cell morphology"), tx("plt_morph", "Platelets"), tx("film_comment", "Comment")], { specimen: "Whole blood", container: EDTA, tat: 24 }),
  t("malaria_mp", "Malaria parasite (MP) film", HAEM, DEPT_H, [
    ch("mp", "Malaria parasite", ["Not seen", "Seen"], { abnormal: ["Seen"] }),
    ch("species", "Species", ["Plasmodium falciparum", "P. malariae", "P. ovale", "P. vivax", "Mixed"]),
    ch("density", "Density", ["+", "++", "+++", "++++"]),
  ], { specimen: "Whole blood", container: EDTA, tat: 2, aliases: ["Malaria Test", "Malaria parasite", "MP", "Malaria"] }),
  t("malaria_rdt", "Malaria rapid test (RDT)", HAEM, DEPT_H, [NP("rdt", "Malaria antigen")], { specimen: "Whole blood", container: EDTA, tat: 1, aliases: ["Malaria RDT"] }),
  t("mf", "Microfilaria test", HAEM, DEPT_H, [ch("mf", "Microfilariae", ["Not seen", "Seen"], { abnormal: ["Seen"] }), tx("mf_type", "Type")], { specimen: "Whole blood", container: EDTA, tat: 4, aliases: ["Microfilarial Test"] }),
  t("coombs", "Direct Coombs test", HAEM, DEPT_H, [NP("dct", "Direct antiglobulin test")], { specimen: "Whole blood", container: EDTA, tat: 4 }),

  // Coagulation
  t("pt_inr", "PT / INR", COAG, DEPT_H, pick("pt", "inr"), { specimen: "Plasma", container: CITRATE, tat: 4, aliases: ["PT", "INR", "Prothrombin time"] }),
  single("aptt", "APTT", COAG, DEPT_H, "aptt", { specimen: "Plasma", container: CITRATE, tat: 4, aliases: ["PTTK", "Partial thromboplastin time"] }),
  single("ddimer", "D-dimer", COAG, DEPT_H, "ddimer", { specimen: "Plasma", container: CITRATE, tat: 4 }),
  single("fibrinogen", "Fibrinogen", COAG, DEPT_H, "fib", { specimen: "Plasma", container: CITRATE, tat: 4 }),

  // Diabetes
  single("fbs", "Fasting blood sugar (FBS)", "Diabetes profile", DEPT_C, "glu_f", { specimen: "Plasma", container: FLUORIDE, fasting: true, tat: 2, aliases: ["Fasting Blood Sugar", "FBS", "Fasting glucose", "Blood Glucose"] }),
  single("rbs", "Random blood sugar (RBS)", "Diabetes profile", DEPT_C, "glu_r", { specimen: "Plasma", container: FLUORIDE, tat: 2, aliases: ["Random Blood Sugar", "RBS"] }),
  single("pp2", "Blood glucose 2 hours post meal", "Diabetes profile", DEPT_C, "glu_pp", { specimen: "Plasma", container: FLUORIDE, tat: 2, aliases: ["Glucose 2 Hours PP", "2HPP", "2 hour post prandial"] }),
  single("hba1c", "HbA1c", "Diabetes profile", DEPT_C, "hba1c", { specimen: "Whole blood", container: EDTA, tat: 24, aliases: ["Glycated haemoglobin", "A1c"] }),
  t("ogtt", "Oral glucose tolerance test (OGTT)", "Diabetes profile", DEPT_C, pick("ogtt_0", "ogtt_60", "ogtt_120"), { specimen: "Plasma", container: FLUORIDE, fasting: true, tat: 4, aliases: ["OGTT"] }),

  // Kidney, electrolytes
  t("euc", "Electrolytes, urea and creatinine (E/U/Cr)", "Organ function", DEPT_C,
    pick("na", "k", "cl", "hco3", "urea", "creat", "egfr", "ag"),
    { specimen: "Serum", container: SERUM, tat: 4, aliases: ["E/U/Cr", "EUCr", "Kidney Function Test (KFT)", "Kidney function test", "KFT", "Renal function test", "RFT"] }),
  single("na", "Sodium", CHEM, DEPT_C, "na", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Sodium"] }),
  single("k", "Potassium", CHEM, DEPT_C, "k", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Potassium"] }),
  single("cl", "Chloride", CHEM, DEPT_C, "cl", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Chloride"] }),
  single("hco3", "Bicarbonate", CHEM, DEPT_C, "hco3", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Bicarbonate"] }),
  single("urea", "Urea", CHEM, DEPT_C, "urea", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Urea", "BUN"] }),
  t("creat", "Creatinine and eGFR", CHEM, DEPT_C, pick("creat", "egfr"), { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Creatinine"] }),
  t("calcium", "Calcium, phosphate and magnesium", CHEM, DEPT_C, pick("ca", "phos", "mg"), { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Calcium", "Bone profile"] }),
  single("uric", "Uric acid", CHEM, DEPT_C, "uric", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Urate"] }),

  // Liver
  t("lft", "Liver function test (LFT)", "Organ function", DEPT_C,
    pick("tbil", "dbil", "ibil", "ast", "alt", "alp", "ggt", "tp", "alb", "glob", "agr"),
    { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Liver Function Test (LFT)", "LFT", "Liver function test"] }),
  single("alt", "ALT (SGPT)", CHEM, DEPT_C, "alt", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["ALT (SGOT)", "ALT", "SGPT"] }),
  single("ast", "AST (SGOT)", CHEM, DEPT_C, "ast", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["AST", "SGOT"] }),
  single("alp", "Alkaline phosphatase (ALP)", CHEM, DEPT_C, "alp", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["ALP"] }),
  single("ggt", "GGT", CHEM, DEPT_C, "ggt", { specimen: "Serum", container: SERUM, tat: 4 }),
  t("bili", "Bilirubin (total, direct, indirect)", CHEM, DEPT_C, pick("tbil", "dbil", "ibil"), { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Total Bilirubin", "Direct Bilirubin"] }),
  t("proteins", "Total protein, albumin and globulin", CHEM, DEPT_C, pick("tp", "alb", "glob", "agr"), { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Albumin", "Total Protein"] }),
  single("ldh", "LDH", CHEM, DEPT_C, "ldh", { specimen: "Serum", container: SERUM, tat: 4 }),
  t("pancreatic", "Pancreatic enzymes (amylase, lipase)", "Organ function", DEPT_C, pick("amylase", "lipase"), { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Pancreatic Function Test"] }),

  // Lipids
  t("lipid", "Lipid profile", "Lipid profile", DEPT_C, pick("tc", "tg", "hdl", "ldl", "vldl", "nonhdl", "tchdl"), { specimen: "Serum", container: SERUM, fasting: true, tat: 4, aliases: ["Lipid profile", "Lipid panel"] }),
  single("tc", "Total cholesterol", "Lipid profile", DEPT_C, "tc", { specimen: "Serum", container: SERUM, fasting: true, tat: 4, aliases: ["Cholesterol"] }),
  single("tg", "Triglycerides", "Lipid profile", DEPT_C, "tg", { specimen: "Serum", container: SERUM, fasting: true, tat: 4, aliases: ["Triglycerides"] }),
  single("hdl", "HDL cholesterol", "Lipid profile", DEPT_C, "hdl", { specimen: "Serum", container: SERUM, fasting: true, tat: 4, aliases: ["HDL"] }),

  // Thyroid
  t("tft", "Thyroid function (TSH, FT3, FT4)", "Thyroid", DEPT_C, pick("tsh", "ft3", "ft4"), { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Thyroid profile", "TFT"] }),
  single("tsh", "TSH", "Thyroid", DEPT_C, "tsh", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("t3", "T3 (total)", "Thyroid", DEPT_C, "t3", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["T3"] }),
  single("t4", "T4 (total)", "Thyroid", DEPT_C, "t4", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["T4"] }),
  single("ft3", "Free T3", "Thyroid", DEPT_C, "ft3", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("ft4", "Free T4", "Thyroid", DEPT_C, "ft4", { specimen: "Serum", container: SERUM, tat: 24 }),

  // Cardiac
  single("trop", "Troponin I", "Cardiac markers", DEPT_C, "trop", { specimen: "Serum", container: SERUM, tat: 2 }),
  single("ckmb", "CK-MB", "Cardiac markers", DEPT_C, "ckmb", { specimen: "Serum", container: SERUM, tat: 2 }),
  single("myo", "Myoglobin", "Cardiac markers", DEPT_C, "myo", { specimen: "Serum", container: SERUM, tat: 2 }),
  single("bnp", "BNP", "Cardiac markers", DEPT_C, "bnp", { specimen: "Plasma", container: EDTA, tat: 4 }),
  single("ck", "Creatine kinase (CK)", "Cardiac markers", DEPT_C, "ck", { specimen: "Serum", container: SERUM, tat: 4 }),

  // Nutrition and iron
  t("iron_studies", "Iron studies", "Nutritional deficiency", DEPT_C, pick("iron", "tibc", "ferritin"), { specimen: "Serum", container: SERUM, fasting: true, tat: 24 }),
  single("ferritin", "Ferritin", "Nutritional deficiency", DEPT_C, "ferritin", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("b12", "Vitamin B12", "Nutritional deficiency", DEPT_C, "b12", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("folate", "Folate", "Nutritional deficiency", DEPT_C, "folate", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("vitd", "Vitamin D (25-hydroxy)", "Nutritional deficiency", DEPT_C, "vitd", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Vitamin D3"] }),

  // Hormones, fertility
  single("fsh", "FSH", "Fertility & hormonal profile", DEPT_I, "fsh", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("lh", "LH", "Fertility & hormonal profile", DEPT_I, "lh", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("prolactin", "Prolactin", "Fertility & hormonal profile", DEPT_I, "prolactin", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("progesterone", "Progesterone", "Fertility & hormonal profile", DEPT_I, "prog", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("estradiol", "Oestradiol (E2)", "Fertility & hormonal profile", DEPT_I, "e2", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Estradiol"] }),
  single("testosterone", "Testosterone (total)", "Fertility & hormonal profile", DEPT_I, "testo", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("amh", "AMH", "Fertility & hormonal profile", DEPT_I, "amh", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("bhcg_q", "Beta-hCG (quantitative)", "Fertility & hormonal profile", DEPT_I, "bhcg", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["β-hCG"] }),
  t("preg", "Pregnancy test", "Fertility & hormonal profile", DEPT_I, [NP("preg", "hCG")], { specimen: "Urine or serum", container: "Sterile container or plain", tat: 1, aliases: ["Pregnancy"] }),

  // Tumour markers
  single("psa", "PSA (total)", "Cancer markers", DEPT_I, "psa", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["PSA"] }),
  single("cea", "CEA", "Cancer markers", DEPT_I, "cea", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("afp", "AFP", "Cancer markers", DEPT_I, "afp", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("ca125", "CA 125", "Cancer markers", DEPT_I, "ca125", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("ca153", "CA 15-3", "Cancer markers", DEPT_I, "ca153", { specimen: "Serum", container: SERUM, tat: 24 }),
  single("ca199", "CA 19-9", "Cancer markers", DEPT_I, "ca199", { specimen: "Serum", container: SERUM, tat: 24 }),

  // Inflammation, immunology
  single("crp", "C-reactive protein (CRP)", "Serology", DEPT_I, "crp", { specimen: "Serum", container: SERUM, tat: 4, aliases: ["CRP"] }),
  single("aso", "ASO titre", "Serology", DEPT_I, "aso", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["ASO"] }),
  single("rf", "Rheumatoid factor", "Serology", DEPT_I, "rf", { specimen: "Serum", container: SERUM, tat: 24, aliases: ["RF"] }),
  t("ana", "ANA (antinuclear antibody)", "Serology", DEPT_I, [NP("ana", "ANA"), tx("ana_titre", "Titre"), tx("ana_pattern", "Pattern")], { specimen: "Serum", container: SERUM, tat: 72, aliases: ["ANA Test"] }),

  // Infectious disease serology
  t("hiv", "HIV 1 and 2 screening", SERO, DEPT_I, [NRR("hiv", "HIV 1 and 2 antibody")], { specimen: "Serum or whole blood", container: SERUM, tat: 2, aliases: ["HIV 1 & 2 Test", "HIV", "HIV screening"], notes: "A reactive screening result needs confirmation under the national testing algorithm." }),
  t("hbsag", "Hepatitis B surface antigen (HBsAg)", SERO, DEPT_I, [NRR("hbsag", "HBsAg")], { specimen: "Serum", container: SERUM, tat: 2, aliases: ["Hepatitis B", "HBsAg"] }),
  t("hcv", "Hepatitis C antibody (HCV)", SERO, DEPT_I, [NRR("hcv", "HCV antibody")], { specimen: "Serum", container: SERUM, tat: 2, aliases: ["Hepatitis C", "HCV"] }),
  t("hav", "Hepatitis A IgM", SERO, DEPT_I, [NRR("hav", "HAV IgM")], { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Hepatitis A"] }),
  t("hbv_profile", "Hepatitis B profile", SERO, DEPT_I, [NRR("hbsag", "HBsAg"), NRR("hbsab", "HBsAb"), NRR("hbeag", "HBeAg"), NRR("hbeab", "HBeAb"), NRR("hbcab", "HBcAb (total)")], { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Hepatitis B Profile"] }),
  t("syphilis", "Syphilis (VDRL / RPR)", SERO, DEPT_I, [NRR("vdrl", "VDRL / RPR"), tx("vdrl_titre", "Titre")], { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Syphilis (VDRL)", "VDRL", "RPR"] }),
  t("tpha", "Syphilis TPHA", SERO, DEPT_I, [NRR("tpha", "TPHA")], { specimen: "Serum", container: SERUM, tat: 24 }),
  t("hpylori_ab", "H. pylori antibody", SERO, DEPT_I, [NP("hpab", "H. pylori antibody")], { specimen: "Serum", container: SERUM, tat: 2, aliases: ["H. pylori (Ulcer Test)", "H pylori"] }),
  t("hpylori_ag", "H. pylori stool antigen", SERO, DEPT_I, [NP("hpag", "H. pylori antigen")], { specimen: "Stool", container: "Stool container", tat: 4, aliases: ["H. pylori Stool Antigen"] }),
  t("widal", "Widal test", SERO, DEPT_I, [
    ch("o_titre", "Salmonella typhi O", ["Less than 1:20", "1:20", "1:40", "1:80", "1:160", "1:320", "1:640 or more"]),
    ch("h_titre", "Salmonella typhi H", ["Less than 1:20", "1:20", "1:40", "1:80", "1:160", "1:320", "1:640 or more"]),
    tx("widal_comment", "Comment"),
  ], { specimen: "Serum", container: SERUM, tat: 4, aliases: ["Widal Test"], notes: "Significant titre depends on the lab's own cut-off, so no flag is set." }),
  t("typhidot", "Typhoid IgM / IgG rapid test", SERO, DEPT_I, [NP("typ_igm", "Typhoid IgM"), NP("typ_igg", "Typhoid IgG")], { specimen: "Serum", container: SERUM, tat: 2 }),
  t("toxo", "Toxoplasma IgG / IgM", SERO, DEPT_I, [NRR("toxo_igg", "Toxoplasma IgG"), NRR("toxo_igm", "Toxoplasma IgM")], { specimen: "Serum", container: SERUM, tat: 24 }),
  t("rubella", "Rubella IgG / IgM", SERO, DEPT_I, [NRR("rub_igg", "Rubella IgG"), NRR("rub_igm", "Rubella IgM")], { specimen: "Serum", container: SERUM, tat: 24 }),
  t("cmv", "CMV IgG / IgM", SERO, DEPT_I, [NRR("cmv_igg", "CMV IgG"), NRR("cmv_igm", "CMV IgM")], { specimen: "Serum", container: SERUM, tat: 24 }),
  t("hsv1", "Herpes simplex virus 1 IgG / IgM", SERO, DEPT_I, [NRR("hsv1_igg", "HSV 1 IgG"), NRR("hsv1_igm", "HSV 1 IgM")], { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Herpes Simplex Virus 1"] }),
  t("hsv2", "Herpes simplex virus 2 IgG / IgM", SERO, DEPT_I, [NRR("hsv2_igg", "HSV 2 IgG"), NRR("hsv2_igm", "HSV 2 IgM")], { specimen: "Serum", container: SERUM, tat: 24, aliases: ["Herpes Simplex Virus 2"] }),
  t("chlamydia", "Chlamydia", SERO, DEPT_I, [NP("chl", "Chlamydia")], { specimen: "Serum or swab", container: SERUM, tat: 24, aliases: ["Chlamydia"] }),
  t("brucella", "Brucella", SERO, DEPT_I, [NP("bru", "Brucella antibody"), tx("bru_titre", "Titre")], { specimen: "Serum", container: SERUM, tat: 24 }),
  t("dengue", "Dengue NS1 / IgM", SERO, DEPT_I, [NP("ns1", "Dengue NS1 antigen"), NP("dig_m", "Dengue IgM")], { specimen: "Serum", container: SERUM, tat: 4 }),

  // Urine and stool
  t("urinalysis", "Urinalysis (dipstick and microscopy)", "Urinalysis", DEPT_M,
    pick("u_colour", "u_appear", "u_ph", "u_sg", "u_prot", "u_glu", "u_ket", "u_blood", "u_bili", "u_uro", "u_nit", "u_leuk", "u_pus", "u_rbc", "u_epi", "u_cast", "u_cryst", "u_bact", "u_yeast", "u_sh"),
    { specimen: "Mid-stream urine", container: "Sterile container", tat: 2, aliases: ["Urinalysis", "Urine R/E", "Urine routine"] }),
  t("stool_re", "Stool routine examination", "Stool", DEPT_M, pick("s_colour", "s_consist", "s_mucus", "s_blood", "s_pus", "s_ova", "comment"), { specimen: "Stool", container: "Stool container", tat: 4, aliases: ["Stool R/E"] }),
  t("occult", "Stool occult blood", "Stool", DEPT_M, [NP("fob", "Occult blood")], { specimen: "Stool", container: "Stool container", tat: 4, aliases: ["Occult Blood Test", "FOBT"] }),

  // Semen
  t("semen", "Semen analysis", "Semen analysis", DEPT_M,
    pick("sm_appear", "sm_vol", "sm_ph", "sm_conc", "sm_total", "sm_motil", "sm_prog", "sm_vital", "sm_morph", "sm_wbc", "comment"),
    { specimen: "Semen", container: "Sterile container", tat: 4, aliases: ["Semen Analysis", "Seminal fluid analysis", "SFA"], notes: "Collect after 2 to 7 days of abstinence and examine within 1 hour." }),

  // Microbiology culture
  t("urine_mcs", "Urine microscopy, culture and sensitivity", MICRO, DEPT_M, culture(), { specimen: "Mid-stream urine", container: "Sterile container", tat: 72, aliases: ["Urine M/C/S", "UTI Test", "Urine culture"] }),
  t("hvs_mcs", "High vaginal swab M/C/S", MICRO, DEPT_M, culture(), { specimen: "High vaginal swab", container: "Swab", tat: 72, aliases: ["HVS M/C/S"] }),
  t("stool_mcs", "Stool microscopy, culture and sensitivity", MICRO, DEPT_M, culture(), { specimen: "Stool", container: "Stool container", tat: 72, aliases: ["Stool M/C/S"] }),
  t("throat_mcs", "Throat swab M/C/S", MICRO, DEPT_M, culture(), { specimen: "Throat swab", container: "Swab", tat: 72, aliases: ["Throat Swab M/C/S"] }),
  t("wound_mcs", "Wound swab M/C/S", MICRO, DEPT_M, culture(), { specimen: "Wound swab", container: "Swab", tat: 72, aliases: ["Wound Swab M/C/S"] }),
  t("ecs_mcs", "Ear, eye or nose swab M/C/S", MICRO, DEPT_M, culture(), { specimen: "Swab", container: "Swab", tat: 72, aliases: ["ECS M/C/S"] }),
  t("urethral_mcs", "Urethral swab M/C/S", MICRO, DEPT_M, culture(), { specimen: "Urethral swab", container: "Swab", tat: 72, aliases: ["Urethral Swab M/C/S"] }),
  t("sputum_mcs", "Sputum M/C/S", MICRO, DEPT_M, culture(), { specimen: "Sputum", container: "Sterile container", tat: 72 }),
  t("blood_culture", "Blood culture", MICRO, DEPT_M, culture(), { specimen: "Blood", container: "Blood culture bottle", tat: 120, aliases: ["Blood Culture"] }),
  t("semen_mcs", "Semen culture", MICRO, DEPT_M, culture(), { specimen: "Semen", container: "Sterile container", tat: 72, aliases: ["Semen Analysis/M/C/S"] }),
  t("sputum_afb", "Sputum AFB (Ziehl-Neelsen)", MICRO, DEPT_M, [
    ch("afb", "AFB", ["Negative", "Scanty", "1+", "2+", "3+"], { abnormal: ["Scanty", "1+", "2+", "3+"] }),
    tx("afb_comment", "Comment"),
  ], { specimen: "Sputum", container: "Sterile container", tat: 24, aliases: ["Sputum AFB/M/C/S", "AFB"] }),
  t("genexpert", "GeneXpert MTB/RIF", MICRO, DEPT_M, [
    ch("mtb", "MTB", ["Not detected", "Detected"], { abnormal: ["Detected"] }),
    ch("rif", "Rifampicin resistance", ["Not detected", "Detected", "Indeterminate"], { abnormal: ["Detected", "Indeterminate"] }),
  ], { specimen: "Sputum", container: "Sterile container", tat: 4 }),
  t("gonorrhea", "Gonorrhoea (culture or PCR)", MICRO, DEPT_M, [NP("gon", "Neisseria gonorrhoeae"), tx("gon_comment", "Comment")], { specimen: "Swab", container: "Swab", tat: 72, aliases: ["Gonorrhea"] }),

  // Drugs and toxicology (screening)
  ...[
    ["thc", "Marijuana (THC)", ["Marijuana"]], ["cocaine", "Cocaine", []], ["opiates", "Opiates", ["Opiate"]],
    ["amphet", "Amphetamine", []], ["mdma", "MDMA", []], ["ket", "Ketamine", []], ["benzo", "Benzodiazepines", []],
    ["barb", "Barbiturates", []], ["morph", "Morphine", []], ["tramadol", "Tramadol", []], ["cotinine", "Cotinine", []],
  ].map(([key, name, aliases]) =>
    t(`tox_${key}`, `${name} screen`, "Drugs & toxicology", DEPT_C, [NP(key, name)], { specimen: "Urine", container: "Sterile container", tat: 2, aliases, notes: "Screening result. A positive needs confirmation." })),
  t("alcohol", "Alcohol (ethanol)", "Drugs & toxicology", DEPT_C, [n("etoh", "Ethanol", "mg/dL", { dp: 0, min: 0, max: 1000, ref: "Legal limits depend on the use" })], { specimen: "Blood or breath", container: FLUORIDE, tat: 4, aliases: ["Alcohol"] }),

  // Pathology
  t("histology", "Histopathology report", "Pathology & cytology", DEPT_P, [tx("specimen", "Specimen"), tx("clinical", "Clinical information"), tx("gross", "Gross description"), tx("micro", "Microscopy"), tx("diagnosis", "Diagnosis"), tx("comment", "Comment")], { specimen: "Tissue", container: "Formalin", tat: 168 }),
  t("cytology", "Cytology (FNAC / body fluid)", "Pathology & cytology", DEPT_P, [tx("specimen", "Specimen"), tx("micro", "Microscopy"), tx("diagnosis", "Cytological impression"), tx("comment", "Comment")], { specimen: "Aspirate or fluid", container: "Slide or fluid container", tat: 72 }),
  t("pap", "Pap smear", "Pathology & cytology", DEPT_P, [ch("adequacy", "Specimen adequacy", ["Satisfactory", "Unsatisfactory"], { abnormal: ["Unsatisfactory"] }), tx("interpretation", "Interpretation"), tx("comment", "Comment")], { specimen: "Cervical smear", container: "Slide", tat: 168, aliases: ["Pap Smear"] }),
];

export const ALL_ANALYTE_CODES = Object.keys(A);
