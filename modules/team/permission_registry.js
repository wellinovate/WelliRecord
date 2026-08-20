// modules/team/permission_registry.js
//
// The permission model has two layers:
//   1. Role defaults — a fixed set per membershipRole, defined below.
//   2. Per-member overrides — an admin grants or revokes individual
//      keys on top of the default, stored on
//      OrganizationMembership.permissionOverrides.
//
// Effective permissions = (role default ∪ granted) − revoked.
//
// Keys reuse the same clinical-category vocabulary already used by
// restrictClinicalScope (modules/auth/clinical_scope_middleware.js) —
// "vitals", "immunizations", "procedures", "encounters", "lab-results",
// etc. — rather than inventing a second naming scheme for the same
// concepts.
//
// This is a starting set covering the modules that exist today
// (encounter, vitals, immunizations, procedure, lab, lab-orders,
// pharmacy-orders, vision, appointments/visitQueue). It's deliberately
// coarser than one-key-per-module in a couple of places — e.g. a
// single "write_clinical_records" covers vitals/encounters/
// immunizations/procedures/diagnoses rather than a key each — to ship
// something usable now. Split any of these into finer keys later if a
// role needs write access to one clinical category but not another;
// nothing about the storage shape below forces the coarser grouping.

export const PERMISSION_CATEGORIES = [
  { key: "patients", label: "Patients" },
  { key: "clinical", label: "Clinical records" },
  { key: "lab", label: "Lab" },
  { key: "radiology", label: "Radiology" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "vision", label: "Vision" },
  { key: "scheduling", label: "Scheduling" },
  { key: "reports", label: "Reports" },
  { key: "billing", label: "Billing" },
  { key: "admin", label: "Administration" },
];

export const PERMISSIONS = {
  view_patients: { label: "View patient directory & profiles", category: "patients" },
  register_patients: { label: "Register new patients", category: "patients" },

  view_clinical_records: { label: "View vitals, encounters, diagnoses, immunizations, procedures", category: "clinical" },
  write_clinical_records: { label: "Record vitals, encounters, diagnoses, immunizations, procedures", category: "clinical" },

  view_lab_orders: { label: "View lab orders", category: "lab" },
  create_lab_orders: { label: "Create lab orders", category: "lab" },
  write_lab_results: { label: "Enter lab results", category: "lab" },

  view_radiology_orders: { label: "View radiology orders", category: "radiology" },
  create_radiology_orders: { label: "Create radiology orders", category: "radiology" },
  write_radiology_reports: { label: "Upload images and publish radiology reports", category: "radiology" },

  view_prescriptions: { label: "View prescriptions", category: "pharmacy" },
  create_prescriptions: { label: "Create prescriptions", category: "pharmacy" },
  dispense_medications: { label: "Dispense medications", category: "pharmacy" },

  view_pharmacy_inventory: { label: "View pharmacy inventory", category: "pharmacy" },
  manage_pharmacy_inventory: { label: "Manage products, batches, and stock adjustments", category: "pharmacy" },
  manage_pharmacy_purchasing: { label: "Create purchase orders and receive goods", category: "pharmacy" },
  manage_hmo_claims: { label: "Track HMO claims for dispensed medications", category: "pharmacy" },

  view_vision_records: { label: "View vision records", category: "vision" },
  write_vision_records: { label: "Record vision exams", category: "vision" },

  manage_appointments: { label: "Manage appointments", category: "scheduling" },
  manage_queue: { label: "Manage the visit queue", category: "scheduling" },
  view_roster: { label: "View staff duty rosters", category: "scheduling" },
  manage_roster: { label: "Create, edit, and publish staff duty rosters", category: "scheduling" },

  view_referrals: { label: "View referrals sent and received", category: "clinical" },
  create_referrals: { label: "Send a patient referral to another organization", category: "clinical" },
  respond_to_referrals: { label: "Accept, decline, or complete referrals received", category: "clinical" },

  view_reports: { label: "View reports & analytics", category: "reports" },
  view_invoices: { label: "View invoices", category: "billing" },
  create_invoices: { label: "Checkout patients and issue invoices", category: "billing" },
  manage_payments: { label: "Record payments, void invoices", category: "billing" },

  manage_team: { label: "Invite, suspend, and manage team members", category: "admin" },
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

// provider_admin isn't listed here — it always has every permission,
// enforced in getEffectivePermissions below, and its access can't be
// narrowed by an override. Every other role's default is the starting
// point an admin can add to or take away from per person.
const ROLE_DEFAULTS = {
  doctor: [
    "view_patients", "register_patients",
    "view_clinical_records", "write_clinical_records",
    "view_lab_orders", "create_lab_orders",
    "view_radiology_orders", "create_radiology_orders",
    "view_prescriptions", "create_prescriptions",
    "view_vision_records", "write_vision_records",
    "manage_appointments", "view_roster",
    "view_referrals", "create_referrals", "respond_to_referrals",
    "view_reports", "view_invoices", "create_invoices",
  ],
  clinician: [
    "view_patients", "register_patients",
    "view_clinical_records", "write_clinical_records",
    "view_lab_orders", "create_lab_orders",
    "view_radiology_orders", "create_radiology_orders",
    "view_prescriptions", "create_prescriptions",
    "view_vision_records", "write_vision_records",
    "manage_appointments", "view_roster",
    "view_referrals", "create_referrals", "respond_to_referrals",
    "view_reports", "view_invoices", "create_invoices",
  ],
  nurse: [
    "view_patients",
    "view_clinical_records", "write_clinical_records",
    "view_lab_orders",
    "view_radiology_orders",
    "manage_queue", "view_roster",
  ],
  lab_tech: [
    "view_patients",
    "view_lab_orders", "create_lab_orders", "write_lab_results",
    "view_radiology_orders", "create_radiology_orders", "write_radiology_reports",
    "view_roster",
  ],
  pharmacist: [
    "view_patients",
    "view_prescriptions", "dispense_medications",
    "view_pharmacy_inventory", "manage_pharmacy_inventory", "manage_pharmacy_purchasing",
    "manage_hmo_claims", "view_invoices",
    "view_roster",
  ],
  frontdesk: [
    "view_patients", "register_patients",
    "manage_appointments", "manage_queue",
    "view_referrals",
    "view_invoices", "create_invoices", "manage_payments",
    "view_roster", "manage_roster",
  ],
  insurer_agent: [
    "view_patients", "view_reports",
  ],
  support_staff: [
    "view_patients",
  ],
};

export function getRoleDefaultPermissions(membershipRole) {
  if (membershipRole === "provider_admin") return [...PERMISSION_KEYS];
  return ROLE_DEFAULTS[membershipRole] || [];
}

// granted/revoked are validated (invalid keys stripped) so a stale
// override from before a permission was renamed or removed can't
// silently grant something that no longer exists.
export function getEffectivePermissions(membershipRole, overrides) {
  if (membershipRole === "provider_admin") return [...PERMISSION_KEYS];

  const granted = (overrides?.granted || []).filter((k) => PERMISSION_KEYS.includes(k));
  const revoked = new Set((overrides?.revoked || []).filter((k) => PERMISSION_KEYS.includes(k)));

  const base = new Set(getRoleDefaultPermissions(membershipRole));
  granted.forEach((k) => base.add(k));
  revoked.forEach((k) => base.delete(k));

  return [...base];
}
