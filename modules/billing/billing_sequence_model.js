import mongoose from "mongoose";

const { Schema } = mongoose;

// A dedicated counter collection so invoice/receipt numbers are
// guaranteed unique and gapless under concurrent requests. The
// count-based pattern used elsewhere in this codebase (see
// generateEncounterCode in shared/utils/helper.js) has a real race
// window — two requests in the same millisecond can read the same
// count and produce the same code. That's tolerable for an internal
// encounter label; it is not tolerable for a financial document
// number, so this uses findOneAndUpdate's atomic $inc instead.
const billingSequenceSchema = new Schema({
  _id: { type: String, required: true }, // e.g. "invoice-2026", "receipt-2026"
  seq: { type: Number, default: 0 },
});

const BillingSequence = mongoose.model("BillingSequence", billingSequenceSchema);

export const getNextSequence = async (key) => {
  const doc = await BillingSequence.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
};

export const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const seq = await getNextSequence(`invoice-${year}`);
  return `WR-INV-${year}-${String(seq).padStart(6, "0")}`;
};

export const generateReceiptNumber = async () => {
  const year = new Date().getFullYear();
  const seq = await getNextSequence(`receipt-${year}`);
  return `WR-RCT-${year}-${String(seq).padStart(6, "0")}`;
};
