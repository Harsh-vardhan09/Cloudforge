import Razorpay from 'razorpay';
import crypto from 'crypto';
import util from 'util';
import User from '../models/user.model.js';
import Transaction from '../models/transaction.model.js';
import { logger } from '../utils/logger.js';

let _rzp = null;
const getRazorpay = () => {
  if (!_rzp) {
    _rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _rzp;
};

// Create Order (Purchasing Credits)
export const createOrder = async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount); // Amount in INR
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Valid amount in INR is required" });
    }

    // For simplicity, 1 INR = 1 Credit
    const amountInINR = Math.round(amount * 100) / 100;
    const creditsToReceive = amountInINR;
    const amountInPaise = Math.round(amountInINR * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}_${req.user.id}`,
    };

    const order = await getRazorpay().orders.create(options);

    // Record the credit amount this order is worth while we still own the number.
    // verifyPayment reads it back from here rather than trusting the client.
    await Transaction.create({
      user: req.user.id,
      amount: amountInINR,
      creditsAdded: creditsToReceive,
      type: 'deposit',
      status: 'pending',
      razorpayOrderId: order.id,
    });

    res.json({
      ...order,
      creditsToReceive
    });
  } catch (error) {
    const errorMsg = error.error ? error.error.description : error.message;
    logger.error(`Razorpay Order Creation Failed: ${errorMsg || 'Unknown Error'}`);
    logger.error(`Full error: ${util.inspect(error, { depth: null })}`);
    next(error);
  }
};

// Verify Payment
export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "Razorpay order id, payment id, and signature are all required",
      });
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      logger.error("RAZORPAY_KEY_SECRET is not configured; refusing to verify payments");
      return res.status(500).json({ message: "Payment verification is not configured" });
    }

    // The pending order created by createOrder is the only source of truth for how
    // many credits this payment buys. Never credit an amount supplied by the client.
    const pending = await Transaction.findOne({
      razorpayOrderId: razorpay_order_id,
      user: req.user.id,
      type: 'deposit',
      status: 'pending',
    });
    if (!pending) {
      return res.status(404).json({ message: "No pending order found for this payment" });
    }

    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const providedBuffer = Buffer.from(String(razorpay_signature), "utf8");
    const expectedBuffer = Buffer.from(expectedSign, "utf8");
    const signatureValid =
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!signatureValid) {
      await Transaction.updateOne(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'failed', razorpayPaymentId: razorpay_payment_id } }
      );
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    // Claim the pending row atomically so a replayed verify cannot credit twice.
    const settled = await Transaction.findOneAndUpdate(
      { _id: pending._id, status: 'pending' },
      {
        $set: {
          status: 'completed',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
        },
      },
      { new: true }
    );
    if (!settled) {
      return res.status(409).json({ message: "This payment has already been processed" });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $inc: { creditBalance: settled.creditsAdded }
    });

    logger.info(
      `Credited ${settled.creditsAdded} credits to user ${req.user.id} for order ${razorpay_order_id}`
    );
    res.json({
      message: "Payment verified successfully, credits added.",
      creditsAdded: settled.creditsAdded,
    });
  } catch (error) {
    next(error);
  }
};

// Get History and Balance
export const getBillingHistory = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
    const user = await User.findById(req.user.id).select('creditBalance');
    res.json({ creditBalance: user.creditBalance || 0, transactions });
  } catch (error) {
    next(error);
  }
};
