import { OAuth2Client } from "google-auth-library";
import {
  signAccessToken,
  signAccessTokenGoogle,
} from "../../shared/utils/helper.js";
import { loginAccount, registerAccount } from "./auth_services.js";
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
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginAccount(req.validatedBody);
    console.log("🚀 ~ login ~ result:", result)

    const results = {
      account: result.account,
      profile: result.profile,
    };

    const token = signAccessToken(results);

    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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
    const { credential, profileType } = req.body;
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

    let user = await UserProfile.findOne({
      $or: [{ googleId: sub }, { email }],
    });

    if (!user) {
      account = await Account.create({
        accountType: "user",
        role: payload.role || "patient",
        email: email,
        password: sub, // Use Google sub as a placeholder password (not used for authentication)
        img: picture || "",
        status: "active",
        isVerified: false,
        isActive: true,
      });
      user = await UserProfile.create({
        accountId: account._id,
        email,
        googleId: sub,
        firstName: given_name || name?.split(" ")[0] || "",
        lastName: family_name || "",
        fullName: name || "",
        avatar: picture || "",
        authProvider: "google",
        profileType: profileType || "Personal",
        accountType: "user",
        isEmailVerified: true,
      });
    } else {
      if (!user.googleId) {
        user.googleId = sub;
      }
      if (!user.authProvider) {
        user.authProvider = "google";
      }
      user.isEmailVerified = true;
      await user.save();
    }

    const token = signAccessTokenGoogle(user);

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        accountType: "user",
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
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
