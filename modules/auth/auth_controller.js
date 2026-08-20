import { OAuth2Client } from "google-auth-library";
import {
  generateWelliRecordId,
  signAccessToken,
  signAccessTokenGoogle,
} from "../../shared/utils/helper.js";
import {
  loginAccount,
  registerAccount,
  requestPasswordResetService,
  resendLoginOtpService,
  resendVerificationEmailService,
  resetPasswordService,
  startGoogleLoginOtp,
  verifyEmailService,
  verifyLoginCodeService,
} from "./auth_services.js";
import { UserProfile } from "../users/user_profile_model.js";
import { createAccount } from "../accounts/account_service.js";
import { Account } from "../accounts/account_model.js";
import { AppError } from "../../shared/errors/AppError.js";

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

    const token = await signAccessToken(results);

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
    // "role" used to be read from req.body here and passed straight
    // into Account.create below — same hole as the local /register
    // endpoint (see auth_validator.js/registerUserAccount for the
    // matching fix): Google-authenticated signup only ever creates a
    // patient account, so client input is never trusted for this.
    const { credential, profileType, phone } = req.body;
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
    // Tracks whether this request just created the Account (true first-time
    // Google sign-in) vs an existing account logging back in. The frontend
    // uses this to decide whether to send the user through onboarding
    // (phone number, profile completion) instead of straight to the
    // dashboard. Recovering a missing UserProfile for an existing Account
    // does not count as new — that account already completed signup once.
    let isNewAccount = false;

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
        isNewAccount = true;

        account = await Account.create({
          accountType: "user",
          role: "patient",
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

    // Whether Google sign-in requires an SMS OTP step depends on whether
    // this account has a phone number, not on whether it's new. Accounts
    // created via the signup page already collected a phone before this
    // request and go through OTP immediately, same as an existing account
    // logging back in. Accounts created via the login page have no phone
    // yet (never collected there), so they skip OTP this one time and are
    // routed to onboarding by the frontend to add one — every login after
    // that has a phone on file and goes through OTP normally.
    if (account.phone || account.email) {
      const otpResult = await startGoogleLoginOtp(account, req.body.channel);

      return res.status(200).json({
        success: true,
        message: otpResult.message,
        requiresOtp: true,
        channel: otpResult.channel,
        challengeToken: otpResult.challengeToken,
        maskedPhone: otpResult.maskedPhone,
        maskedEmail: otpResult.maskedEmail,
        isNewAccount,
      });
    }

    // Sign standard access token with complete payload + issuer/audience
    const token = await signAccessToken({ account, profile: user });

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
        isNewAccount,
        hasPhone: Boolean(account.phone),
      },
    });
  } catch (error) {
    console.log("🚀 ~ googleLoginController ~ error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Google login failed",
    });
  }
};

export const verifyEmailController = async (req, res, next) => {
  try {
    const token = req.query.token || req.body?.token;

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
    const { email, challengeToken, channel } = req.body;

    const result = await resendLoginOtpService({ email, challengeToken, channel });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        channel: result.channel,
        challengeToken: result.challengeToken,
        maskedPhone: result.maskedPhone,
        maskedEmail: result.maskedEmail,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await requestPasswordResetService(email);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordController = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const result = await resetPasswordService({ token, newPassword });

    return res.status(200).json({
      success: true,
      message: result.message,
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
