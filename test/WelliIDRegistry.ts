import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("WelliIDRegistry", function () {
  async function deployFixture() {
    const [owner, issuer1, issuer2, user1, user2] = await hre.ethers.getSigners();

    const WelliIDRegistry = await hre.ethers.getContractFactory("WelliIDRegistry");
    const registry = await WelliIDRegistry.deploy();

    return { registry, owner, issuer1, issuer2, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set deployer as the owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("Trusted issuer management", function () {
    it("Owner can add a trusted issuer and emit event", async function () {
      const { registry, owner, issuer1 } = await loadFixture(deployFixture);

      await expect(registry.connect(owner).addTrustedIssuer(issuer1.address, "ipfs://meta1"))
        .to.emit(registry, "TrustedIssuerAdded")
        .withArgs(issuer1.address, "ipfs://meta1");

      expect(await registry.isTrustedIssuer(issuer1.address)).to.be.true;
      expect(await registry.issuerMetadata(issuer1.address)).to.equal("ipfs://meta1");
    });

    it("Should revert if non-owner tries to add issuer", async function () {
      const { registry, issuer1, user1 } = await loadFixture(deployFixture);
      await expect(
        registry.connect(user1).addTrustedIssuer(issuer1.address, "meta")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("Owner can remove trusted issuer and emit event", async function () {
      const { registry, owner, issuer1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");

      await expect(registry.connect(owner).removeTrustedIssuer(issuer1.address))
        .to.emit(registry, "TrustedIssuerRemoved")
        .withArgs(issuer1.address);

      expect(await registry.isTrustedIssuer(issuer1.address)).to.be.false;
    });
  });

  describe("Registration", function () {
    const didHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:welli:123"));
    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("vc-hash-1"));

    it("Trusted issuer can register a DID", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");

      const tx = await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);

      await expect(tx)
        .to.emit(registry, "DIDRegistered")
        .withArgs(didHash, vcHash, issuer1.address, anyValue, 0);

      const [latestVc, latestIssuer, , revoked] = await registry.getLatestVCHash(didHash);
      expect(latestVc).to.equal(vcHash);
      expect(latestIssuer).to.equal(issuer1.address);
      expect(revoked).to.equal(false);

      const len = await registry.getHistoryLength(didHash);
      expect(len).to.equal(1);
    });

    it("Should revert if non-trusted tries to register", async function () {
      const { registry, user1, user2 } = await loadFixture(deployFixture);
      const didHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:unauth"));
      const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("vc-bad"));

      await expect(
        registry.connect(user1).registerDID(didHash, vcHash, user2.address)
      ).to.be.revertedWith("WelliID: caller not a trusted issuer");
    });

    it("Should revert if DID already active (not revoked)", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");

      await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);

      await expect(
        registry.connect(issuer1).registerDID(didHash, vcHash, user1.address)
      ).to.be.revertedWith("WelliID: DID already registered and active");
    });
  });

  describe("Revocation", function () {
    const didHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:welli:rev123"));
    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("vc-hash-rev"));

    it("Issuer who registered can revoke latest", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");

      await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);

      const tx = await registry.connect(issuer1).revokeLatest(didHash);

      await expect(tx)
        .to.emit(registry, "DIDRevoked")
        .withArgs(didHash, issuer1.address, anyValue, 0);

      const [, , , revoked] = await registry.getLatestVCHash(didHash);
      expect(revoked).to.be.true;
    });

    it("Owner can also revoke", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");

      await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);

      await expect(registry.connect(owner).revokeLatest(didHash))
        .to.emit(registry, "DIDRevoked")
        .withArgs(didHash, owner.address, anyValue, 0);
    });

    it("Should revert if revoked twice", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");
      await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);
      await registry.connect(issuer1).revokeLatest(didHash);

      await expect(
        registry.connect(issuer1).revokeLatest(didHash)
      ).to.be.revertedWith("WelliID: already revoked");
    });

    it("Should revert if no registration exists", async function () {
      const { registry, issuer1 } = await loadFixture(deployFixture);
      const fakeDid = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:none"));
      await expect(registry.connect(issuer1).revokeLatest(fakeDid)).to.be.revertedWith(
        "WelliID: no registration exists"
      );
    });
  });

  describe("View functions", function () {
    const didHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:welli:view"));
    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("vc-view"));

    it("Returns correct history and entries", async function () {
      const { registry, owner, issuer1, user1 } = await loadFixture(deployFixture);
      await registry.connect(owner).addTrustedIssuer(issuer1.address, "meta");
      await registry.connect(issuer1).registerDID(didHash, vcHash, user1.address);

      const len = await registry.getHistoryLength(didHash);
      expect(len).to.equal(1);

      const [vc, issuer, timestamp, revoked] = await registry.getHistoryEntry(didHash, 0);
      expect(vc).to.equal(vcHash);
      expect(issuer).to.equal(issuer1.address);
      expect(revoked).to.be.false;
      expect(timestamp).to.be.gt(0);
    });

    it("Should revert on out-of-bounds history index", async function () {
      const { registry } = await loadFixture(deployFixture);
      const fakeDid = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("did:oob"));
      await expect(registry.getHistoryEntry(fakeDid, 0)).to.be.revertedWith("WelliID: history index OOB");
    });
  });
});
