import { signAccessToken } from "../../shared/utils/helper.js";
import {
  becomePractitionerService,
  getPractitionerStatusService,
  updatePractitionerService,
  switchContextService,
} from "./practitioner_service.js";
import { LICENSE_BODY_HINTS, PROFESSIONS } from "./practitioner_logic.js";

export const optionsController = (_req, res) =>
  res.json({ success: true, data: { professions: PROFESSIONS, licenseBodyHints: LICENSE_BODY_HINTS } });

export const becomeController = async (req, res, next) => {
  try {
    const data = await becomePractitionerService({ authUser: req.user, body: req.body || {} });
    res.status(201).json({ success: true, message: "Your provider profile is created. Upload your licence to be reviewed.", data });
  } catch (e) {
    next(e);
  }
};

export const meController = async (req, res, next) => {
  try {
    res.json({ success: true, data: await getPractitionerStatusService({ authUser: req.user }) });
  } catch (e) {
    next(e);
  }
};

export const updateController = async (req, res, next) => {
  try {
    res.json({ success: true, data: await updatePractitionerService({ authUser: req.user, body: req.body || {} }) });
  } catch (e) {
    next(e);
  }
};

export const switchController = async (req, res, next) => {
  try {
    const { account, profile } = await switchContextService({ authUser: req.user, to: req.body?.to });
    const token = await signAccessToken({ account, profile });
    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });
    const safe = account.toSafeObject ? account.toSafeObject() : account;
    res.json({ success: true, accessToken: token, data: { account: safe, profile } });
  } catch (e) {
    next(e);
  }
};
