import crypto from "node:crypto";
import { invoiceModel } from "./invoice_model.js";
import { paymentModel } from "./payment_model.js";
import { receiptModel } from "./receipt_model.js";
import { generateInvoiceNumber, generateReceiptNumber } from "./billing_sequence_model.js";
import { resolvePatientAccessContext } from "../vitals/vital_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { PatientIdentity } from "../organizations/patient/patient_identity_model.js";
import { labOrderModel } from "../lab-orders/lab_order_model.js";
import { pharmacyOrderModel } from "../pharmacy-orders/pharmacy_order_model.js";
import { radiologyOrderModel } from "../radiology-orders/radiology_order_model.js";
import { getIO } from "../../shared/realtime/socket.js";
import { sendInvoiceEmail, sendPaymentReminderEmail } from "../../shared/utils/resend.js";
import { createNotification } from "../notifications/notification_services.js";

const broadcast = (organizationId, event, invoice) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${organizationId}`).emit(event, {
    documentId: invoice.id,
    document: invoice,
  });
};

const resolvePatientDoc = async (patientRef) => {
  if (!patientRef) return null;
  if (typeof patientRef === "object" && patientRef.fullName) return patientRef;
  const rawId = String(patientRef?._id || patientRef);

  const user = await UserProfile.findById(rawId).select("fullName firstName lastName wrId").lean();
  if (user && (user.fullName || user.firstName)) {
    return {
      _id: user._id,
      fullName: user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      wrId: user.wrId,
    };
  }

  const identity = await PatientIdentity.findById(rawId).select("fullName firstName lastName wrId").lean();
  if (identity && (identity.fullName || identity.firstName)) {
    return {
      _id: identity._id,
      fullName: identity.fullName || `${identity.firstName || ""} ${identity.lastName || ""}`.trim(),
      firstName: identity.firstName,
      lastName: identity.lastName,
      wrId: identity.wrId,
    };
  }

  return { _id: rawId, fullName: "Patient " + rawId.slice(-6).toUpperCase(), wrId: "" };
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const serializeInvoice = (item) => ({
  id: item._id,
  invoiceNumber: item.invoiceNumber,
  patientId: item.patientId,
  organizationId: item.organizationId,
  encounterId: item.encounterId,
  recordedBy: item.recordedBy,
  lineItems: (item.lineItems || []).map((li) => ({
    id: li._id,
    description: li.description,
    category: li.category,
    sourceType: li.sourceType,
    sourceId: li.sourceId,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    discount: li.discount,
    lineTotal: li.lineTotal,
  })),
  subtotal: item.subtotal,
  discountTotal: item.discountTotal,
  taxTotal: item.taxTotal,
  hmoContribution: item.hmoContribution,
  patientResponsibility: item.patientResponsibility,
  totalAmount: item.totalAmount,
  amountPaid: item.amountPaid,
  status: item.status,
  verificationToken: item.verificationToken,
  dueDate: item.dueDate,
  voidedAt: item.voidedAt,
  voidReason: item.voidReason,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

// Finds real, currently-unbilled charges already sitting on the
// patient's lab/pharmacy/radiology orders (paymentStatus: "pending")
// so a provider isn't retyping prices that already exist elsewhere.
// This does not touch or change those source records' paymentStatus —
// that only happens once the resulting invoice is actually paid, via
// syncSourceRecordsPaymentStatus below.
export const getCheckoutSuggestionsService = async ({ patientId, authUser }) => {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const error = new Error("Organization not found for this account");
    error.statusCode = 404;
    throw error;
  }

  const filter = { patientId, organizationId: organization._id, paymentStatus: "pending", recordStatus: "active" };

  const [labOrders, pharmacyOrders, radiologyOrders] = await Promise.all([
    labOrderModel.find(filter).select("testName price status").lean(),
    pharmacyOrderModel.find(filter).select("medicationName quantity price status").lean(),
    radiologyOrderModel.find(filter).select("examName price status").lean(),
  ]);

  return {
    suggestions: [
      ...labOrders.map((o) => ({
        description: o.testName,
        category: "laboratory",
        sourceType: "lab_order",
        sourceId: o._id,
        quantity: 1,
        unitPrice: o.price || 0,
      })),
      ...pharmacyOrders.map((o) => ({
        description: o.medicationName,
        category: "pharmacy",
        sourceType: "pharmacy_order",
        sourceId: o._id,
        quantity: o.quantity || 1,
        unitPrice: o.price || 0,
      })),
      ...radiologyOrders.map((o) => ({
        description: o.examName,
        category: "radiology",
        sourceType: "radiology_order",
        sourceId: o._id,
        quantity: 1,
        unitPrice: o.price || 0,
      })),
    ],
  };
};

const SOURCE_MODEL_MAP = {
  lab_order: labOrderModel,
  pharmacy_order: pharmacyOrderModel,
  radiology_order: radiologyOrderModel,
};

// Marks the source lab/pharmacy/radiology order as "paid" once the
// invoice covering it is fully settled. Best-effort — a failure here
// doesn't roll back the payment itself, since the payment record is
// the source of truth; this is just keeping the older per-module
// status flags in sync so those pages don't show stale "pending".
const syncSourceRecordsPaymentStatus = async (lineItems) => {
  await Promise.all(
    lineItems
      .filter((li) => li.sourceType !== "manual" && li.sourceId)
      .map(async (li) => {
        const model = SOURCE_MODEL_MAP[li.sourceType];
        if (!model) return;
        try {
          await model.findByIdAndUpdate(li.sourceId, { paymentStatus: "paid" });
        } catch (e) {
          console.error(`[syncSourceRecordsPaymentStatus] failed for ${li.sourceType}:${li.sourceId}`, e.message);
        }
      }),
  );
};

export const createInvoiceService = async ({ payload, authUser }) => {
  const { actor, patientId } = await resolvePatientAccessContext({
    patientId: payload.patientId,
    authUser,
  });

  if (!actor.isOrganizationActor || !actor.organizationId) {
    const error = new Error("Only a provider organization can issue an invoice");
    error.statusCode = 403;
    throw error;
  }

  const lineItemsInput = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  if (lineItemsInput.length === 0) {
    const error = new Error("An invoice needs at least one line item");
    error.statusCode = 400;
    throw error;
  }

  const lineItems = lineItemsInput.map((li) => {
    const quantity = Number(li.quantity) || 1;
    const unitPrice = Number(li.unitPrice) || 0;
    const discount = Number(li.discount) || 0;
    const lineTotal = round2(Math.max(0, quantity * unitPrice - discount));
    return {
      description: li.description,
      category: li.category || "other",
      sourceType: li.sourceType || "manual",
      sourceId: li.sourceId || null,
      quantity,
      unitPrice,
      discount,
      lineTotal,
    };
  });

  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0));
  const discountTotal = round2(lineItems.reduce((sum, li) => sum + li.discount, 0));
  const taxTotal = round2(Number(payload.taxTotal) || 0);
  const hmoContribution = round2(Number(payload.hmoContribution) || 0);

  const totalAmount = round2(Math.max(0, subtotal - discountTotal + taxTotal));
  const patientResponsibility = round2(Math.max(0, totalAmount - hmoContribution));

  const invoiceNumber = await generateInvoiceNumber();
  // 20 random bytes -> 40 hex chars. Only used as the public verify
  // lookup key, never displayed, so length/format isn't a UX concern.
  const verificationToken = crypto.randomBytes(20).toString("hex");

  const invoice = await invoiceModel.create({
    invoiceNumber,
    verificationToken,
    patientId,
    organizationId: actor.organizationId,
    encounterId: payload.encounterId || null,
    recordedBy: authUser?.sub || null,
    providerId: authUser?.sub || null,
    source: "provider",
    createdContext: "facility-chart",
    lineItems,
    subtotal,
    discountTotal,
    taxTotal,
    hmoContribution,
    patientResponsibility,
    totalAmount,
    dueDate: payload.dueDate || null,
  });

  const serialized = serializeInvoice(invoice);
  broadcast(actor.organizationId, "invoice_change", serialized);

  // Best-effort — matches the spec's "once generated, the invoice is
  // automatically sent" step. A failed send shouldn't roll back or
  // block the invoice itself; the provider can still resend manually
  // from the invoice detail view if this fails.
  try {
    await sendInvoiceService({ id: invoice._id, isReminder: false });
  } catch (e) {
    console.error(`[createInvoiceService] auto-send failed for invoice ${invoice.invoiceNumber}:`, e.message);
  }

  return serialized;
};

export const getInvoicesService = async ({ authUser, status, page = 1, limit = 20 }) => {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const error = new Error("Organization not found for this account");
    error.statusCode = 404;
    throw error;
  }

  const filter = { organizationId: organization._id };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    invoiceModel
      .find(filter)
      .populate("patientId", "fullName firstName lastName wrId")
      .populate("encounterId", "encounterLabel encounterCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    invoiceModel.countDocuments(filter),
  ]);

  const patientIds = [...new Set(items.map((i) => String(i.patientId?._id || i.patientId)).filter(Boolean))];
  const [userProfiles, patientIdentities] = await Promise.all([
    UserProfile.find({ _id: { $in: patientIds } }).select("fullName firstName lastName wrId").lean(),
    PatientIdentity.find({ _id: { $in: patientIds } }).select("fullName firstName lastName wrId").lean(),
  ]);

  const patientMap = new Map();
  userProfiles.forEach((u) => {
    patientMap.set(String(u._id), {
      _id: u._id,
      fullName: u.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      firstName: u.firstName,
      lastName: u.lastName,
      wrId: u.wrId,
    });
  });
  patientIdentities.forEach((p) => {
    if (!patientMap.has(String(p._id))) {
      patientMap.set(String(p._id), {
        _id: p._id,
        fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
        firstName: p.firstName,
        lastName: p.lastName,
        wrId: p.wrId,
      });
    }
  });

  return {
    items: items.map((item) => {
      const serialized = serializeInvoice(item);
      const rawPid = String(item.patientId?._id || item.patientId);
      const resolvedPatient =
        (typeof item.patientId === "object" && item.patientId?.fullName && item.patientId) ||
        patientMap.get(rawPid) ||
        { _id: rawPid, fullName: "Patient #" + rawPid.slice(-6).toUpperCase(), wrId: "" };

      return {
        ...serialized,
        patientId: resolvedPatient,
        encounterId: item.encounterId,
      };
    }),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getMyInvoicesService = async ({ authUser, patientId, status }) => {
  const accountId = authUser?.sub;
  const profileId = authUser?.profileId;

  // Resolve user profile
  let userProfile = null;
  if (profileId) {
    userProfile = await UserProfile.findById(profileId).lean();
  }
  if (!userProfile && accountId) {
    userProfile = await UserProfile.findOne({ accountId }).lean();
  }
  if (!userProfile && patientId) {
    userProfile = (await UserProfile.findById(patientId).lean()) || (await UserProfile.findOne({ accountId: patientId }).lean());
  }

  const patientIds = new Set();
  if (profileId) patientIds.add(String(profileId));
  if (userProfile?._id) patientIds.add(String(userProfile._id));
  if (accountId) patientIds.add(String(accountId));
  if (patientId) patientIds.add(String(patientId));

  // Also include any PatientIdentity records linked to this user or matching their phone/email
  const identityFilters = [];
  if (userProfile?._id) identityFilters.push({ userId: userProfile._id });
  if (userProfile?.wrId) identityFilters.push({ wrId: userProfile.wrId });
  if (userProfile?.email) identityFilters.push({ email: userProfile.email });
  if (userProfile?.phone) identityFilters.push({ phone: userProfile.phone });

  if (identityFilters.length > 0) {
    const linkedIdentities = await PatientIdentity.find({ $or: identityFilters }).select("_id").lean();
    linkedIdentities.forEach((li) => patientIds.add(String(li._id)));
  }

  const filter = { patientId: { $in: Array.from(patientIds) } };
  if (status) filter.status = status;

  const items = await invoiceModel
    .find(filter)
    .populate("organizationId", "organizationName")
    .sort({ createdAt: -1 })
    .lean();

  return {
    items: items.map((item, i) => ({
      ...serializeInvoice(item),
      organizationId: items[i].organizationId,
    })),
  };
};

// Public, unauthenticated — the endpoint a scanned invoice QR code
// hits. Deliberately returns only what's already printed on the paper
// invoice (so a third party like an HMO auditor or a bank can confirm
// a physical/PDF invoice matches the system record and wasn't altered)
// and nothing more: no line items, no clinical detail, no contact
// info beyond the organization name. Patient name is partially masked
// since this endpoint has no access control at all.
export const verifyInvoiceService = async ({ token }) => {
  if (!token) {
    const error = new Error("No invoice found for that verification link");
    error.statusCode = 404;
    throw error;
  }

  const invoice = await invoiceModel
    .findOne({ verificationToken: token })
    .populate("patientId", "fullName")
    .populate("organizationId", "organizationName")
    .lean();

  if (!invoice) {
    const error = new Error("No invoice found for that verification link");
    error.statusCode = 404;
    throw error;
  }

  let fullName = invoice.patientId?.fullName || "";
  if (!fullName && invoice.patientId) {
    const resolved = await resolvePatientDoc(invoice.patientId);
    fullName = resolved?.fullName || "";
  }
  const maskedName = fullName
    ? fullName
        .split(" ")
        .map((part, i) => (i === 0 ? part : `${part[0]}.`))
        .join(" ")
    : "Unknown patient";

  return {
    invoiceNumber: invoice.invoiceNumber,
    patientName: maskedName,
    organizationName: invoice.organizationId?.organizationName || "Unknown provider",
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    issuedAt: invoice.createdAt,
  };
};

export const getInvoiceByIdService = async ({ id, authUser }) => {
  const invoice = await invoiceModel
    .findById(id)
    .populate("patientId", "fullName firstName lastName wrId")
    .populate("organizationId", "organizationName")
    .populate("encounterId", "encounterLabel encounterCode")
    .lean();

  if (!invoice) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    throw error;
  }

  // A patient can view their own invoice directly (no org membership).
  // A provider needs the requirePermission("view_invoices") check
  // already applied at the route level, which implies org membership —
  // but we still confirm the invoice actually belongs to their org so
  // one org can't view another org's invoice by guessing an id.
  const invoicePid = String(invoice.patientId?._id || invoice.patientId);
  const accountId = authUser?.sub;
  const profileId = authUser?.profileId;

  let isOwningPatient = Boolean(
    (profileId && invoicePid === String(profileId)) ||
    (accountId && invoicePid === String(accountId))
  );

  if (!isOwningPatient && (profileId || accountId)) {
    const userProfile = (profileId && (await UserProfile.findById(profileId).lean())) ||
                        (accountId && (await UserProfile.findOne({ accountId }).lean()));
    if (userProfile) {
      if (invoicePid === String(userProfile._id)) {
        isOwningPatient = true;
      } else {
        const isLinkedIdentity = await PatientIdentity.exists({
          _id: invoicePid,
          $or: [
            { userId: userProfile._id },
            ...(userProfile.wrId ? [{ wrId: userProfile.wrId }] : []),
            ...(userProfile.email ? [{ email: userProfile.email }] : []),
            ...(userProfile.phone ? [{ phone: userProfile.phone }] : []),
          ],
        });
        if (isLinkedIdentity) isOwningPatient = true;
      }
    }
  }

  const isSameOrgProvider =
    authUser?.wrOrgId &&
    String(invoice.organizationId?._id) &&
    (await OrganizationProfile.exists({ _id: invoice.organizationId._id, wrOrgId: authUser.wrOrgId }));

  if (!isOwningPatient && !isSameOrgProvider) {
    const error = new Error("You don't have access to this invoice");
    error.statusCode = 403;
    throw error;
  }

  const [payments, receipts] = await Promise.all([
    paymentModel.find({ invoiceId: id }).sort({ paidAt: -1 }).lean(),
    receiptModel.find({ invoiceId: id }).sort({ issuedAt: -1 }).lean(),
  ]);

  const resolvedPatient = await resolvePatientDoc(invoice.patientId);
  return {
    ...serializeInvoice(invoice),
    patientId: resolvedPatient || invoice.patientId,
    organizationId: invoice.organizationId,
    encounterId: invoice.encounterId,
    payments,
    receipts,
  };
};

export const recordPaymentService = async ({ id, payload, authUser }) => {
  const invoice = await invoiceModel.findById(id);
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    throw error;
  }
  if (invoice.status === "void") {
    const error = new Error("Cannot record a payment against a voided invoice");
    error.statusCode = 400;
    throw error;
  }

  const amount = Number(payload.amount);
  if (!amount || amount <= 0) {
    const error = new Error("Payment amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }

  const remaining = round2(invoice.totalAmount - invoice.amountPaid);
  if (amount > remaining + 0.01) {
    const error = new Error(
      `Payment of ${amount} exceeds the outstanding balance of ${remaining}`,
    );
    error.statusCode = 400;
    throw error;
  }

  const payment = await paymentModel.create({
    invoiceId: invoice._id,
    amount,
    method: payload.method,
    reference: payload.reference || null,
    notes: payload.notes || null,
    recordedBy: authUser?.sub || null,
    organizationId: invoice.organizationId,
  });

  invoice.amountPaid = round2(invoice.amountPaid + amount);
  invoice.status =
    invoice.amountPaid >= invoice.totalAmount - 0.01 ? "paid" : "partially-paid";
  await invoice.save();

  const receiptNumber = await generateReceiptNumber();
  const receipt = await receiptModel.create({
    receiptNumber,
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    paymentId: payment._id,
    patientId: invoice.patientId,
    organizationId: invoice.organizationId,
    amount,
    method: payload.method,
  });

  if (invoice.status === "paid") {
    await syncSourceRecordsPaymentStatus(invoice.lineItems);
  }

  const serialized = serializeInvoice(invoice);
  broadcast(invoice.organizationId, "invoice_change", serialized);

  return { invoice: serialized, payment, receipt };
};

export const voidInvoiceService = async ({ id, reason, authUser }) => {
  const invoice = await invoiceModel.findById(id);
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    throw error;
  }
  if (invoice.amountPaid > 0) {
    const error = new Error(
      "This invoice has payments recorded against it and cannot be voided. Issue a credit note instead.",
    );
    error.statusCode = 400;
    throw error;
  }

  invoice.status = "void";
  invoice.voidedAt = new Date();
  invoice.voidedBy = authUser?.sub || null;
  invoice.voidReason = reason || null;
  await invoice.save();

  const serialized = serializeInvoice(invoice);
  broadcast(invoice.organizationId, "invoice_change", serialized);
  return serialized;
};

export const sendInvoiceService = async ({ id, isReminder = false }) => {
  const invoice = await invoiceModel
    .findById(id)
    .populate("patientId", "fullName")
    .populate("organizationId", "organizationName");

  if (!invoice) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    throw error;
  }

  const rawPid = String(invoice.patientId?._id || invoice.patientId);
  let patientProfile = await UserProfile.findById(rawPid).populate("accountId", "email").lean();
  let patientName = patientProfile?.fullName || `${patientProfile?.firstName || ""} ${patientProfile?.lastName || ""}`.trim();
  let email = patientProfile?.accountId?.email;
  let recipientAccountId = patientProfile?.accountId?._id;

  if (!patientProfile) {
    const localPatient = await PatientIdentity.findById(rawPid).lean();
    if (localPatient) {
      patientName = localPatient.fullName || `${localPatient.firstName || ""} ${localPatient.lastName || ""}`.trim();
      email = localPatient.email;
      if (localPatient.userId) {
        const linkedUser = await UserProfile.findById(localPatient.userId).populate("accountId", "email").lean();
        if (linkedUser?.accountId) {
          recipientAccountId = linkedUser.accountId._id;
          email = email || linkedUser.accountId.email;
        }
      }
    }
  }

  const remaining = round2(invoice.totalAmount - invoice.amountPaid);

  if (email) {
    if (isReminder) {
      await sendPaymentReminderEmail({
        email,
        patientName: patientName,
        invoiceNumber: invoice.invoiceNumber,
        amountDue: remaining,
        organizationName: invoice.organizationId?.organizationName,
      });
      invoice.lastReminderSentAt = new Date();
    } else {
      await sendInvoiceEmail({
        email,
        patientName: patientName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        organizationName: invoice.organizationId?.organizationName,
      });
      invoice.lastSentAt = new Date();
    }
    await invoice.save();
  }

  if (recipientAccountId) {
    await createNotification({
      recipientAccountId: recipientAccountId,
      type: isReminder ? "payment_reminder" : "invoice_issued",
      title: isReminder ? "Payment reminder" : "New invoice from " + (invoice.organizationId?.organizationName || "your provider"),
      body: isReminder
        ? `You have ₦${remaining.toLocaleString()} outstanding on invoice ${invoice.invoiceNumber}.`
        : `Invoice ${invoice.invoiceNumber} for ₦${invoice.totalAmount.toLocaleString()} is ready to view.`,
      link: "/patient/billing",
    });
  }

  return { emailed: Boolean(email) };
};
