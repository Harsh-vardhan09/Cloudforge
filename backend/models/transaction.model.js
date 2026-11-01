import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // Amount in INR
  creditsAdded: { type: Number, required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'payment'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' }, // If it's a payment for a job
}, { timestamps: true });

// verifyPayment looks a deposit up by its Razorpay order id
transactionSchema.index({ razorpayOrderId: 1, user: 1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
