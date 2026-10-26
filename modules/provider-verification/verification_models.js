// Collections for provider verification. Every name starts with pv_ so nothing here can collide with the
// main backend's collections in the shared database.
//
// pv_audit is append-only. The model refuses updates and deletes. For a guarantee at the database level, set
// AUDIT_MONGO_URI to a connection string for a database user that can only insert and find on pv_audit; the
// audit writer then uses that connection, so even a bug or a stolen application credential cannot change history.
import mongoose, { Schema } from 'mongoose';
const base = { timestamps: true };
const PvProviderSchema = new Schema({
    staffUserId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, index: true },
    // Ids of people in the mobile backend's clinic console who are this provider. Set by a senior reviewer. The mobile gate reads this.
    linkedStaffIds: { type: [String], default: [], index: true },
    displayName: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    specialtyTier: { type: String, default: 'none' },
    status: { type: String, required: true, default: 'application_pending', index: true },
    registrationLevel: { type: String },
    licenceExpiry: { type: String },
    governingCredentialId: { type: String },
    verifiedAt: { type: Date },
    nextReviewAt: { type: Date, index: true },
    remindersSent: { type: [Number], default: [] },
    termsAcceptedAt: { type: Date },
    termsVersion: { type: String },
}, { ...base, collection: 'pv_providers' });
const PvCredentialSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    regulator: { type: String, required: true },
    registrationNumber: { type: String, required: true },
    registrationLevel: { type: String, required: true },
    licenceExpiry: { type: String, required: true },
    sourceType: { type: String, required: true },
    sourceRef: { type: String },
    checkedAt: { type: Date },
    checkedBy: { type: String },
    result: { type: String },
    note: { type: String },
}, { ...base, collection: 'pv_credentials' });
const PvDocumentSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    docType: { type: String, required: true },
    objectKey: { type: String, required: true, unique: true },
    originalName: { type: String, required: true },
    mime: { type: String, required: true },
    declaredSize: { type: Number, required: true },
    sizeBytes: { type: Number },
    sha256: { type: String },
    uploadState: { type: String, default: 'slot_issued' },
    scanStatus: { type: String, default: 'pending' },
    uploadedAt: { type: Date },
    retentionUntil: { type: Date, required: true, index: true },
    deletedAt: { type: Date },
}, { ...base, collection: 'pv_documents' });
const EvidenceRequestSchema = new Schema({ requestedBy: String, requestedAt: Date, text: String, answeredAt: Date, answer: String }, { _id: false });
const CheckSchema = new Schema({ credentialId: String, sourceType: String, sourceRef: String, checkedAt: Date, checkedBy: String, result: String, note: String }, { _id: false });
const PvCaseSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    kind: { type: String, default: 'initial' },
    claimedTier: { type: String, default: 'none' },
    state: { type: String, default: 'open', index: true },
    submittedAt: { type: Date, required: true, default: () => new Date(), index: true },
    assignedReviewer: { type: String, index: true },
    decision: { type: String },
    reason: { type: String },
    decidedAt: { type: Date },
    decidedBy: { type: String },
    evidenceRequests: { type: [EvidenceRequestSchema], default: [] },
    checks: { type: [CheckSchema], default: [] },
}, { ...base, collection: 'pv_cases' });
const PvPermissionSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    function: { type: String, required: true },
    grantedBy: { type: String, required: true },
    grantedAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date },
}, { ...base, collection: 'pv_permissions' });
const PvRestrictionSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    scope: { type: String, required: true },
    reasonCode: { type: String, required: true },
    reason: { type: String, required: true },
    evidenceRef: { type: String, required: true },
    state: { type: String, default: 'proposed', index: true },
    proposedBy: { type: String, required: true },
    proposedAt: { type: Date, required: true, default: () => new Date() },
    appliedBy: { type: String },
    appliedAt: { type: Date },
    emergency: { type: Boolean, default: false },
    reviewState: { type: String, default: 'not_needed', index: true },
    reviewDueAt: { type: Date },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    appealState: { type: String, default: 'none' },
    appealNote: { type: String },
    liftedAt: { type: Date },
    liftedBy: { type: String },
    confirmedIssueAt: { type: Date },
}, { ...base, collection: 'pv_restrictions' });
const PvComplaintSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    reporterId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    description: { type: String, required: true },
    state: { type: String, default: 'open', index: true },
    assignedTo: { type: String, index: true },
    needsSenior: { type: Boolean, default: false },
    outcome: { type: String },
    escalatedTo: { type: String },
    escalationNote: { type: String },
    openedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date },
}, { ...base, collection: 'pv_complaints' });
const PvRecheckSchema = new Schema({
    providerId: { type: String, required: true, index: true },
    dueAt: { type: Date, required: true, index: true },
    doneAt: { type: Date },
    doneBy: { type: String },
    alertedAt: { type: Date },
}, { ...base, collection: 'pv_rechecks' });
const PvAuditSchema = new Schema({
    actorId: { type: String, required: true, index: true },
    actorType: { type: String, required: true },
    action: { type: String, required: true, index: true },
    subjectType: { type: String, required: true },
    subjectId: { type: String, required: true, index: true },
    purpose: { type: String },
    lawfulBasis: { type: String },
    detail: { type: Schema.Types.Mixed },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true, immutable: true },
}, { collection: 'pv_audit', timestamps: false, strict: true });
const refuse = () => {
    throw new Error('The audit log is append-only');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove']) {
    PvAuditSchema.pre(op, refuse);
}
PvAuditSchema.pre('save', function (next) {
    if (!this.isNew)
        return next(new Error('The audit log is append-only'));
    next();
});
PvAuditSchema.pre('deleteOne', { document: true, query: false }, refuse);
function model(name, schema) {
    return mongoose.models[name] || mongoose.model(name, schema);
}
export const PvProvider = model('PvProvider', PvProviderSchema);
export const PvCredential = model('PvCredential', PvCredentialSchema);
export const PvDocument = model('PvDocument', PvDocumentSchema);
export const PvCase = model('PvCase', PvCaseSchema);
export const PvPermission = model('PvPermission', PvPermissionSchema);
export const PvRestriction = model('PvRestriction', PvRestrictionSchema);
export const PvComplaint = model('PvComplaint', PvComplaintSchema);
export const PvRecheck = model('PvRecheck', PvRecheckSchema);
let auditModel = null;
let auditConn = null;
/** True when audit writes use their own restricted connection (AUDIT_MONGO_URI). */
export const auditIsRestricted = () => Boolean(process.env.AUDIT_MONGO_URI);
/**
 * The audit model. With AUDIT_MONGO_URI set it lives on a separate connection whose database user can only insert and find,
 * so history cannot be changed even by code with the main database credential. Without it, the model-level guards above apply.
 */
export function auditModelFor() {
    if (auditModel)
        return auditModel;
    const uri = process.env.AUDIT_MONGO_URI;
    if (uri) {
        // A restricted user cannot create indexes, so an admin creates them once (see CLAUDE.md).
        auditConn = mongoose.createConnection(uri, { autoIndex: false });
        auditModel = auditConn.model('PvAudit', PvAuditSchema);
    }
    else {
        auditModel = model('PvAudit', PvAuditSchema);
    }
    return auditModel;
}
