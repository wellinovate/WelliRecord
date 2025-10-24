// --- test/wellirecord.test.js
// const { expect } = require('chai');
// const { ethers } = require('hardhat');

// describe('WelliRecord', function () {
//   let WelliRecord, welli, deployer, issuer, bridge, patient, grantee;

//   beforeEach(async function () {
//     [deployer, issuer, bridge, patient, grantee, other] = await ethers.getSigners();

//     const WelliFactory = await ethers.getContractFactory('WelliRecord');
//     welli = await WelliFactory.deploy(deployer.address);
//     await welli.deployed();

//     // grant roles
//     const ISSUER_ROLE = await welli.ISSUER_ROLE();
//     const BRIDGE_ROLE = await welli.BRIDGE_ROLE();

//     await welli.connect(deployer).grantRole(ISSUER_ROLE, issuer.address);
//     await welli.connect(deployer).grantRole(BRIDGE_ROLE, bridge.address);
//   });

//   it('issuer can issue, patient can grant and bridge can log access', async function () {
//     const recordId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('rec-1'));
//     const dataHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('encryptedPayload'));
//     const pointerHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('cid://Qm...'));

//     // issuer issues
//     await expect(welli.connect(issuer).issueRecord(recordId, patient.address, dataHash, pointerHash))
//       .to.emit(welli, 'RecordIssued')
//       .withArgs(recordId, patient.address, issuer.address, dataHash, anyValue => true);

//     // patient grants read permission to grantee
//     const readAction = 1;
//     const expiresAt = Math.floor(Date.now() / 1000) + 3600; // +1 hour
//     await expect(welli.connect(patient).grantPermission(recordId, grantee.address, expiresAt, readAction, ethers.constants.HashZero))
//       .to.emit(welli, 'PermissionGranted');

//     // check hasPermission
//     expect(await welli.hasPermission(recordId, grantee.address, readAction)).to.equal(true);

//     // bridge logs access
//     const sessionId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('session-1'));
//     await expect(welli.connect(bridge).logAccess(recordId, grantee.address, ethers.utils.keccak256(ethers.utils.toUtf8Bytes('read')), sessionId))
//       .to.emit(welli, 'RecordAccessed');

//     // patient revokes permission
//     await expect(welli.connect(patient).revokePermission(recordId, grantee.address)).to.emit(welli, 'PermissionRevoked');
//     expect(await welli.hasPermission(recordId, grantee.address, readAction)).to.equal(false);

//     // revoke record
//     await expect(welli.connect(patient).revokeRecord(recordId)).to.emit(welli, 'RecordRevoked');
//   });
// });

// --- README.md
// # WelliRecord (starter)

// This repo contains a minimal Solidity contract (`WelliRecord`) that implements on-chain metadata, permissioning, and an audit log for patient records. The heavy payloads remain off-chain.

// ## What's included
// - `WelliRecord.sol` - the contract
// - `test/wellirecord.test.js` - Hardhat tests (Mocha + Chai + ethers)
// - `hardhat/deploy/00_deploy_wellirecord.js` - sample deploy script

// ## Quick start (Hardhat)
// 1. `npm init -y`
// 2. `npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers chai mocha @openzeppelin/contracts`
// 3. `npx hardhat` -> create an empty sample project
// 4. Place the files from this document into your project (contracts/, test/, hardhat/)
// 5. `npx hardhat test`

// ## Notes
// - Replace `anyValue` usage in tests with appropriate matchers if your test runner requires strict args.
// - This is a starter — add full access checks, input validation, upgradeability, EIP-712 off-chain grants, and audits before production.

