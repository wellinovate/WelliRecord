import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import { ApiKey } from "./apikey_model.js";

function generateKey() {
  const secret = crypto.randomBytes(24).toString("hex");
  const raw = `welli_pk_${secret}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 18);
  return { raw, hash, prefix };
}

export const createApiKeyService = async ({
  organizationId,
  payload,
  createdBy,
}) => {
  const { raw, hash, prefix } = generateKey();

  const entry = await ApiKey.create({
    organizationId,
    label: payload.label,
    keyHash: hash,
    keyPrefix: prefix,
    scopes: payload.scopes || [],
    createdBy,
  });

  return {
    id: entry._id,
    label: entry.label,
    key: raw,
    keyPrefix: entry.keyPrefix,
    scopes: entry.scopes,
    createdAt: entry.createdAt,
  };
};

export const listApiKeysService = async ({ organizationId }) => {
  const keys = await ApiKey.find({ organizationId, revoked: false }).sort({
    createdAt: -1,
  });

  return keys.map((k) => ({
    id: k._id,
    label: k.label,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
  }));
};

export const revokeApiKeyService = async ({ organizationId, keyId }) => {
  const key = await ApiKey.findById(keyId);
  if (!key || String(key.organizationId) !== String(organizationId)) {
    throw new AppError("API key not found", 404, "API_KEY_NOT_FOUND");
  }

  key.revoked = true;
  key.revokedAt = new Date();
  await key.save();

  return { id: key._id, revoked: true };
};
