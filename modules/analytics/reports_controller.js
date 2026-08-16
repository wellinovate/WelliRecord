import { getReportsOverviewService } from "./reports_service.js";

export const getReportsOverviewController = async (req, res, next) => {
  try {
    const accountId = req.user?.sub;
    const profileId = req.user?.profileId;

    if (!accountId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { range, from, to } = req.query;

    const data = await getReportsOverviewService({ accountId, profileId, range, from, to });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
