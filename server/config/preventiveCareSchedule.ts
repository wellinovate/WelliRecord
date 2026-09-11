/**
 * Preventive Care Schedule — static lookup table.
 * Rules engine reads this as data; no LLM in the decision path.
 * Add rows here to expand coverage — no code changes required elsewhere.
 */

export interface PreventiveCareRule {
  id: string;
  label: string;
  appliesIf: (p: { age: number; sex?: string; conditions?: string[] }) => boolean;
  intervalMonths: number;
  eventType: string; // emitted into the Event outbox
}

const preventiveCareSchedule: PreventiveCareRule[] = [
  {
    id: 'flu_vaccine',
    label: 'Annual Flu Vaccination',
    appliesIf: (p) => p.age >= 18,
    intervalMonths: 12,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'cholesterol_screening',
    label: 'Cholesterol Screening',
    appliesIf: (p) => p.age >= 40,
    intervalMonths: 12,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'blood_pressure_check',
    label: 'Blood Pressure Check',
    appliesIf: (p) => p.age >= 18,
    intervalMonths: 6,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'diabetes_screening',
    label: 'Diabetes Screening (HbA1c)',
    appliesIf: (p) => p.age >= 45,
    intervalMonths: 12,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'cervical_cancer_screening',
    label: 'Cervical Cancer Screening (Pap smear)',
    appliesIf: (p) => p.sex === 'female' && p.age >= 21 && p.age <= 65,
    intervalMonths: 36,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'breast_cancer_screening',
    label: 'Breast Cancer Screening (Mammogram)',
    appliesIf: (p) => p.sex === 'female' && p.age >= 40,
    intervalMonths: 12,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'prostate_screening',
    label: 'Prostate Cancer Screening (PSA)',
    appliesIf: (p) => p.sex === 'male' && p.age >= 50,
    intervalMonths: 12,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'eye_exam',
    label: 'Eye Examination',
    appliesIf: (p) => p.age >= 40,
    intervalMonths: 24,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'dental_checkup',
    label: 'Dental Checkup & Cleaning',
    appliesIf: (p) => p.age >= 18,
    intervalMonths: 6,
    eventType: 'preventivecare.reminder_due',
  },
  {
    id: 'hepatitis_b_vaccine',
    label: 'Hepatitis B Vaccination',
    appliesIf: (p) => p.age >= 18 && p.age <= 59,
    intervalMonths: 0, // one-time series — scheduler checks completion status
    eventType: 'preventivecare.reminder_due',
  },
];

export default preventiveCareSchedule;
