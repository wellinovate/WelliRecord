import { joinWaitlistService } from "./waitlist_services.js";

export const joinWaitlistController = async (req, res, next) => {
  try {
    const result = await joinWaitlistService({
      payload: req.validated,
      authUser: req.user,
    });

    return res.status(201).json({
      success: true,
      message: result.alreadyOnList
        ? "You're already on the waitlist"
        : "Added to the waitlist",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
