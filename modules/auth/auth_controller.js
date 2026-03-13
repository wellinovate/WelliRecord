import { loginAccount, registerAccount } from "./auth_services.js";

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

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};