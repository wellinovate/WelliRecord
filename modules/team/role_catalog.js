// modules/team/role_catalog.js
//
// Which membershipRole values a facility is allowed to invite depends
// on its organizationType (and, for healthcare providers, its
// clinicalScope — see clinical_scope_middleware.js). This is the
// single source of truth for that mapping. Both the invite validation
// in team_services.js and the frontend's role dropdown (via
// GET /team/role-catalog) read from the same list, so they can't
// drift apart the way ROLE_META/INVITE_ROLES used to (one static list
// for every provider type).
//
// organizationType values as actually stored on OrganizationProfile
// (confirmed against searchNearbyOrganizationsService): "healthcare_provider",
// "diagnostic", "pharmacy", "individaul_provider" [sic — kept as stored].
// Anything not listed below (telehealth, insurance, ngo, government,
// or a value we haven't confirmed yet) falls back to DEFAULT_CATALOG —
// better to over-offer roles for an unmapped type than to lock an
// admin out of inviting anyone.

const CATALOGS = {
  hospital_general: {
    roles: [
      "provider_admin",
      "doctor",
      "nurse",
      "lab_tech",
      "pharmacist",
      "frontdesk",
      "support_staff",
    ],
    labelOverrides: {},
  },
  hospital_eye_care: {
    roles: [
      "provider_admin",
      "doctor",
      "nurse",
      "pharmacist",
      "frontdesk",
      "support_staff",
    ],
    labelOverrides: {
      doctor: "Optician / Ophthalmologist",
    },
  },
  lab: {
    roles: ["provider_admin", "lab_tech", "frontdesk", "support_staff"],
    labelOverrides: {
      lab_tech: "Lab Technician / Lab Scientist",
    },
  },
  pharmacy: {
    roles: ["provider_admin", "pharmacist", "frontdesk", "support_staff"],
    labelOverrides: {},
  },
  insurance: {
    roles: ["provider_admin", "insurer_agent", "support_staff"],
    labelOverrides: {},
  },
};

const DEFAULT_CATALOG = CATALOGS.hospital_general;

function resolveCatalogKey({ organizationType, clinicalScope }) {
  if (organizationType === "healthcare_provider") {
    return clinicalScope === "eye_care" ? "hospital_eye_care" : "hospital_general";
  }
  if (organizationType === "diagnostic") return "lab";
  if (organizationType === "pharmacy") return "pharmacy";
  if (organizationType === "insurance") return "insurance";
  return null;
}

export function getRoleCatalog({ organizationType, clinicalScope }) {
  const key = resolveCatalogKey({ organizationType, clinicalScope });
  const catalog = (key && CATALOGS[key]) || DEFAULT_CATALOG;

  return {
    organizationType: organizationType || null,
    clinicalScope: clinicalScope || "general",
    roles: catalog.roles,
    labelOverrides: catalog.labelOverrides,
  };
}

export function isRoleAllowed({ organizationType, clinicalScope, membershipRole }) {
  return getRoleCatalog({ organizationType, clinicalScope }).roles.includes(
    membershipRole,
  );
}
