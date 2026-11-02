import Razorpay from 'razorpay';
import crypto from 'crypto';
import User from '../models/user.model.js';
import Transaction from '../models/transaction.model.js';
import { logger } from '../utils/logger.js';

let _rzp = null;
const getPaymentMode = () =>
  process.env.NODE_ENV === 'development' && (process.env.PAYMENT_MODE || 'demo') === 'demo'
    ? 'demo'
    : 'razorpay';

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay credentials are not configured");
    error.status = 503;
    throw error;
  }
  if (!_rzp) {
    _rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _rzp;
};

// Create Order (Purchasing Credits)
export const createOrder = async (req, res) => {
  try {
    const amount = Number(req.body?.amount); // Amount in INR
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Valid amount in INR is required" });
    }

    // For simplicity, 1 INR = 1 Credit
    const amountInINR = Math.round(amount * 100) / 100;
    const creditsToReceive = amountInINR;
    const amountInPaise = Math.round(amountInINR * 100);

    if (getPaymentMode() === 'demo') {
      const demoOrderId = `demo_order_${crypto.randomUUID()}`;
      await Transaction.create({
        user: req.user.id,
        amount: amountInINR,
        creditsAdded: creditsToReceive,
        type: 'deposit',
        status: 'pending',
        paymentProvider: 'demo',
        demoOrderId,
      });

      return res.json({
        id: demoOrderId,
        amount: amountInPaise,
        currency: 'INR',
        creditsToReceive,
        mode: 'demo',
      });
    }

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
      paymentProvider: 'razorpay',
      razorpayOrderId: order.id,
    });

    res.json({
      ...order,
      creditsToReceive,
      keyId: process.env.RAZORPAY_KEY_ID,
      mode: 'razorpay',
    });
  } catch (error) {
    const statusCode = error.statusCode || error.status || error.error?.statusCode;
    const authenticationFailed =
      statusCode === 401 ||
      error.error?.code === 'BAD_REQUEST_ERROR' &&
        error.error?.description === 'Authentication failed';

    if (authenticationFailed) {
      logger.error('Razorpay rejected the configured server credentials (401)');
      return res.status(503).json({
        message: 'Razorpay rejected the server credentials. Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are a matching pair in the root .env, then restart the backend.',
      });
    }

    if (error.status === 503) {
      logger.error('Razorpay order creation unavailable: credentials are not configured');
      return res.status(503).json({ message: error.message });
    }

    logger.error(`Razorpay order creation failed (status ${statusCode || 'unknown'})`);
    return res.status(502).json({ message: 'Could not create a Razorpay order. Check the payment provider configuration and try again.' });
  }
};

// Verify Payment
export const verifyPayment = async (req, res, next) => {
  try {
    if (getPaymentMode() === 'demo') {
      const { demoOrderId } = req.body;
      if (typeof demoOrderId !== 'string' || !demoOrderId.startsWith('demo_order_')) {
        return res.status(400).json({ message: 'A valid demo payment order is required' });
      }

      const settled = await Transaction.findOneAndUpdate(
        {
          demoOrderId,
          user: req.user.id,
          type: 'deposit',
          paymentProvider: 'demo',
          status: 'pending',
        },
        {
          $set: {
            status: 'completed',
            demoPaymentId: `demo_payment_${crypto.randomUUID()}`,
          },
        },
        { new: true }
      );
      if (!settled) {
        return res.status(404).json({ message: 'No pending demo payment found for this account' });
      }

      await User.findByIdAndUpdate(req.user.id, {
        $inc: { creditBalance: settled.creditsAdded },
      });

      logger.info(`Added ${settled.creditsAdded} demo credits to user ${req.user.id}`);
      return res.json({
        message: 'Demo payment completed. No real money was charged.',
        creditsAdded: settled.creditsAdded,
        paymentMode: 'demo',
      });
    }

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
    res.json({
      creditBalance: user.creditBalance || 0,
      transactions,
      paymentMode: getPaymentMode(),
    });
  } catch (error) {
    next(error);
  }
};
