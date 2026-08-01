
import { Account } from "./account_model.js";

export const findAccountByEmail = async (email, session = null) => {
  const normalizedEmail = email.trim().toLowerCase();
  const query = Account.findOne({ email: normalizedEmail });
  if (session) query.session(session);
  return query;
};

export const findAccountByPhone = async (phone, session = null) => {
  const normalizedPhone = phone.trim().replace(/[\s-]/g, "");
  const query = Account.findOne({ phone: normalizedPhone });
  if (session) query.session(session);
  return query;
};

export const getAccountByEmailForLogin = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  return Account.findByEmailWithPassword(normalizedEmail);
};

export const createAccount = async (payload, session) => {
  console.log("🚀 ~ createAccount ~ payload:", payload)
  const [account] = await Account.create(
    [
      {
        accountType: payload.accountType,
        role: payload.role,
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        phone: payload.phone || null,
        img: payload.img || null,
        status: payload.status || "active",
        isVerified: payload.isVerified ?? false,
        isActive: payload.isActive ?? true,
        verificationTokenHash: payload.verificationTokenHash ?? null,
        verificationTokenExpiresAt: payload.verificationTokenExpiresAt ?? null,
        verificationLastSentAt: payload.verificationLastSentAt ?? null,
      },
    ],
    { session },
  );

  return account;
};

// export const getAccountByEmailForLogin = async (email) => {
//   return Account.findByEmailWithPassword(email.trim().toLowerCase());
// };
