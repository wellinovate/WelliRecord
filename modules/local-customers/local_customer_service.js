import crypto from "crypto";
import { LocalCustomer } from "./local_customer_model.js";
import { matchCustomer } from "./local_customer_matching_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { PatientOrganization } from "../organizations/patient_organization_model.js";
import { UserProfile } from "../users/user_profile_model.js";

// ─── Normalize a raw import row into a consistent shape ───────────────────────
function normalizeRow(row) {
  return {
    externalId:  String(row.externalId || row.customerId || row.customer_id || row.id || "").trim() || null,
    firstName:   String(row.firstName  || row.first_name  || row["First Name"]  || "").trim() || null,
    lastName:    String(row.lastName   || row.last_name   || row["Last Name"]   || "").trim() || null,
    fullName:    String(row.fullName   || row.full_name   || row["Full Name"]   || row.name   || row.Name || "").trim() || null,
    phone:       String(row.phone      || row.Phone       || row["Phone Number"]|| row.mobile || "").trim().replace(/\s/g, "") || null,
    email:       String(row.email      || row.Email       || row["Email"]       || "").trim().toLowerCase() || null,
    dob:         row.dob || row.dateOfBirth || row.date_of_birth || row["Date of Birth"] || null,
    gender:      String(row.gender     || row.Gender      || "").toLowerCase().trim() || null,
    address:     String(row.address    || row.Address     || "").trim() || null,
    hmo:         String(row.hmo        || row.HMO         || row["HMO"]        || "").trim() || null,
    lastVisit:   row.lastVisit  || row.last_visit  || row["Last Visit"]  || null,
  };
}

// ─── Deduplicate rows within the batch by phone + email ──────────────────────
function deduplicateBatch(rows) {
  const seenPhones = new Set();
  const seenEmails = new Set();
  const unique = [];
  const skipped = [];

  for (const row of rows) {
    const phoneKey = row.phone || null;
    const emailKey = row.email || null;

    const phoneConflict = phoneKey && seenPhones.has(phoneKey);
    const emailConflict = emailKey && seenEmails.has(emailKey);

    if (phoneConflict || emailConflict) {
      skipped.push(row);
      continue;
    }

    if (phoneKey) seenPhones.add(phoneKey);
    if (emailKey) seenEmails.add(emailKey);
    unique.push(row);
  }

  return { unique, skippedInBatch: skipped.length };
}

// ─── Main import service ──────────────────────────────────────────────────────
export async function importLocalCustomersService({ rows, authUser }) {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }

  const organizationId = organization._id;

  // 1. Normalize all rows
  const normalized = rows.map(normalizeRow).filter(
    // Must have at least a name and (phone or email)
    (r) => (r.fullName || (r.firstName && r.lastName)) && (r.phone || r.email)
  );

  if (normalized.length === 0) {
    const err = new Error("No valid rows found. Each row must have a name and phone or email.");
    err.statusCode = 400;
    throw err;
  }

  // 2. Deduplicate within batch
  const { unique, skippedInBatch } = deduplicateBatch(normalized);

  // 3. Find existing LocalCustomers for this org to skip re-imports
  const existingPhones = unique.map((r) => r.phone).filter(Boolean);
  const existingEmails = unique.map((r) => r.email).filter(Boolean);
  const existingDocs = await LocalCustomer.find({
    organizationId,
    $or: [
      { phone: { $in: existingPhones } },
      { email: { $in: existingEmails } },
    ],
  }).select("phone email").lean();

  const existingPhoneSet = new Set(existingDocs.map((d) => d.phone).filter(Boolean));
  const existingEmailSet = new Set(existingDocs.map((d) => d.email).filter(Boolean));

  const newRows = [];
  let duplicatesSkipped = skippedInBatch;

  for (const row of unique) {
    if (
      (row.phone && existingPhoneSet.has(row.phone)) ||
      (row.email && existingEmailSet.has(row.email))
    ) {
      duplicatesSkipped++;
    } else {
      newRows.push(row);
    }
  }

  if (newRows.length === 0) {
    return {
      total: rows.length,
      processed: 0,
      matched: 0,
      possibleMatch: 0,
      new: 0,
      failed: 0,
      duplicatesSkipped,
    };
  }

  // 4. Run matching engine on each new row (in parallel, capped at 20 at a time)
  const BATCH = 20;
  const docs = [];

  for (let i = 0; i < newRows.length; i += BATCH) {
    const chunk = newRows.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const match = await matchCustomer({
          phone:     row.phone,
          email:     row.email,
          fullName:  row.fullName,
          firstName: row.firstName,
          lastName:  row.lastName,
          dob:       row.dob,
        });

        const derivedFullName =
          row.fullName ||
          [row.firstName, row.lastName].filter(Boolean).join(" ") ||
          "Unknown";

        return {
          organizationId,
          externalId:      row.externalId,
          firstName:       row.firstName,
          lastName:        row.lastName,
          fullName:        derivedFullName,
          phone:           row.phone,
          email:           row.email,
          dob:             row.dob   ? new Date(row.dob)       : null,
          gender:          ["male","female","other"].includes(row.gender) ? row.gender : null,
          address:         row.address,
          hmo:             row.hmo,
          lastVisit:       row.lastVisit ? new Date(row.lastVisit) : null,
          matchStatus:     match.status,
          matchConfidence: match.confidence,
          matchedOn:       match.matchedOn,
          matchCandidates: match.candidates,
          welliRecordUserId: match.status === "matched" ? match.userId : null,
          invitationStatus:  match.status === "matched" ? "linked" : "not_sent",
        };
      })
    );
    docs.push(...results);
  }

  // 5. Bulk insert (ordered: false = partial success tolerated)
  let insertedCount = 0;
  let failedCount = 0;

  try {
    const inserted = await LocalCustomer.insertMany(docs, {
      ordered: false,
      rawResult: true,
    });
    insertedCount = inserted.insertedCount ?? docs.length;
  } catch (err) {
    // insertMany with ordered:false throws on duplicate key errors but still
    // inserts valid docs; the count is in err.result.
    if (err.code === 11000 || err.writeErrors) {
      insertedCount = err.result?.nInserted ?? 0;
      failedCount   = err.writeErrors?.length ?? (docs.length - insertedCount);
    } else {
      throw err;
    }
  }

  // Tally outcomes
  const counts = { matched: 0, possibleMatch: 0, new: 0, failed: failedCount };
  for (const d of docs) {
    if (d.matchStatus === "matched")        counts.matched++;
    else if (d.matchStatus === "possible_match") counts.possibleMatch++;
    else if (d.matchStatus === "new")       counts.new++;
    else                                    counts.failed++;
  }

  return {
    total: rows.length,
    processed: insertedCount,
    matched:       counts.matched,
    possibleMatch: counts.possibleMatch,
    new:           counts.new,
    failed:        counts.failed,
    duplicatesSkipped,
  };
}

// ─── Get paginated list of local customers ────────────────────────────────────
export async function getLocalCustomersService({ page = 1, limit = 20, matchStatus, invitationStatus, search, authUser }) {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  const filter = { organizationId: organization._id };
  if (matchStatus)      filter.matchStatus = matchStatus;
  if (invitationStatus) filter.invitationStatus = invitationStatus;
  if (search) {
    filter.$or = [
      { fullName: new RegExp(search, "i") },
      { phone:    new RegExp(search, "i") },
      { email:    new RegExp(search, "i") },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    LocalCustomer.find(filter)
      .populate("welliRecordUserId", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LocalCustomer.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get dashboard stats ──────────────────────────────────────────────────────
export async function getLocalCustomerStatsService({ authUser }) {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  const orgFilter = { organizationId: organization._id };

  const [
    total,
    matched,
    possibleMatch,
    newCount,
    notSent,
    sent,
    opened,
    registered,
    linked,
    expired,
    thisMonth,
  ] = await Promise.all([
    LocalCustomer.countDocuments(orgFilter),
    LocalCustomer.countDocuments({ ...orgFilter, matchStatus: "matched" }),
    LocalCustomer.countDocuments({ ...orgFilter, matchStatus: "possible_match" }),
    LocalCustomer.countDocuments({ ...orgFilter, matchStatus: "new" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "not_sent" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "sent" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "opened" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "registered" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "linked" }),
    LocalCustomer.countDocuments({ ...orgFilter, invitationStatus: "expired" }),
    LocalCustomer.countDocuments({
      ...orgFilter,
      invitationStatus: "registered",
      updatedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    }),
  ]);

  const totalInvited = sent + opened + registered + linked + expired;
  const registrationRate = totalInvited > 0
    ? Math.round(((registered + linked) / totalInvited) * 100 * 10) / 10
    : 0;

  return {
    total,
    matched,
    possibleMatch,
    new: newCount,
    invitations: { notSent, sent, opened, registered, linked, expired },
    registeredThisMonth: thisMonth,
    registrationRate,
  };
}

// ─── Confirm a possible_match ─────────────────────────────────────────────────
export async function confirmMatchService({ id, userId, authUser }) {
  const customer = await LocalCustomer.findById(id);
  if (!customer) {
    const err = new Error("Local customer not found");
    err.statusCode = 404;
    throw err;
  }

  customer.matchStatus      = "matched";
  customer.matchConfidence  = 100;
  customer.welliRecordUserId = userId;
  customer.invitationStatus  = "linked";
  customer.matchCandidates   = [];
  await customer.save();
  return customer;
}

// ─── Dismiss a possible_match (treat as new) ──────────────────────────────────
export async function dismissMatchService({ id }) {
  const customer = await LocalCustomer.findByIdAndUpdate(
    id,
    { matchStatus: "new", matchCandidates: [], matchConfidence: 0, matchedOn: [] },
    { new: true }
  );
  if (!customer) {
    const err = new Error("Local customer not found");
    err.statusCode = 404;
    throw err;
  }
  return customer;
}

// ─── Generate single invitation ───────────────────────────────────────────────
export async function sendInvitationService({ id, authUser }) {
  const customer = await LocalCustomer.findById(id);
  if (!customer) {
    const err = new Error("Local customer not found");
    err.statusCode = 404;
    throw err;
  }

  const token = crypto.randomBytes(12).toString("hex");
  customer.invitationToken = token;
  customer.invitationStatus = "sent";
  customer.invitationSentAt = new Date();
  customer.invitationExpiresAt = new Date(Date.now() + 30 * 86400000); // 30 days
  await customer.save();

  const inviteUrl = `/join/${token}`;
  return { customer, inviteUrl, token };
}

// ─── Bulk send invitations ──────────────────────────────────────────────────
export async function bulkSendInvitationsService({ ids, authUser }) {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  const query = { organizationId: organization._id };
  if (Array.isArray(ids) && ids.length > 0) {
    query._id = { $in: ids };
  } else {
    query.invitationStatus = { $in: ["not_sent", "expired"] };
  }

  const customers = await LocalCustomer.find(query);
  let updatedCount = 0;

  for (const customer of customers) {
    if (customer.invitationStatus === "linked" || customer.matchStatus === "matched") {
      continue;
    }
    const token = crypto.randomBytes(12).toString("hex");
    customer.invitationToken = token;
    customer.invitationStatus = "sent";
    customer.invitationSentAt = new Date();
    customer.invitationExpiresAt = new Date(Date.now() + 30 * 86400000);
    await customer.save();
    updatedCount++;
  }

  return { totalInvited: updatedCount };
}

// ─── Public: Get Claim Record Info ──────────────────────────────────────────
export async function getClaimInfoService({ token }) {
  const customer = await LocalCustomer.findOne({ invitationToken: token });
  if (!customer) {
    const err = new Error("Invalid or expired invitation token");
    err.statusCode = 404;
    throw err;
  }

  const orgProfile = await OrganizationProfile.findOne({ accountId: customer.organizationId });

  // Update status to 'opened' if it was 'sent'
  if (customer.invitationStatus === "sent") {
    customer.invitationStatus = "opened";
    await customer.save();
  }

  const isExpired = customer.invitationExpiresAt && new Date() > customer.invitationExpiresAt;

  return {
    customer: {
      id: customer._id,
      fullName: customer.fullName,
      firstName: customer.firstName,
      phone: customer.phone,
      email: customer.email,
    },
    organization: {
      name: orgProfile?.organizationName || "Healthcare Provider",
      type: orgProfile?.organizationType || "clinic",
    },
    status: isExpired ? "expired" : customer.invitationStatus,
    isClaimed: customer.invitationStatus === "linked",
  };
}

// ─── Claim Record by Patient ─────────────────────────────────────────────────
export async function claimRecordService({ token, authUser }) {
  const customer = await LocalCustomer.findOne({ invitationToken: token });
  if (!customer) {
    const err = new Error("Invalid or expired invitation token");
    err.statusCode = 404;
    throw err;
  }

  if (customer.invitationStatus === "linked" && customer.welliRecordUserId) {
    return { customer, alreadyClaimed: true };
  }

  // Find patient's UserProfile
  const userId = authUser.sub || authUser.id || authUser._id;
  const userProfile = await UserProfile.findOne({
    $or: [{ accountId: userId }, { _id: userId }],
  });

  const patientProfileId = userProfile ? userProfile._id : userId;

  // Link customer
  customer.welliRecordUserId = patientProfileId;
  customer.matchStatus = "matched";
  customer.matchConfidence = 100;
  customer.invitationStatus = "linked";
  customer.matchCandidates = [];
  await customer.save();

  // Create PatientOrganization relationship
  try {
    await PatientOrganization.findOneAndUpdate(
      { patientId: patientProfileId, organizationId: customer.organizationId },
      {
        patientId: patientProfileId,
        organizationId: customer.organizationId,
        relationshipType: "registered",
        status: "active",
        externalPatientId: customer.externalId || null,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error("[claimRecordService] PatientOrganization upsert warning:", e.message);
  }

  return { customer, claimed: true };
}

