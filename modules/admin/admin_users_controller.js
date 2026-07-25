import { listPlatformUsersService } from "./admin_users_services.js";

export const listPlatformUsersController = async (req, res, next) => {
  try {
    const data = await listPlatformUsersService({
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};
