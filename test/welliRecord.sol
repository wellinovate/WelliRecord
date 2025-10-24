// pragma solidity ^0.8.28;

// /// @title WelliRecord - Minimal on-chain rulebook & audit log for patient health records
// /// @notice Compact, production-oriented starter contract. Do NOT store PII or raw clinical payloads on-chain.
// /// @dev Uses OpenZeppelin AccessControl. Meant for Hardhat/Foundry development; add tests and audits before production.

// import "@openzeppelin/contracts/access/AccessControl.sol";
// import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// contract WelliRecord is AccessControl, ReentrancyGuard {
//     bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
//     bytes32 public constant BRIDGE_ROLE  = keccak256("BRIDGE_ROLE");

//     /// @dev Actions bitmask: 1 = read, 2 = write, 4 = share (combinable)
//     struct Record {
//         address patient;
//         address issuer;
//         bytes32 dataHash;        // keccak256(encryptedBlob) or keccak256(CID)
//         bytes32 storagePointerHash; // prefer hashed pointer (bytes32) to avoid storing strings
//         uint64  createdAt;
//         bool    revoked;
//     }

//     struct Permission {
//         bool allowed;
//         uint64 expiresAt;
//         uint8  actions;   // bitmask
//         bytes32 purpose;
//         address grantedBy;
//         uint64 grantedAt;
//     }

//     // Mappings
//     mapping(bytes32 => Record) public records; // recordId -> Record
//     mapping(bytes32 => mapping(address => Permission)) public permissions; // recordId -> grantee -> Permission

//     // Events (audit trail)
//     event RecordIssued(bytes32 indexed recordId, address indexed patient, address indexed issuer, bytes32 dataHash, uint64 at);
//     event RecordRevoked(bytes32 indexed recordId, address indexed by, uint64 at);
//     event PermissionGranted(bytes32 indexed recordId, address indexed grantee, address indexed grantedBy, uint64 expiresAt, uint8 actions, bytes32 purpose, uint64 at);
//     event PermissionRevoked(bytes32 indexed recordId, address indexed grantee, address indexed by, uint64 at);
//     event RecordAccessed(bytes32 indexed recordId, address indexed grantee, address indexed performedBy, bytes32 action, uint64 at, bytes32 sessionId);

//     /// @param admin address that will receive DEFAULT_ADMIN_ROLE (if address(0), deployer is admin)
//     constructor(address admin) {
//         address adminAddr = admin == address(0) ? msg.sender : admin;
//         // _setupRole(DEFAULT_ADMIN_ROLE, adminAddr);
//     }

//     // -------------------------
//     // ISSUER functions
//     // -------------------------

//     /// @notice Issue a new record metadata. Only accounts with ISSUER_ROLE can call.
//     /// @dev recordId must be unique (not previously issued). storagePointerHash is keccak256 of the encrypted pointer/CID.
//     function issueRecord(
//         bytes32 recordId,
//         address patient,
//         bytes32 dataHash,
//         bytes32 storagePointerHash
//     ) external onlyRole(ISSUER_ROLE) nonReentrant {
//         require(recordId != bytes32(0), "invalid id");
//         require(patient != address(0), "invalid patient");
//         require(records[recordId].createdAt == 0, "record exists");

//         records[recordId] = Record({
//             patient: patient,
//             issuer: msg.sender,
//             dataHash: dataHash,
//             storagePointerHash: storagePointerHash,
//             createdAt: uint64(block.timestamp),
//             revoked: false
//         });

//         emit RecordIssued(recordId, patient, msg.sender, dataHash, uint64(block.timestamp));
//     }

//     // -------------------------
//     // Patient / Admin functions
//     // -------------------------

//     /// @notice Revoke a record. Callable by patient, issuer, or admin.
//     function revokeRecord(bytes32 recordId) external nonReentrant {
//         Record storage r = records[recordId];
//         require(r.createdAt != 0, "no record");
//         require(msg.sender == r.patient || msg.sender == r.issuer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "not allowed");
//         require(!r.revoked, "already revoked");

//         r.revoked = true;
//         emit RecordRevoked(recordId, msg.sender, uint64(block.timestamp));
//     }

//     /// @notice Grant permission for a grantee to act on a record. Callable by patient, issuer, or admin.
//     function grantPermission(
//         bytes32 recordId,
//         address grantee,
//         uint64 expiresAt,
//         uint8 actions,
//         bytes32 purpose
//     ) external nonReentrant {
//         Record storage r = records[recordId];
//         require(r.createdAt != 0 && !r.revoked, "invalid record");
//         require(grantee != address(0), "invalid grantee");
//         require(msg.sender == r.patient || msg.sender == r.issuer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "not allowed to grant");

//         permissions[recordId][grantee] = Permission({
//             allowed: true,
//             expiresAt: expiresAt,
//             actions: actions,
//             purpose: purpose,
//             grantedBy: msg.sender,
//             grantedAt: uint64(block.timestamp)
//         });

//         emit PermissionGranted(recordId, grantee, msg.sender, expiresAt, actions, purpose, uint64(block.timestamp));
//     }

//     /// @notice Revoke permission for a grantee. Callable by patient, issuer, or admin.
//     function revokePermission(bytes32 recordId, address grantee) external nonReentrant {
//         Record storage r = records[recordId];
//         require(r.createdAt != 0, "no record");
//         require(msg.sender == r.patient || msg.sender == r.issuer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "not allowed to revoke");

//         delete permissions[recordId][grantee];
//         emit PermissionRevoked(recordId, grantee, msg.sender, uint64(block.timestamp));
//     }

//     // -------------------------
//     // Bridge functions (audit)
//     // -------------------------

//     /// @notice Called by the off-chain Bridge after serving content to grantee. Emits an audit event.
//     /// @dev Only accounts with BRIDGE_ROLE may call to prevent fake audit entries.
//     function logAccess(bytes32 recordId, address grantee, bytes32 action, bytes32 sessionId) external onlyRole(BRIDGE_ROLE) {
//         emit RecordAccessed(recordId, grantee, msg.sender, action, uint64(block.timestamp), sessionId);
//     }

//     // -------------------------
//     // Views
//     // -------------------------

//     /// @notice Check whether grantee currently has neededAction for given record.
//     function hasPermission(bytes32 recordId, address grantee, uint8 neededAction) public view returns (bool) {
//         Permission memory p = permissions[recordId][grantee];
//         if (!p.allowed) return false;
//         if (p.expiresAt != 0 && p.expiresAt < block.timestamp) return false;
//         return (p.actions & neededAction) == neededAction;
//     }

//     /// @notice Convenience getter for record existence / basic metadata.
//     function getRecordMeta(bytes32 recordId) external view returns (address patient, address issuer, bytes32 dataHash, bytes32 storagePointerHash, uint64 createdAt, bool revoked) {
//         Record memory r = records[recordId];
//         return (r.patient, r.issuer, r.dataHash, r.storagePointerHash, r.createdAt, r.revoked);
//     }
// }
