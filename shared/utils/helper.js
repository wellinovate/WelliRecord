import jwt from "jsonwebtoken";

export const signAccessToken = (account) => {
  return jwt.sign(
    {
      sub: account._id,
      accountType: account.accountType,
      role: account.role ?? null,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "1d" }
  );
};