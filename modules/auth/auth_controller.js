import { OAuth2Client } from "google-auth-library";
import {
  generateWelliRecordId,
  signAccessToken,
  signAccessTokenGoogle,
} from "../../shared/utils/helper.js";
import {
  loginAccount,
  registerAccount,
  resendLoginOtpService,
  resendVerificationEmailService,
  verifyEmailService,
  verifyLoginCodeService,
} from "./auth_services.js";
import { UserProfile } from "../users/user_profile_model.js";
import { createAccount } from "../accounts/account_service.js";
import { Account } from "../accounts/account_model.js";

export const register = async (req, res, next) => {
  try {
    const result = await registerAccount(req.validatedBody);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: result,
    });
  } catch (error) {
    // console.log("🚀 ~ register ~ error:", error);
    console.log("🚀 ~ register ~ error:", error);
    next(error);
  }
};

export const loginController = async (req, res, next) => {
  try {
    const result = await loginAccount(req.validatedBody);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
    console.log("🚀 ~ loginController ~ error:", error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await verifyLoginCodeService(req.body);
    console.log("🚀 ~ login ~ result:", result);

    const results = {
      account: result.account,
      profile: result.profile,
    };

    const token = signAccessToken(results);

    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken: token,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res) => {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLoginController = async (req, res) => {
  try {
    const { credential, profileType, phone, role } = req.body;
    let account;
    if (!credential) {
      console.log("🚀 ~ googleLoginController ~ credential:", credential);
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    const {
      sub,
      email,
      email_verified,
      given_name,
      family_name,
      name,
      picture,
    } = payload;

    console.log("🚀 ~ googleLoginController ~ payload:", payload);

    if (!email || !email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email is not verified",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look for existing Account by normalized email first (prevents duplicate accounts)
    account = await Account.findOne({ email: normalizedEmail });

    let user;

    if (account) {
      // Find associated UserProfile
      user = await UserProfile.findOne({ accountId: account._id });

      if (!user) {
        // If Account exists but UserProfile is missing, create UserProfile for this Account
        user = await UserProfile.create({
          accountId: account._id,
          email: normalizedEmail,
          googleId: sub,
          firstName: given_name || name?.split(" ")[0] || "",
          lastName: family_name || "",
          fullName: name || "",
          phone: phone || account.phone || null,
          avatar: picture || "",
          authProvider: "google",
          profileType: profileType || "Personal",
          accountType: account.accountType || "user",
          isEmailVerified: true,
        });
      } else {
        // Link Google ID and update verified status
        if (!user.googleId) {
          user.googleId = sub;
        }
        if (!user.authProvider) {
          user.authProvider = "google";
        }
        user.isEmailVerified = true;
        if (!user.email) {
          user.email = normalizedEmail;
        }
        await user.save();
      }
    } else {
      // Find UserProfile by googleId or normalized email if Account lookup by email didn't catch it
      user = await UserProfile.findOne({
        $or: [{ googleId: sub }, { email: normalizedEmail }],
      });

      if (user) {
        account = await Account.findById(user.accountId);
      }

      if (!account || !user) {
        account = await Account.create({
          accountType: "user",
          role: role || payload.role || "patient",
          email: normalizedEmail,
          password: sub, // Use Google sub as placeholder password
          phone: phone || null,
          img: picture || "",
          status: "active",
          isVerified: false,
          isActive: true,
        });

        user = await UserProfile.create({
          accountId: account._id,
          email: normalizedEmail,
          googleId: sub,
          firstName: given_name || name?.split(" ")[0] || "",
          lastName: family_name || "",
          fullName: name || "",
          phone: phone || null,
          avatar: picture || "",
          authProvider: "google",
          profileType: profileType || "Personal",
          accountType: "user",
          isEmailVerified: true,
        });
      }
    }

    // Ensure wrId is populated on profile
    if (!user.wrId) {
      user.wrId = generateWelliRecordId();
      await user.save();
    }

    // Sign standard access token with complete payload + issuer/audience
    const token = signAccessToken({ account, profile: user });

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        accountType: account.accountType || "user",
        role: account.role || "patient",
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        wrId: user.wrId,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.log("🚀 ~ googleLoginController ~ error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Google login failed",
    });
  }
};

export const verifyEmailController = async (req, res, next) => {
  try {
    const { token } = req.query;

    const result = await verifyEmailService(token);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export const resendLoginOtpController = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await resendLoginOtpService({ email });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        challengeToken: result.challengeToken,
        maskedPhone: result.maskedPhone,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resendVerificationEmailController = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await resendVerificationEmailService(email);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
