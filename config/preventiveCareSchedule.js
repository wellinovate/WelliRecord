const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const diff = Date.now() - new Date(dateOfBirth).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

// Static ruleset — add rows here to extend coverage, no other code
// changes needed. appliesIf receives the lean UserProfile document.
export const PREVENTIVE_CARE_SCHEDULE = [
  {
    id: "flu_vaccine",
    label: "annual flu vaccination",
    appliesIf: (profile) => {
      const age = calculateAge(profile.dateOfBirth);
      return age !== null && age >= 18;
    },
    intervalMonths: 12,
  },
  {
    id: "cholesterol_screening",
    label: "cholesterol screening",
    appliesIf: (profile) => {
      const age = calculateAge(profile.dateOfBirth);
      return age !== null && age >= 40;
    },
    intervalMonths: 12,
  },
  {
    id: "dental_checkup",
    label: "dental check-up",
    appliesIf: () => true,
    intervalMonths: 6,
  },
  {
    id: "eye_exam",
    label: "eye examination",
    appliesIf: (profile) => {
      const age = calculateAge(profile.dateOfBirth);
      return age !== null && age >= 40;
    },
    intervalMonths: 24,
  },
];

export { calculateAge };
