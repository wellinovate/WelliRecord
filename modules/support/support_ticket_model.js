import mongoose from "mongoose";

const { Schema } = mongoose;

// SLA hours per priority. Tickets are created without a priority set —
// support triages and assigns one (see admin_support_routes.js) — so
// slaDeadline is null until then, not silently defaulted to a
// particular urgency.
export const SLA_HOURS = { P1: 4, P2: 24, P3: 72 };

const ticketMessageSchema = new Schema(
  {
    sender: {
      type: String,
      enum: ["user", "support"],
      required: true,
    },
    senderAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
  },
  { timestamps: { createdAt: "sentAt", updatedAt: false } },
);

const internalNoteSchema = new Schema(
  {
    authorAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    authorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: { createdAt: "at", updatedAt: false } },
);

const supportTicketSchema = new Schema(
  {
    ref: {
      type: String,
      unique: true,
      index: true,
    },

    category: {
      type: String,
      enum: [
        "records_issue",
        "access_issue",
        "billing",
        "sync_issue",
        "integration",
        "other",
      ],
      required: true,
      index: true,
    },

    priority: {
      type: String,
      enum: ["P1", "P2", "P3"],
      default: null,
      index: true,
    },

    slaDeadline: {
      type: Date,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed", "escalated"],
      default: "open",
      index: true,
    },

    userType: {
      type: String,
      enum: ["patient", "provider"],
      required: true,
      index: true,
    },

    submittedByAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    // UserProfile._id for patient-filed tickets — AccessGrant.patientId
    // (and most clinical collections) key off UserProfile, not Account,
    // so this is what getConsentActivityForTicketService actually
    // queries with. Not set for provider tickets.
    submittedByProfileId: {
      type: Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
      index: true,
    },

    // Denormalized at creation time so the ticket list and detail view
    // don't need a join to show who filed it — matches the display
    // needs the admin SupportDeskPage/TicketDetailPage already have.
    submittedByName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    facility: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    assigneeAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    assigneeName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    messages: {
      type: [ticketMessageSchema],
      default: [],
    },

    internalNotes: {
      type: [internalNoteSchema],
      default: [],
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ submittedByAccountId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

export const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
