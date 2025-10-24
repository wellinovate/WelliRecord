// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DataIntegrityRegistry
/// @notice Stores tamper-proof proofs for data entries: (patientAddress -> entries[])
contract DataIntegrityRegistry is Ownable {
    /// Only trusted issuers (labs, clinics, devices) should register data
    mapping(address => bool) public isTrustedIssuer;

    struct Entry {
        address patient;
        string cid;         // IPFS CID (or vault pointer)
        bytes32 dataHash;   // keccak256 of plaintext/encrypted payload
        uint64 timestamp;
        string issuerDID;   // issuer DID as string (ex: did:ethr:0x...)
        address issuer;     // who submitted it
    }

    /// 🔹 Each patient address => their entries
    mapping(address => Entry[]) private patientEntries;
    mapping(string => address) private cidOwner;


    event DataRegistered(
        address indexed patient,
        uint256 indexed index,   // position in patient's array
        string cid,
        bytes32 dataHash,
        uint64 timestamp,
        string issuerDID,
        address indexed issuer
    );

    constructor() Ownable(msg.sender) {}

    modifier onlyTrustedIssuer() {
        require(isTrustedIssuer[msg.sender], "Not trusted issuer");
        _;
    }

    function setTrustedIssuer(address issuer, bool allowed) external onlyOwner {
        isTrustedIssuer[issuer] = allowed;
    }

    

    /// Trusted issuer registers the data's integrity proof
    function registerData(
        address patient,
        string calldata cid,
        bytes32 dataHash,
        string calldata issuerDID
    ) external onlyTrustedIssuer returns (uint256) {
        require(patient != address(0), "invalid patient");
        require(bytes(cid).length > 0, "cid required");

        uint64 ts = uint64(block.timestamp);

        patientEntries[patient].push(Entry({
            patient: patient,
            cid: cid,
            dataHash: dataHash,
            timestamp: ts,
            issuerDID: issuerDID,
            issuer: msg.sender
        }));

        cidOwner[cid] = patient;

        uint256 index = patientEntries[patient].length - 1;
        emit DataRegistered(patient, index, cid, dataHash, ts, issuerDID, msg.sender);

        return index;
    }

    function getOwner(string calldata cid) external view returns (address) {
        return cidOwner[cid];
    }


    /// Fetch a single entry for a patient by index
    function getEntry(address patient, uint256 index) external view returns (Entry memory) {
        require(index < patientEntries[patient].length, "invalid index");
        return patientEntries[patient][index];
    }

    /// Get how many entries a patient has
    function totalEntries(address patient) external view returns (uint256) {
        return patientEntries[patient].length;
    }

    /// Get all entries for a patient (⚠️ beware of gas if too many)
    function getAllEntries(address patient) external view returns (Entry[] memory) {
        return patientEntries[patient];
    }
}

