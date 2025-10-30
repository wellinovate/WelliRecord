import { expect } from "chai";
import hre from "hardhat";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("AccessControlRegistry", function () {
  async function deployFixture() {
    const [deployer, issuer, patient, requester] =
      await hre.ethers.getSigners();

    // Deploy WelliIDRegistry
    const WelliIDRegistry = await hre.ethers.getContractFactory(
      "WelliIDRegistry"
    );
    const welliRegistry = await WelliIDRegistry.deploy();

    // Deploy DataIntegrityRegistry
    const DataIntegrityRegistry = await hre.ethers.getContractFactory(
      "DataIntegrityRegistry"
    );
    const dataRegistry = await DataIntegrityRegistry.deploy();

    // Deploy AccessControlRegistry
    const AccessControlRegistry = await hre.ethers.getContractFactory(
      "AccessControlRegistry"
    );
    const acr = await AccessControlRegistry.deploy();

    // Set registries on ACR
    await acr.connect(deployer).setWelliIDRegistry(welliRegistry.target);
    await acr.connect(deployer).setDataRegistry(dataRegistry.target);

    // Setup for WelliID: Add trusted issuer and register patient's DID
    const patientDidHash = hre.ethers.solidityPackedKeccak256(
      ["address"],
      [patient.address]
    );
    const vcHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("vc-hash-patient")
    );
    await welliRegistry
      .connect(deployer)
      .addTrustedIssuer(issuer.address, "ipfs://issuer-meta");
    await welliRegistry
      .connect(issuer)
      .registerDID(patientDidHash, vcHash, patient.address);

    // Setup for DataIntegrityRegistry: Set trusted issuer and register patient's data entries
    await dataRegistry.connect(deployer).setTrustedIssuer(issuer.address, true);
    const dataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("some data"));
    const issuerDID = `did:ethr:${issuer.address}`;
    const cid1 = "ipfs://doc1";
    const cid2 = "ipfs://doc2";
    await dataRegistry
      .connect(issuer)
      .registerData(patient.address, cid1, dataHash, issuerDID);
    await dataRegistry
      .connect(issuer)
      .registerData(patient.address, cid2, dataHash, issuerDID);

    return {
      acr,
      welliRegistry,
      dataRegistry,
      deployer,
      issuer,
      patient,
      requester,
      patientDidHash,
      cid1,
      cid2,
      vcHash,
      dataHash,
      issuerDID,
    };
  }

  describe("Deployment", function () {
    it("Should set deployer as the owner", async function () {
      const [deployer] = await hre.ethers.getSigners();
      const { acr } = await loadFixture(deployFixture);
      expect(await acr.owner()).to.equal(deployer.address);
    });
  });

  describe("Registry management", function () {
    it("Owner can set WelliIDRegistry", async function () {
      const { acr, welliRegistry } = await loadFixture(deployFixture);
      expect(await acr.welliIDRegistry()).to.equal(welliRegistry.target);
    });

    it("Owner can set DataIntegrityRegistry", async function () {
      const { acr, dataRegistry } = await loadFixture(deployFixture);
      expect(await acr.dataRegistry()).to.equal(dataRegistry.target);
    });

    it("Should revert if non-owner sets WelliIDRegistry", async function () {
      const { acr, patient } = await loadFixture(deployFixture);
      const invalidAddr = hre.ethers.ZeroAddress;
      await expect(
        acr.connect(patient).setWelliIDRegistry(invalidAddr)
      ).to.be.revertedWithCustomError(acr, "OwnableUnauthorizedAccount");
    });

    it("Should revert if non-owner sets DataIntegrityRegistry", async function () {
      const { acr, patient } = await loadFixture(deployFixture);
      const invalidAddr = hre.ethers.ZeroAddress;
      await expect(
        acr.connect(patient).setDataRegistry(invalidAddr)
      ).to.be.revertedWithCustomError(acr, "OwnableUnauthorizedAccount");
    });

    it("Should revert if setting zero address for WelliIDRegistry", async function () {
      const { acr, deployer } = await loadFixture(deployFixture);
      const zeroAddr = hre.ethers.ZeroAddress;
      await expect(
        acr.connect(deployer).setWelliIDRegistry(zeroAddr)
      ).to.be.revertedWith("invalid registry");
    });

    it("Should revert if setting zero address for DataIntegrityRegistry", async function () {
      const { acr, deployer } = await loadFixture(deployFixture);
      const zeroAddr = hre.ethers.ZeroAddress;
      await expect(
        acr.connect(deployer).setDataRegistry(zeroAddr)
      ).to.be.revertedWith("invalid registry");
    });
  });

  describe("Grant access", function () {
    const scope = "read:fhir:lab";

    it("Patient can grant access and emit event", async function () {
      const { acr, patient, requester, cid1 } = await loadFixture(
        deployFixture
      );
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;

      const tx = await acr
        .connect(patient)
        .grantAccess(requester.address, cid1, scope, expiry);

      await expect(tx)
        .to.emit(acr, "AccessGranted")
        .withArgs(patient.address, requester.address, cid1, scope, expiry);

      const hasAccess = await acr.hasAccess(
        patient.address,
        requester.address,
        cid1
      );
      expect(hasAccess).to.be.true;

      const [pPatient, pReq, pCid, pScope, pExpiry, pActive] =
        await acr.getPermission(patient.address, requester.address, cid1);
      expect(pPatient).to.equal(patient.address);
      expect(pReq).to.equal(requester.address);
      expect(pCid).to.equal(cid1);
      expect(pScope).to.equal(scope);
      expect(pExpiry).to.equal(expiry);
      expect(pActive).to.be.true;
    });

    it("Should revert if CID is empty", async function () {
      const { acr, patient, requester } = await loadFixture(deployFixture);
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await expect(
        acr.connect(patient).grantAccess(requester.address, "", scope, expiry)
      ).to.be.revertedWith("cid required");
    });

    it("Should revert if requester is zero address", async function () {
      const { acr, patient } = await loadFixture(deployFixture);
      const zeroAddr = hre.ethers.ZeroAddress;
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await expect(
        acr.connect(patient).grantAccess(zeroAddr, "cid", scope, expiry)
      ).to.be.revertedWith("invalid requester");
    });

    it("Should revert if expiry is not in future", async function () {
      const { acr, patient, requester } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        acr.connect(patient).grantAccess(requester.address, "cid", scope, now)
      ).to.be.revertedWith("expiry must be in future");
    });

    it("Should revert if DID is revoked", async function () {
      const {
        acr,
        welliRegistry,
        issuer,
        patient,
        requester,
        patientDidHash,
        cid1,
      } = await loadFixture(deployFixture);
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;

      // Revoke the DID
      await welliRegistry.connect(issuer).revokeLatest(patientDidHash);

      await expect(
        acr.connect(patient).grantAccess(requester.address, cid1, scope, expiry)
      ).to.be.revertedWith("AccessControl: user not registered or revoked");
    });

    it("Should revert if caller not owner of CID", async function () {
      const {
        acr,
        dataRegistry,
        deployer,
        issuer,
        patient,
        requester,
        cid1,
        dataHash,
        issuerDID,
      } = await loadFixture(deployFixture);
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;

      // Register cid1 with deployer as patient (changes owner)
      await dataRegistry
        .connect(issuer)
        .registerData(deployer.address, cid1, dataHash, issuerDID);

      await expect(
        acr.connect(patient).grantAccess(requester.address, cid1, scope, expiry)
      ).to.be.revertedWith("caller not owner of record");
    });

    it("Should revert if permission already active", async function () {
      const { acr, patient, requester, cid1 } = await loadFixture(
        deployFixture
      );
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;

      await acr
        .connect(patient)
        .grantAccess(requester.address, cid1, scope, expiry);

      await expect(
        acr.connect(patient).grantAccess(requester.address, cid1, scope, expiry)
      ).to.be.revertedWith("permission already active");
    });
  });

  describe("Batch grant access", function () {
    it("Patient can batch grant access", async function () {
      const { acr, patient, requester, cid1, cid2 } = await loadFixture(
        deployFixture
      );
      const scope = "read:fhir:lab";
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;

      const cids = [cid1, cid2];

      const tx = await acr
        .connect(patient)
        .grantBatchAccess(requester.address, cids, scope, expiry);

      await expect(tx)
        .to.emit(acr, "AccessGranted")
        .withArgs(patient.address, requester.address, cid1, scope, expiry)
        .and.to.emit(acr, "AccessGranted")
        .withArgs(patient.address, requester.address, cid2, scope, expiry);

      expect(await acr.hasAccess(patient.address, requester.address, cid1)).to
        .be.true;
      expect(await acr.hasAccess(patient.address, requester.address, cid2)).to
        .be.true;
    });

    it("Should revert if no CIDs provided", async function () {
      const { acr, patient, requester } = await loadFixture(deployFixture);
      const emptyCids: string[] = [];
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await expect(
        acr
          .connect(patient)
          .grantBatchAccess(requester.address, emptyCids, "scope", expiry)
      ).to.be.revertedWith("no cids provided");
    });

    it("Should revert if requester is zero address", async function () {
      const { acr, patient } = await loadFixture(deployFixture);
      const zeroAddr = hre.ethers.ZeroAddress;
      const cids = ["cid1"];
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await expect(
        acr.connect(patient).grantBatchAccess(zeroAddr, cids, "scope", expiry)
      ).to.be.revertedWith("invalid requester");
    });

    it("Should revert if expiry not in future", async function () {
      const { acr, patient, requester } = await loadFixture(deployFixture);
      const now = await time.latest();
      const cids = ["cid1"];
      await expect(
        acr
          .connect(patient)
          .grantBatchAccess(requester.address, cids, "scope", now)
      ).to.be.revertedWith("expiry must be in future");
    });
  });

  describe("Revocation", function () {
    let acr: any;
    let deployer: any;
    let patient: any;
    let requester: any;
    let cid1: string;
    let scope: string;

    beforeEach(async function () {
      const fixture = await loadFixture(deployFixture);
      acr = fixture.acr;
      deployer = fixture.deployer;
      patient = fixture.patient;
      requester = fixture.requester;
      cid1 = fixture.cid1;
      scope = "read:fhir:lab";
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await acr
        .connect(patient)
        .grantAccess(requester.address, cid1, scope, expiry);
    });

    it("Patient can revoke access and emit event", async function () {
      const tx = await acr
        .connect(patient)
        .revokeAccess(requester.address, cid1);

      await expect(tx)
        .to.emit(acr, "AccessRevoked")
        .withArgs(patient.address, requester.address, cid1);

      const hasAccess = await acr.hasAccess(
        patient.address,
        requester.address,
        cid1
      );
      expect(hasAccess).to.be.false;

      const [, , , , , active] = await acr.getPermission(
        patient.address,
        requester.address,
        cid1
      );
      expect(active).to.be.false;
    });

    it("Should revert if revoked twice", async function () {
      await acr.connect(patient).revokeAccess(requester.address, cid1);

      await expect(
        acr.connect(patient).revokeAccess(requester.address, cid1)
      ).to.be.revertedWith("not active");
    });

    it("Should revert if non-patient tries to revoke", async function () {
      await expect(
        acr.connect(deployer).revokeAccess(requester.address, cid1)
      ).to.be.revertedWith("only patient can revoke");
    });
  });

  describe("Batch revoke access", function () {
    let acr: any;
    let patient: any;
    let requester: any;
    let cid1: string;
    let cid2: string;
    let scope: string;

    beforeEach(async function () {
      const fixture = await loadFixture(deployFixture);
      acr = fixture.acr;
      patient = fixture.patient;
      requester = fixture.requester;
      cid1 = fixture.cid1;
      cid2 = fixture.cid2;
      scope = "read:fhir:lab";
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await acr
        .connect(patient)
        .grantAccess(requester.address, cid1, scope, expiry);
      await acr
        .connect(patient)
        .grantAccess(requester.address, cid2, scope, expiry);
    });

    it("Patient can batch revoke access", async function () {
      const cids = [cid1, cid2];

      const tx = await acr
        .connect(patient)
        .revokeBatchAccess(requester.address, cids);

      await expect(tx)
        .to.emit(acr, "AccessRevoked")
        .withArgs(patient.address, requester.address, cid1)
        .and.to.emit(acr, "AccessRevoked")
        .withArgs(patient.address, requester.address, cid2);

      expect(await acr.hasAccess(patient.address, requester.address, cid1)).to
        .be.false;
      expect(await acr.hasAccess(patient.address, requester.address, cid2)).to
        .be.false;
    });

    it("Should revert if no CIDs provided", async function () {
      const emptyCids: string[] = [];
      await expect(
        acr.connect(patient).revokeBatchAccess(requester.address, emptyCids)
      ).to.be.revertedWith("no cids provided");
    });
  });

  describe("Access checks", function () {
    let acr: any;
    let patient: any;
    let requester: any;
    let cid1: string;
    let scope: string;

    beforeEach(async function () {
      const fixture = await loadFixture(deployFixture);
      acr = fixture.acr;
      patient = fixture.patient;
      requester = fixture.requester;
      cid1 = fixture.cid1;
      scope = "read:fhir:lab";
      const now = await time.latest();
      const expiry = BigInt(now) + 3600n;
      await acr
        .connect(patient)
        .grantAccess(requester.address, cid1, scope, expiry);
    });

    it("hasAccess returns true if active and not expired", async function () {
      expect(await acr.hasAccess(patient.address, requester.address, cid1)).to
        .be.true;
    });

    it("hasAccess returns false if expired", async function () {
      await time.increase(7200);

      expect(await acr.hasAccess(patient.address, requester.address, cid1)).to
        .be.false;
    });

    it("hasAccess returns false if revoked", async function () {
      await acr.connect(patient).revokeAccess(requester.address, cid1);
      expect(await acr.hasAccess(patient.address, requester.address, cid1)).to
        .be.false;
    });

    it("getPermission returns correct details for existing", async function () {
      const [, pReq, pCid, pScope, pExpiry, pActive] = await acr.getPermission(
        patient.address,
        requester.address,
        cid1
      );
      expect(pReq).to.equal(requester.address);
      expect(pCid).to.equal(cid1);
      expect(pScope).to.equal(scope);
      expect(pActive).to.be.true;
      expect(pExpiry).to.be.gt(0);
    });

    it("getPermission returns defaults for non-existing", async function () {
      const [pPatient, , , , , pActive] = await acr.getPermission(
        patient.address,
        requester.address,
        "nonexistent"
      );
      expect(pPatient).to.equal(hre.ethers.ZeroAddress);
      expect(pActive).to.be.false;
    });
  });
});
