import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("AccessControlRegistry", function () {
  async function deployFixture() {
    const [owner, patient, requester, other, fakeIssuer] = await hre.ethers.getSigners();

    // --- Deploy mock WelliIDRegistry ---
    const WelliIDMock = await hre.ethers.getContractFactory(`
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.28;
      contract WelliIDMock {
          bytes32 public lastDid;
          bool public revoked;
          function setDidStatus(bytes32 did, bool _revoked) external { lastDid = did; revoked = _revoked; }
          function getLatestVCHash(bytes32 didHash) external view returns (bytes32,address,uint256,bool) {
              return (bytes32("vc"), address(this), block.timestamp, revoked);
          }
      }
    `);
    const welliMock = await WelliIDMock.deploy();

    // --- Deploy mock DataIntegrityRegistry ---
    const DataMock = await hre.ethers.getContractFactory(`
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.28;
      contract DataMock {
          mapping(string => address) public ownerOf;
          function setOwner(string calldata cid, address who) external { ownerOf[cid] = who; }
          function getOwner(string calldata cid) external view returns (address) { return ownerOf[cid]; }
      }
    `);
    const dataMock = await DataMock.deploy();

    // --- Deploy AccessControlRegistry ---
    const AccessControl = await hre.ethers.getContractFactory("AccessControlRegistry");
    const access = await AccessControl.deploy();

    // configure the mocks
    await access.connect(owner).setWelliIDRegistry(welliMock.target);
    await access.connect(owner).setDataRegistry(dataMock.target);

    return { access, welliMock, dataMock, owner, patient, requester, other };
  }

  describe("Setup and ownership", function () {
    it("Owner can set registry addresses", async function () {
      const { access, owner } = await loadFixture(deployFixture);
      const newAddr = hre.ethers.Wallet.createRandom().address;

      await expect(access.connect(owner).setWelliIDRegistry(newAddr))
        .to.emit(access, "OwnershipTransferred") // internal Ownable event (optional)
        .or.not.to.be.reverted;

      await expect(access.connect(owner).setDataRegistry(newAddr))
        .not.to.be.reverted;
    });

    it("Non-owner cannot set registries", async function () {
      const { access, other } = await loadFixture(deployFixture);
      const rand = hre.ethers.Wallet.createRandom().address;
      await expect(access.connect(other).setWelliIDRegistry(rand)).to.be.revertedWithCustomError(
        access,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Granting access", function () {
    it("Patient can grant access if all conditions pass", async function () {
      const { access, dataMock, welliMock, patient, requester } = await loadFixture(deployFixture);

      const cid = "Qm123";
      await dataMock.setOwner(cid, patient.address);
      await welliMock.setDidStatus(hre.ethers.keccak256(hre.ethers.encodeBytes32String(patient.address)), false);

      const expiry = (await time.latest()) + 3600;

      const tx = await access.connect(patient).grantAccess(requester.address, cid, "read", expiry);
      await expect(tx)
        .to.emit(access, "AccessGranted")
        .withArgs(patient.address, requester.address, cid, "read", expiry);

      const has = await access.hasAccess(patient.address, requester.address, cid);
      expect(has).to.be.true;

      const perm = await access.getPermission(patient.address, requester.address, cid);
      expect(perm._active).to.be.true;
      expect(perm._scope).to.equal("read");
    });

    it("Should revert if expiry is not in the future", async function () {
      const { access, dataMock, welliMock, patient, requester } = await loadFixture(deployFixture);
      const cid = "cidA";
      await dataMock.setOwner(cid, patient.address);
      await welliMock.setDidStatus(hre.ethers.keccak256(hre.ethers.encodeBytes32String(patient.address)), false);

      await expect(
        access.connect(patient).grantAccess(requester.address, cid, "read", Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("expiry must be in future");
    });

    it("Should revert if WelliID revoked or not registered", async function () {
      const { access, dataMock, welliMock, patient, requester } = await loadFixture(deployFixture);
      const cid = "cidB";
      await dataMock.setOwner(cid, patient.address);
      await welliMock.setDidStatus(hre.ethers.keccak256(hre.ethers.encodeBytes32String(patient.address)), true); // revoked
      const expiry = (await time.latest()) + 1000;
      await expect(
        access.connect(patient).grantAccess(requester.address, cid, "scope",
