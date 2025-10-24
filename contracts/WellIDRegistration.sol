// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WelliIDRegistry (revised)
/// @notice Maps a DID (hashed to bytes32) -> VC hash (bytes32) and stores registration history
/// - Uses bytes32 keys to save gas and make indexing efficient
/// - Keeps history entries for auditability
/// - Allows issuers to register and revoke; owner can also revoke or manage trusted issuers

contract WelliIDRegistry is Ownable {
    /// Registration entry stored per DID (didHash)
    struct Registration {
        address owner;
        bytes32 vcHash;     // keccak256 of the VC JSON (canonicalized off-chain)
        address issuer;     // issuer address that performed the registration
        uint256 timestamp;  // block.timestamp when registered
        bool revoked;       // whether this entry was later revoked
    }

    /// trusted issuers (EOA or contract addresses) 
    mapping(address => bool) public isTrustedIssuer;

    /// issuer address => metadata (e.g., DID of issuer, public key pointer, IPFS CID for metadata)
    mapping(address => string) public issuerMetadata;

    /// didHash (bytes32) => index of latest registration in registrations[didHash] (0-based)
    mapping(bytes32 => uint256) private latestIndex;

    /// didHash (bytes32) => array of Registration entries
    mapping(bytes32 => Registration[]) private registrations;

    /// events
    event TrustedIssuerAdded(address indexed issuer, string metadata);
    event TrustedIssuerRemoved(address indexed issuer);
    event DIDRegistered(bytes32 indexed didHash, bytes32 indexed vcHash, address indexed issuer, uint256 timestamp, uint256 index);
    event DIDRevoked(bytes32 indexed didHash, address indexed revokedBy, uint256 timestamp, uint256 index);


     constructor() Ownable(msg.sender) { }
    /// -------- Modifiers --------
    modifier onlyTrustedIssuer() {
        require(isTrustedIssuer[msg.sender], "WelliID: caller not a trusted issuer");
        _;
    }

    /// -------- Trusted issuer management (owner-only) --------
    function addTrustedIssuer(address issuer, string calldata metadata) external onlyOwner {
        require(issuer != address(0), "WelliID: zero issuer");
        require(!isTrustedIssuer[issuer], "WelliID: issuer already trusted");
        isTrustedIssuer[issuer] = true;
        issuerMetadata[issuer] = metadata;
        emit TrustedIssuerAdded(issuer, metadata);
    }

    function removeTrustedIssuer(address issuer) external onlyOwner {
        require(isTrustedIssuer[issuer], "WelliID: issuer not trusted");
        isTrustedIssuer[issuer] = false;
        delete issuerMetadata[issuer];
        emit TrustedIssuerRemoved(issuer);
    }

    /// -------- Registration & revocation --------
    /// @notice Register a DID (represented by didHash) to a vcHash. Callable only by trusted issuers.
    /// @dev Appends a new Registration entry to the DID's history and marks it as latest.
    /// @param didHash keccak256(abi.encodePacked(didString)) computed off-chain
    /// @param vcHash keccak256 of the VC JSON (canonicalized)
    function registerDID(bytes32 didHash, bytes32 vcHash, address didOwner) public onlyTrustedIssuer {
        require(didHash != bytes32(0), "WelliID: invalid didHash");
        require(vcHash != bytes32(0), "WelliID: invalid vcHash");
        require(didOwner != address(0), "WelliID: invalid owner");

        // Enforce one active account per DID
        uint256 len = registrations[didHash].length;
        if (len > 0) {
            uint256 id = latestIndex[didHash];
            require(registrations[didHash][id].revoked, "WelliID: DID already registered and active");
        }

        Registration memory r = Registration({
            owner: didOwner,
            vcHash: vcHash,
            issuer: msg.sender,
            timestamp: block.timestamp,
            revoked: false
        });

        registrations[didHash].push(r);
        uint256 idx = registrations[didHash].length - 1;
        latestIndex[didHash] = idx;

        emit DIDRegistered(didHash, vcHash, msg.sender, block.timestamp, idx);
    }


    /// @notice Revoke the latest registration for a DID.
    /// @dev Only the issuer who created the latest registration OR the contract owner can revoke.
    /// This records the revocation by setting the 'revoked' flag on the latest entry.
    /// @param didHash keccak256(abi.encodePacked(didString)) computed off-chain
    function revokeLatest(bytes32 didHash) external {
        require(didHash != bytes32(0), "WelliID: invalid didHash");
        uint256 len = registrations[didHash].length;
        require(len > 0, "WelliID: no registration exists");

        uint256 idx = latestIndex[didHash];
        Registration storage reg = registrations[didHash][idx];

        // only issuer who registered this entry or owner can revoke
        require(msg.sender == reg.issuer || msg.sender == owner(), "WelliID: not authorized to revoke");

        require(!reg.revoked, "WelliID: already revoked");
        reg.revoked = true;

        emit DIDRevoked(didHash, msg.sender, block.timestamp, idx);
    }


    /// -------- Views / getters --------

    /// @notice Returns the latest vcHash and whether it is revoked
    function getLatestVCHash(bytes32 didHash) external view returns (bytes32 vcHash, address issuer, uint256 timestamp, bool revoked) {
        uint256 len = registrations[didHash].length;
        if (len == 0) return (bytes32(0), address(0), 0, false);
        uint256 idx = latestIndex[didHash];
        Registration storage reg = registrations[didHash][idx];
        return (reg.vcHash, reg.issuer, reg.timestamp, reg.revoked);
    }

    /// @notice Returns number of registration entries for a DID (history length)
    function getHistoryLength(bytes32 didHash) external view returns (uint256) {
        return registrations[didHash].length;
    }

    /// @notice Return a specific history entry by index (0-based)
    function getHistoryEntry(bytes32 didHash, uint256 index) external view returns (bytes32 vcHash, address issuer, uint256 timestamp, bool revoked) {
        require(index < registrations[didHash].length, "WelliID: history index OOB");
        Registration storage reg = registrations[didHash][index];
        return (reg.vcHash, reg.issuer, reg.timestamp, reg.revoked);
    }

    /// @notice Helper: checks if an address is a trusted issuer
    function checkTrustedIssuer(address addr) external view returns (bool) {
        return isTrustedIssuer[addr];
    }

}
