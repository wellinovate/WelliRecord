import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import CryptoJS from "crypto-js";
import { VC_STORAGE_SECRET_KEY, issuerWallet } from "./ethersConfig.js";

// Create a Verifiable Credential 
export function createVC({ did, fullName = null, dob = null, nin = null, issuerDid }) {
  const issuanceDate = new Date().toISOString();
  const id = `urn:uuid:${ethers.hexlify(ethers.randomBytes(16)).slice(2)}`;
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id,
    type: ["VerifiableCredential", "IdentityCredential"],
    issuer: issuerDid,
    issuanceDate,
    credentialSubject: {
      id: did,
      ...(fullName ? { fullName } : {}),
      ...(dob ? { dob } : {}),
      ...(nin ? { nin } : {}),
    },
  };
}

// Hash VC
export function hashVC(vcObj) {
  const canonical = JSON.stringify(sortObject(vcObj));
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

// Sort JSON deterministically
export function sortObject(obj) {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((res, key) => {
        res[key] = sortObject(obj[key]);
        return res;
      }, {});
  }
  return obj;
}

// Sign VC Hash
export async function signVCHash(vcHashBytes32) {
  return await issuerWallet.signMessage(ethers.getBytes(vcHashBytes32));
}

// Encrypt and save VC locally
export function encryptAndSaveVC(vcObj, did) {
  const json = JSON.stringify(vcObj);
  const ciphertext = CryptoJS.AES.encrypt(json, VC_STORAGE_SECRET_KEY).toString();
  // console.log("🚀 ~ encryptAndSaveVC ~ ciphertext:", ciphertext)

  // __dirname is not available in ESM — we recreate it like this:
  // const __dirname = path.dirname(new URL(import.meta.url).pathname);

  // const folder = path.join(__dirname, "../vc_store");
  // if (!fs.existsSync(folder)) fs.mkdirSync(folder);
  // const filename = path.join(folder, `${encodeURIComponent(did)}.enc`);
  // fs.writeFileSync(filename, ciphertext, { mode: 0o600 });
  // return filename;
}

// Simulate NIN verification
export async function verifyNINWithGovernment(nin, fullName, dob) {
  await new Promise((r) => setTimeout(r, 300));
  if (nin && nin.length >= 5) {
    return {
      success: true,
      data: { fullName: fullName || "John Doe", dob: dob || "1990-01-01", nin },
    };
  }
  return { success: false, error: "NIN not found" };
}


// // Create a Verifiable Credential
// export function createVC({ did, fullName = null, dob = null, nin = null, issuerDid }) {
//   const issuanceDate = new Date().toISOString();
//   const id = `urn:uuid:${ethers.utils.hexlify(ethers.utils.randomBytes(16)).slice(2)}`;
//   return {
//     "@context": ["https://www.w3.org/2018/credentials/v1"],
//     id,
//     type: ["VerifiableCredential", "IdentityCredential"],
//     issuer: issuerDid,
//     issuanceDate,
//     credentialSubject: {
//       id: did,
//       ...(fullName ? { fullName } : {}),
//       ...(dob ? { dob } : {}),
//       ...(nin ? { nin } : {}),
//     },
//   };
// }

// // Hash VC
// export function hashVC(vcObj) {
//   const canonical = JSON.stringify(sortObject(vcObj));
//   return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(canonical));
// }

// // Sort JSON deterministically
// export function sortObject(obj) {
//   if (Array.isArray(obj)) return obj.map(sortObject);
//   if (obj && typeof obj === "object") {
//     return Object.keys(obj)
//       .sort()
//       .reduce((res, key) => {
//         res[key] = sortObject(obj[key]);
//         return res;
//       }, {});
//   }
//   return obj;
// }

// // Sign VC Hash
// export async function signVCHash(vcHashBytes32) {
//   return await issuerWallet.signMessage(ethers.utils.arrayify(vcHashBytes32));
// }

// // Encrypt and save VC locally
// export function encryptAndSaveVC(vcObj, did) {
//   const json = JSON.stringify(vcObj);
//   const ciphertext = CryptoJS.AES.encrypt(json, VC_STORAGE_SECRET_KEY).toString();
//   const folder = path.join(__dirname, "../vc_store");
//   if (!fs.existsSync(folder)) fs.mkdirSync(folder);
//   const filename = path.join(folder, `${encodeURIComponent(did)}.enc`);
//   fs.writeFileSync(filename, ciphertext, { mode: 0o600 });
//   return filename;
// }

// // Simulate NIN verification
// export async function verifyNINWithGovernment(nin, fullName, dob) {
//   await new Promise((r) => setTimeout(r, 300));
//   if (nin && nin.length >= 5) {
//     return {
//       success: true,
//       data: { fullName: fullName || "John Doe", dob: dob || "1990-01-01", nin },
//     };
//   }
//   return { success: false, error: "NIN not found" };
// }

