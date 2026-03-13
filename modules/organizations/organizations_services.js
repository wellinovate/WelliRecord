import { OrganizationProfile } from "./organizations_model.js";

export const createOrganizationProfile = async (payload, session) => {
  const [profile] = await OrganizationProfile.create(
    [
      {
        accountId: payload.accountId,
        organizationName: payload.organizationName,
        organizationType: payload.organizationType,
        officeAddress: payload.officeAddress || null,
        registrationNumber: payload.registrationNumber || null,
        licenseNumber: payload.licenseNumber || null,
        contactPersonName: payload.contactPersonName || null,
        contactPersonRole: payload.contactPersonRole || null,
      },
    ],
    { session }
  );

  return profile;
};