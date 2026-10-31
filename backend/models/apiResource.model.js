import mongoose from 'mongoose';

const ApiResourceSchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true, // e.g., "Professional GPT-4 Cluster"
  },
  provider: {
    type: String,
    enum: ['openai', 'anthropic', 'google', 'custom'],
    required: true
  },
  customProviderName: {
    type: String, // Only if provider is 'custom'
  },
  encryptedKey: {
    type: String,
    required: true
  },
  hourlyRate: {
    type: Number,
    default: 0.1 // USD per hour
  },
  tokenRate: {
    type: Number,
    default: 1.0 // USD per 1M tokens
  },
  billingCycle: {
    type: String,
    enum: ['hourly', 'daily'],
    default: 'hourly'
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'expired'],
    default: 'active'
  },
  usageLimit: {
    type: Number, // Limit total spending if set
  },
  rentals: [{
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: Date
  }]
}, { timestamps: true });

const ApiResource = mongoose.model('ApiResource', ApiResourceSchema);
export default ApiResource;
