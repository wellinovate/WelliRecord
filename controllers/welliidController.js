import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import CryptoJS from "crypto-js";
import { Blob } from "buffer"; // Polyfill for Node.js
import { keccak256, toUtf8Bytes } from "ethers";
import { PinataSDK } from "pinata";

import {
  welliRegistry,
  issuerWallet,
  ipfsClient,
  VC_STORAGE_SECRET_KEY,
} from "../utils/ethersConfig.js";

import {
  createVC,
  hashVC,
  signVCHash,
  encryptAndSaveVC,
  verifyNINWithGovernment,
} from "../utils/helpers.js";

// Initialize once (export if needed across files)
export const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY || undefined, // Optional
});

// POST /onboard
export const onboardUsers = async (req, res) => {
  try {
    const { dids, nin, fullName, dob, pinToIPFS = false } = req.body;
    console.log("🚀 ~ onboardUser ~ did:", dids);
    if (!dids || !nin)
      return res.status(400).json({ error: "did and nin are required" });
    const did = `did:ethr:${dids}`; // For simplicity, we use the first DID

    // 1️⃣ Verify NIN
    const govResp = await verifyNINWithGovernment(nin, fullName, dob);
    // console.log("🚀 ~ onboardUser ~ govResp:", govResp)
    if (!govResp.success)
      return res.status(403).json({
        error: "identity verification failed",
        details: govResp.error,
      });

    // 2️⃣ Create VC
    const issuerDid = `did:ethr:${await issuerWallet.getAddress()}`;
    const vc = createVC({
      did,
      fullName: govResp.data.fullName,
      dob: govResp.data.dob,
      nin: govResp.data.nin,
      issuerDid,
    });

    // 3️⃣ Compute hash & signature
    const vcHash = hashVC(vc);
    const signature = await signVCHash(vcHash);

    // 4️⃣ Optional IPFS pinning
    let ipfsCid = null;
    if (pinToIPFS && ipfsClient) {
      const encryptedPath = encryptAndSaveVC(vc, did);
      const stream = fs.createReadStream(encryptedPath);
      const added = await ipfsClient.add({
        path: path.basename(encryptedPath),
        content: stream,
      });
      ipfsCid = added.cid.toString();
    } else {
      encryptAndSaveVC(vc, did);
    }

    const didHash = keccak256(toUtf8Bytes(did)); // Convert did string → bytes32
    // const vcHash = keccak256(toUtf8Bytes(JSON.stringify(vc))); // or however you computed it

    // const didOwner = await issuerWallet.getAddress(); // or the actual owner address
    // const issuer1 = await issuerWallet.getAddress()
    // console.log("🚀 ~ onboardUser ~ issuer1:", issuer1)

    // const txs = await welliRegistry.addTrustedIssuer(issuer1, "meta");
    // console.log("🚀 ~ onboardUser ~ txs:", txs)

    const tx = await welliRegistry.registerDID(didHash, vcHash, dids);

    // 5️⃣ Register on-chain
    console.log("🚀 ~ onboardUser ~ tx:", tx);
    const receipt = await tx.wait();

    res.json({
      success: true,
      vc,
      vcHash,
      signature,
      ipfsCid,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("onboard error", err);
    res
      .status(500)
      .json({ error: "internal_server_error", details: err.message });
  }
};

// GET /vc/:did
export const getVC = async (req, res) => {
  try {
    const { did } = req.params;
    const vcHash = await welliRegistry.getVCHash(did);
    res.json({ did, vcHash });
  } catch (err) {
    console.error("get vc error", err);
    res.status(500).json({ error: err.message });
  }
};

export const onboardUser = async (req, res) => {
  try {
    const { dids, nin, fullName, dob, pinToIPFS = false } = req.body;
    console.log("🚀 ~ onboardUser ~ did:", dids);

    if (!dids || !nin)
      return res.status(400).json({ error: "did and nin are required" });

    const did = `did:ethr:${dids}`;

    // 1️⃣ Verify NIN
    const govResp = await verifyNINWithGovernment(nin, fullName, dob);
    if (!govResp.success)
      return res.status(403).json({
        error: "identity verification failed",
        details: govResp.error,
      });

    // 2️⃣ Create VC
    const issuerDid = `did:ethr:${await issuerWallet.getAddress()}`;
    const vc = createVC({
      did,
      fullName: govResp.data.fullName,
      dob: govResp.data.dob,
      nin: govResp.data.nin,
      issuerDid,
    });

    // 3️⃣ Compute hash & signature
    const vcHash = hashVC(vc);
    const signature = await signVCHash(vcHash);

    let ipfsCid = null;

    // 4️⃣ Optional Pinata Pinning
    if (pinToIPFS) {
      const encryptedFilePath = encryptAndSaveVC(vc, did); // returns local temp path

      try {
        // Read the file as a Buffer (Node.js style)
        const fileBuffer = fs.readFileSync(encryptedFilePath);

        // Create Blob and File (Node.js polyfill)
        const blob = new Blob([fileBuffer]);
        const file = new File(
          [blob],
          `encrypted-vc-${did.split(":").pop().slice(-10)}.enc`,
          { type: "application/octet-stream" }
        );

        // Upload to Pinata (public by default)
        const upload = await pinata.upload.public.file(file, {
          groupId: process.env.PINATA_GROUP_ID || undefined, // Optional
        });

        ipfsCid = upload.cid;
        console.log("✅ Pinned to Pinata:", ipfsCid);

        // Optional: clean up temp file
        fs.unlinkSync(encryptedFilePath);
      } catch (pinataError) {
        console.error("Pinata pinning failed", pinataError);
        // Decide: fail hard or continue without pinning?
        // For now, we'll continue but log
      }
    } else {
      // Still encrypt and save locally (or wherever you store off-chain)
      encryptAndSaveVC(vc, did);
    }

    const didHash = keccak256(toUtf8Bytes(did));

    // 5️⃣ Register on-chain
    const tx = await welliRegistry.registerDID(didHash, vcHash, dids);
    const receipt = await tx.wait();

    res.json({
      success: true,
      vc,
      vcHash,
      signature,
      ipfsCid, // null if not pinned
      txHash: receipt.transactionHash,
      gatewayUrl: ipfsCid
        ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}`
        : null,
    });
  } catch (err) {
    console.error("onboard error", err);
    res
      .status(500)
      .json({ error: "internal_server_error", details: err.message });
  }
};
