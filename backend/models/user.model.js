import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['user', 'host'], default: 'user' },
  creditBalance:  { type: Number, default: 0 },
  billingStatus: { type: String, enum: ['active', 'suspended', 'insufficient_funds'], default: 'active' },
}, { timestamps: true });

const User =  mongoose.model('User', userSchema);
export default User;