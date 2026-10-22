import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

// Remember when a signed-in patient last used the website, at most every six hours, for the active-patient count.
const ACTIVE_WRITE_EVERY_MS = 6 * 60 * 60 * 1000;
const lastActiveWrite = new Map();
function touchActive(decoded) {
  if (decoded?.accountType !== "user" || !decoded?.sub) return;
  const now = Date.now();
  const key = String(decoded.sub);
  const last = lastActiveWrite.get(key);
  if (last !== undefined && now - last < ACTIVE_WRITE_EVERY_MS) return;
  lastActiveWrite.set(key, now);
  if (lastActiveWrite.size > 50000) lastActiveWrite.clear();
  import("../users/user_profile_model.js")
    .then(({ UserProfile }) => UserProfile.updateOne({ accountId: key }, { $set: { lastActiveAt: new Date(now) } }))
    .catch(() => {});
}
export const protect = (req, res, next) => {
  try {
    // const token = req.cookies?.accessToken;
    const authHeader = req.headers.authorization;
    // console.log("🚀 ~ protect ~ authHeader:", authHeader)

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const decoded = jwt.verify(token, "6eyhfye6353e333533wseew3tette6r7furyr7yyy7e6ddyy763et3e7ryurr7e8uuf77ye");
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, {
      issuer: "wellirecord-api",
      audience: "wellirecord-client",
    });
    req.user = decoded;
    touchActive(decoded);

    next();
  } catch (error) {
    console.log("🚀 ~ protect ~ error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * Must run after `protect`. Restricts access to accounts whose role is
 * admin or super_admin, per the JWT's `role` claim.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }

  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied: insufficient permissions",
    });
  }

  next();
};

export { restrictClinicalScope } from "./clinical_scope_middleware.js";

