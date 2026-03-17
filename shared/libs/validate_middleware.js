export const validateBody = (validateFn) => (req, res, next) => {
  try {
    const errors = validateFn(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateParams = (validateFn) => (req, res, next) => {
  try {
    const errors = validateFn(req.params);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
