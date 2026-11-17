import { listCatalogGroupedService, searchCatalogService, getCatalogTestService } from "./lab_test_catalog_service.js";

export const listCatalogController = async (req, res, next) => {
  try {
    const data = await listCatalogGroupedService();
    return res.status(200).json({
      success: true,
      message: "Lab test catalog retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const searchCatalogController = async (req, res, next) => {
  try {
    const { q } = req.query;
    const data = await searchCatalogService({ query: q });
    return res.status(200).json({
      success: true,
      message: "Lab test catalog search results",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getCatalogTestController = async (req, res, next) => {
  try {
    const data = await getCatalogTestService(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Test not found" });
    return res.status(200).json({ success: true, message: "Lab test retrieved successfully", data });
  } catch (error) {
    if (error?.name === "CastError") return res.status(404).json({ success: false, message: "Test not found" });
    next(error);
  }
};
