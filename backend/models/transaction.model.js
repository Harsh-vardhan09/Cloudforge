import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // Amount in INR
  creditsAdded: { type: Number, required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'payment'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  paymentProvider: { type: String, enum: ['razorpay', 'demo'], default: 'razorpay' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  demoOrderId: { type: String },
  demoPaymentId: { type: String },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' }, // If it's a payment for a job
}, { timestamps: true });

// Payment verification looks up a pending order by provider-specific order id.
transactionSchema.index({ razorpayOrderId: 1, user: 1, status: 1 });
transactionSchema.index({ demoOrderId: 1, user: 1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
