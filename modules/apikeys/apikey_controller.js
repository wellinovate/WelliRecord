import {
  createApiKeyService,
  listApiKeysService,
  revokeApiKeyService,
} from "./apikey_services.js";

export const createApiKeyController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const result = await createApiKeyService({
      organizationId,
      payload: req.validated,
      createdBy: organizationId,
    });

    return res.status(201).json({
      success: true,
      message: "API key created — copy it now, it won't be shown again",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const listApiKeysController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const result = await listApiKeysService({ organizationId });

    return res.status(200).json({
      success: true,
      message: "API keys retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeApiKeyController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const { keyId } = req.params;
    const result = await revokeApiKeyService({ organizationId, keyId });

    return res.status(200).json({
      success: true,
      message: "API key revoked",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
