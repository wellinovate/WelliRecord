import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { keccak256, toUtf8Bytes } from "ethers";

import {
  acr,  // AccessControlRegistry contract instance
  patientWallet,  // Assume added to utils/ethersConfig.js; this should be the patient's signer wallet
} from "../utils/ethersConfig.js";

// Note: For production, the patientWallet should be securely managed per user (e.g., via session/auth).
// Here, we assume a demo patientWallet; in real API, use user-provided signer or meta-tx.

// POST /grantAccess
export const grantAccess = async (req, res) => {
  try {
    const { requester, cid, scope, expiry } = req.body;
    console.log("🚀 ~ grantAccess ~ req:", { requester, cid, scope, expiry });

    if (!requester || !cid || !scope || !expiry) {
      return res.status(400).json({ error: "requester, cid, scope, and expiry are required" });
    }

    const expiryBigInt = BigInt(expiry);  // Convert to uint64 (BigInt)

    // Grant access on-chain (msg.sender will be patientWallet.address, which must own the cid)
    const tx = await acr.connect(patientWallet).grantAccess(requester, cid, scope, expiryBigInt);

    console.log("🚀 ~ grantAccess ~ tx:", tx);
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("grantAccess error", err);
    res.status(500).json({ error: "internal_server_error", details: err.message });
  }
};

// POST /grantBatchAccess
export const grantBatchAccess = async (req, res) => {
  try {
    const { requester, cids, scope, expiry } = req.body;
    console.log("🚀 ~ grantBatchAccess ~ req:", { requester, cids, scope, expiry });

    if (!requester || !cids || !cids.length || !scope || !expiry) {
      return res.status(400).json({ error: "requester, cids array, scope, and expiry are required" });
    }

    const expiryBigInt = BigInt(expiry);

    // Grant batch access on-chain
    const tx = await acr.connect(patientWallet).grantBatchAccess(requester, cids, scope, expiryBigInt);

    console.log("🚀 ~ grantBatchAccess ~ tx:", tx);
    const receipt = await tx.wait();

    res.json({
      success: true,
      cids,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("grantBatchAccess error", err);
    res.status(500).json({ error: "internal_server_error", details: err.message });
  }
};

// POST /revokeAccess
export const revokeAccess = async (req, res) => {
  try {
    const { requester, cid } = req.body;
    console.log("🚀 ~ revokeAccess ~ req:", { requester, cid });

    if (!requester || !cid) {
      return res.status(400).json({ error: "requester and cid are required" });
    }

    // Revoke access on-chain
    const tx = await acr.connect(patientWallet).revokeAccess(requester, cid);

    console.log("🚀 ~ revokeAccess ~ tx:", tx);
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("revokeAccess error", err);
    res.status(500).json({ error: "internal_server_error", details: err.message });
  }
};

// POST /revokeBatchAccess
export const revokeBatchAccess = async (req, res) => {
  try {
    const { requester, cids } = req.body;
    console.log("🚀 ~ revokeBatchAccess ~ req:", { requester, cids });

    if (!requester || !cids || !cids.length) {
      return res.status(400).json({ error: "requester and cids array are required" });
    }

    // Revoke batch access on-chain
    const tx = await acr.connect(patientWallet).revokeBatchAccess(requester, cids);

    console.log("🚀 ~ revokeBatchAccess ~ tx:", tx);
    const receipt = await tx.wait();

    res.json({
      success: true,
      cids,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("revokeBatchAccess error", err);
    res.status(500).json({ error: "internal_server_error", details: err.message });
  }
};

// GET /hasAccess/:patient/:requester/:cid
export const hasAccess = async (req, res) => {
  try {
    const { patient, requester, cid } = req.params;
    console.log("🚀 ~ hasAccess ~ params:", { patient, requester, cid });

    if (!patient || !requester || !cid) {
      return res.status(400).json({ error: "patient, requester, and cid params required" });
    }

    const access = await acr.hasAccess(patient, requester, cid);

    res.json({
      success: true,
      hasAccess: access,
    });
  } catch (err) {
    console.error("hasAccess error", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /getPermission/:patient/:requester/:cid
export const getPermission = async (req, res) => {
  try {
    const { patient, requester, cid } = req.params;
    console.log("🚀 ~ getPermission ~ params:", { patient, requester, cid });

    if (!patient || !requester || !cid) {
      return res.status(400).json({ error: "patient, requester, and cid params required" });
    }

    const [pPatient, pRequester, pCid, pScope, pExpiry, pActive] = await acr.getPermission(patient, requester, cid);

    res.json({
      success: true,
      patient: pPatient,
      requester: pRequester,
      cid: pCid,
      scope: pScope,
      expiry: pExpiry.toString(),  // Convert BigInt back to string
      active: pActive,
    });
  } catch (err) {
    console.error("getPermission error", err);
    res.status(500).json({ error: err.message });
  }
};