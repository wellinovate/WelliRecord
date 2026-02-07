import dotenv from "dotenv";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import WelliIDRegistryABIs from "./WelliIDRegistry.json" with { type: "json" };

// Load .env variables
dotenv.config();

export const {
  PROVIDER_URL,
  ISSUER_PRIVATE_KEY,
  WELLIID_REGISTRY_ADDRESS,
  VC_STORAGE_SECRET_KEY,
  IPFS_ENABLED = "false",
  IPFS_API_URL,
} = process.env;
  console.log("🚀 ~ WELLIID_REGISTRY_ADDRESS:", WELLIID_REGISTRY_ADDRESS)

// Validate required env vars
if (!PROVIDER_URL || !ISSUER_PRIVATE_KEY || !WELLIID_REGISTRY_ADDRESS || !VC_STORAGE_SECRET_KEY) {
  console.error("❌ Missing required environment variables.");
  process.exit(1);
}

// Initialize provider, wallet, and contract
export const provider = new JsonRpcProvider(PROVIDER_URL);
export const issuerWallet = new Wallet(ISSUER_PRIVATE_KEY, provider);
export const welliRegistry = new Contract(WELLIID_REGISTRY_ADDRESS, WelliIDRegistryABIs.abi, issuerWallet);

// Optional IPFS setup (ESM-compatible)
export let ipfsClient = null;
if (IPFS_ENABLED === "true") {
  const { create } = await import("ipfs-http-client");
  ipfsClient = create({ url: IPFS_API_URL });
}
