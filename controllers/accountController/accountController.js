import {
  registerUserAccount,
  registerOrganizationAccount,
  loginAccount,
} from "../../services/accountService";

export const registerUser = async (req, res) => {
  try {
    const result = await registerUserAccount(req.body);
    res.status(201).json({
      success: true,
      message: "User account created successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const registerOrganization = async (req, res) => {
  try {
    const result = await registerOrganizationAccount(req.body);
    res.status(201).json({
      success: true,
      message: "Organization account created successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const login = async (req, res) => {
  try {
    const account = await loginAccount(req.body);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: account.toSafeObject(),
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};