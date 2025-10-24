// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AccessControlRegistry
/// @notice Stores permission grants (patient -> requester) for specific data CIDs with scope + expiry
import "@openzeppelin/contracts/access/Ownable.sol";

interface IWelliIDRegistry {
    function getLatestVCHash(bytes32 didHash) external view returns (bytes32 vcHash, address issuer, uint256 timestamp, bool revoked);
}

interface IDataIntegrityRegistry {
    function getOwner(string calldata cid) external view returns (address);
}


contract AccessControlRegistry is Ownable {
    struct Permission {
        address patient;
        address requester;
        string cid;         // IPFS CID (document pointer)
        string scope;            // e.g., "read:fhir:lab", "aggregate", etc.
        uint64 expiry;           // unix timestamp
        bool active;
    }

    IWelliIDRegistry public welliIDRegistry;

    IDataIntegrityRegistry public dataRegistry;

    function setDataRegistry(address registry) external onlyOwner {
        require(registry != address(0), "invalid registry");
        dataRegistry = IDataIntegrityRegistry(registry);
    }

    /// Set the WelliIDRegistry contract (owner-only)
    function setWelliIDRegistry(address registry) external onlyOwner {
        require(registry != address(0), "invalid registry");
        welliIDRegistry = IWelliIDRegistry(registry);
    }


    /// keccak(patient, requester, cid) => Permission
    mapping(bytes32 => Permission) private permissions;

    event AccessGranted(address indexed patient, address indexed requester, string cid, string scope, uint64 expiry);
    event AccessRevoked(address indexed patient, address indexed requester, string cid);

    constructor() Ownable(msg.sender) { }

    /// Compute key
    function _permKey(address patient, address requester, string memory cid) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(patient, requester, cid));
    }

    

    /// Patient grants access to a requester for a specific CID + scope + expiry
    /// Patient must be msg.sender
    function grantAccess(address requester, string calldata cid, string calldata scope, uint64 expiry) public {
        require(bytes(cid).length > 0, "cid required");
        require(requester != address(0), "invalid requester");
        require(expiry > block.timestamp, "expiry must be in future");

        // 🔹 Verify msg.sender has a registered, non-revoked DID
        bytes32 didHash = keccak256(abi.encodePacked(msg.sender)); // assuming DID string = msg.sender.toHex()
        (, , , bool revoked) = welliIDRegistry.getLatestVCHash(didHash);
        require(!revoked, "AccessControl: user not registered or revoked");
        require(dataRegistry.getOwner(cid) == msg.sender, "caller not owner of record");


        bytes32 key = _permKey(msg.sender, requester, cid);

        Permission storage existing = permissions[key];
        require(!existing.active, "permission already active");

        permissions[key] = Permission({
            patient: msg.sender,
            requester: requester,
            cid: cid,
            scope: scope,
            expiry: expiry,
            active: true
        });

        emit AccessGranted(msg.sender, requester, cid, scope, expiry);
    }


     // 🔹 Batch grant
    function grantBatchAccess(
        address requester,
        string[] calldata cids,
        string calldata scope,
        uint64 expiry
    ) public {
        require(requester != address(0), "invalid requester");
        require(expiry > block.timestamp, "expiry must be in future");
        require(cids.length > 0, "no cids provided");

        for (uint256 i = 0; i < cids.length; i++) {
            string calldata cid = cids[i];
            require(bytes(cid).length > 0, "empty cid");
            grantAccess(requester, cid, scope, expiry);
        }
    }


    /// Patient revokes a previously granted permission
    function revokeAccess(address requester, string calldata cid) public {
        bytes32 key = _permKey(msg.sender, requester, cid);
        Permission storage p = permissions[key];
        require(p.patient == msg.sender, "only patient can revoke");
        require(p.active, "not active");

        p.active = false;
        emit AccessRevoked(msg.sender, requester, cid);
    }

    // 🔹 Batch revoke
    function revokeBatchAccess(address requester, string[] calldata cids) external {
        require(cids.length > 0, "no cids provided");

        for (uint256 i = 0; i < cids.length; i++) {
            revokeAccess(requester, cids[i]);
        }
    }

    /// Check whether a requester currently has valid access to a CID from the patient
    function hasAccess(address patient, address requester, string calldata cid) public view returns (bool) {
        bytes32 key = _permKey(patient, requester, cid);
        Permission storage p = permissions[key];
        // if (!p.active) return false;
        // if (block.timestamp > p.expiry) return false;
        // return true;
        return p.active && block.timestamp <= p.expiry;
    }

    /// Return permission details if needed
    function getPermission(address patient, address requester, string calldata cid) external view returns (
        address _patient,
        address _requester,
        string memory _cid,
        string memory _scope,
        uint64 _expiry,
        bool _active
    ) {

        bytes32 key = _permKey(patient, requester, cid);
        Permission storage p = permissions[key];
        return (p.patient, p.requester, p.cid, p.scope, p.expiry, p.active);
    }
}
