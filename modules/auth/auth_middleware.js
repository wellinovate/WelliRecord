import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
export const protect = (req, res, next) => {
  try {
    // const token = req.cookies?.accessToken;
    const authHeader = req.headers.authorization;
    console.log("🚀 ~ protect ~ authHeader:", authHeader)

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
    const decoded = jwt.verify(token, "6eyhfye6353e333533wseew3tette6r7furyr7yyy7e6ddyy763et3e7ryurr7e8uuf77ye");
    req.user = decoded;

    next();
  } catch (error) {
  console.log("🚀 ~ protect ~ error:", error)

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
