import { generateUsername } from "../../shared/utils/generateUsername.js";
import { UserProfile } from "./user_profile_model.js";

export const createUserProfile = async (payload, session) => {
  const username =
    payload.username || generateUsername(payload.email);
  const [profile] = await UserProfile.create(
    [
      {
        accountId: payload.accountId,
        fullName: payload.fullName,
        username: username || null,
        firstName: payload.firstName || "",
        middleName: payload.middleName || "",
        lastName: payload.lastName || "",
        gender: payload.gender || null,
        homeAddress: payload.homeAddress || null,
      },
    ],
    { session }
  );

  return profile;
};