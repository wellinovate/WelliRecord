import { Waitlist } from "./waitlist_model.js";

export const joinWaitlistService = async ({ payload, authUser }) => {
  const { feature, email } = payload;

  try {
    const entry = await Waitlist.create({
      feature,
      email,
      accountId: authUser?.sub || null,
      organizationId: authUser?.organizationId || null,
    });
    return { alreadyOnList: false, joinedAt: entry.createdAt };
  } catch (err) {
    // Duplicate feature+email — already signed up. Not an error from
    // the caller's point of view, just confirm they're on the list.
    if (err?.code === 11000) {
      const existing = await Waitlist.findOne({ feature, email });
      return { alreadyOnList: true, joinedAt: existing?.createdAt || null };
    }
    throw err;
  }
};
