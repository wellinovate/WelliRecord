import { ZodError } from "zod";

export const validate = (schema, source = "body") => {
    return (req, res, next) => {
        // console.log("🚀 ~ validate ~ req:", req.body);
    try {
      req.validated = schema.parse(req[source]);
      next();
    } catch (error) {
        console.log("🚀 ~ validate ~ error:", error)
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: error.issues,
        });
      }

      next(error);
    }
  };
};
