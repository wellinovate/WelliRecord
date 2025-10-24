import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import CryptoJS from "crypto-js";
import { keccak256, toUtf8Bytes } from "ethers";

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

// POST /onboard
export const onboardUser = async (req, res) => {
  try {
    const { dids, nin, fullName, dob, pinToIPFS = false } = req.body;
    console.log("🚀 ~ onboardUser ~ did:", dids);
    if (!dids || !nin)
      return res.status(400).json({ error: "did and nin are required" });
    const did = `did:ethr:${dids}` ; // For simplicity, we use the first DID

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
