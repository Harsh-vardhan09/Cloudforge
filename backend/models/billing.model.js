import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gpu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GPU",
    },
    durationSeconds: {
      type: Number,
      required: true,
    },
    costPerMinute: {
      type: Number,
      required: true,
      default: 0.5,
    },
    totalCostDeducted: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "Credits",
    },
    status: {
      type: String,
      enum: ['deducted', 'failed', 'pending'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const Billing = mongoose.model("Billing", BillingSchema);
export default Billing;
