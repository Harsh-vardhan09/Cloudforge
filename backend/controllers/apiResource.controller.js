import mongoose from 'mongoose';
import ApiResource from '../models/apiResource.model.js';
import User from '../models/user.model.js';
import ApiUsage from '../models/apiUsage.model.js';
import { encrypt, decrypt } from '../utils/cipher.js';
import axios from 'axios';
import { logger } from '../utils/logger.js';

export const createResource = async (req, res, next) => {
  try {
    const { name, provider, customProviderName, apiKey, hourlyRate, tokenRate, billingCycle } = req.body;
    
    const resource = await ApiResource.create({
      host: req.user.id,
      name,
      provider,
      customProviderName: provider === 'custom' ? customProviderName : undefined,
      encryptedKey: encrypt(apiKey),
      hourlyRate: hourlyRate || 0.1,
      tokenRate: tokenRate || 1.0,
      billingCycle: billingCycle || 'hourly'
    });

    res.status(201).json({ message: "API Resource listed successfully", resourceId: resource._id });
  } catch (error) {
    next(error);
  }
};

export const listResources = async (req, res, next) => {
  try {
    const resources = await ApiResource.find({ status: 'active' })
      .populate('host', 'name')
      .select('-encryptedKey');
    res.json(resources);
  } catch (error) {
    next(error);
  }
};

export const getRentedResources = async (req, res, next) => {
  try {
    const resources = await ApiResource.find({
      'rentals.buyer': req.user.id,
      'rentals.expiresAt': { $gt: new Date() }
    }).populate('host', 'name').select('-encryptedKey');

    const formatted = resources.map(res => {
      const rental = res.rentals.find(r => r.buyer.toString() === req.user.id && r.expiresAt > new Date());
      return {
        ...res.toObject(),
        activeRental: rental
      };
    });

    // Sort by expiresAt ASC (expiring soonest first)
    formatted.sort((a, b) => new Date(a.activeRental.expiresAt) - new Date(b.activeRental.expiresAt));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};

export const proxyRequest = async (req, res, next) => {
  try {
    const { resourceId } = req.params;
    const body = req.body;

    const resource = await ApiResource.findById(resourceId);
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    const rental = resource.rentals.find(r => r.buyer.toString() === req.user.id && r.expiresAt > new Date());
    if (!rental) return res.status(403).json({ message: "No active subscription for this resource" });

    const realApiKey = decrypt(resource.encryptedKey);
    let targetUrl = '';
    let headers = { 'Content-Type': 'application/json' };

    if (!['openai', 'anthropic'].includes(resource.provider)) {
      return res.status(501).json({
        message: `Proxying is not implemented for provider '${resource.provider}'`,
      });
    }

    switch (resource.provider) {
      case 'openai':
        targetUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${realApiKey}`;
        break;
      case 'anthropic':
        targetUrl = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = realApiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
    }

    logger.info(`Proxying request for user ${req.user.id} to ${resource.provider} via resource ${resourceId}`);
    const response = await axios.post(targetUrl, body, { headers });
    
    // --- Post-Response Usage Billing ---
    const usage = response.data.usage;
    if (usage) {
      let tokens = { input: 0, output: 0, total: 0 };
      
      if (resource.provider === 'openai') {
        tokens.input = usage.prompt_tokens;
        tokens.output = usage.completion_tokens;
        tokens.total = usage.total_tokens;
      } else if (resource.provider === 'anthropic') {
        tokens.input = usage.input_tokens;
        tokens.output = usage.output_tokens;
        tokens.total = usage.input_tokens + usage.output_tokens;
      }

      const cost = (tokens.total / 1000000) * (resource.tokenRate || 1.0);
      
      // Deduct from user balance
      await User.findByIdAndUpdate(req.user.id, { $inc: { creditBalance: -cost } });
      
      // Record usage
      await ApiUsage.create({
        resource: resourceId,
        buyer: req.user.id,
        provider: resource.provider,
        tokens,
        cost
      });
      
      logger.info(`Billed user ${req.user.id} for ${tokens.total} tokens: $${cost.toFixed(6)}`);
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error(`Proxy Request Failed: ${error.response?.data?.error?.message || error.message}`);
    res.status(error.response?.status || 500).json(error.response?.data || { message: "Proxying failed" });
  }
};

export const rentResource = async (req, res, next) => {
  try {
    const { resourceId, hours } = req.body; // Changed from days to hours
    const resource = await ApiResource.findById(resourceId);
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    // A negative or fractional duration would invert the cost and credit the renter.
    const rentalHours = Number(hours ?? 1);
    if (!Number.isInteger(rentalHours) || rentalHours < 1) {
      return res.status(400).json({ message: "Rental duration must be a whole number of hours" });
    }

    // Calculate cost based on billing cycle (mostly hourly now)
    const rate = resource.billingCycle === 'daily' ? (resource.hourlyRate * 24) : resource.hourlyRate;
    const totalCost = rate * rentalHours;

    // Charge conditionally and atomically so concurrent rentals cannot overdraw.
    const charged = await User.findOneAndUpdate(
      { _id: req.user.id, creditBalance: { $gte: totalCost } },
      { $inc: { creditBalance: -totalCost } },
      { new: true }
    );
    if (!charged) return res.status(400).json({ message: `Insufficient balance` });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + rentalHours);
    try {
      resource.rentals.push({ buyer: req.user.id, expiresAt });
      await resource.save();
    } catch (error) {
      // Never keep the money if the rental itself could not be recorded.
      await User.findByIdAndUpdate(req.user.id, { $inc: { creditBalance: totalCost } });
      throw error;
    }

    res.json({ message: `Successfully rented for ${rentalHours} hour(s)`, expiresAt });
  } catch (error) {
    next(error);
  }
};

export const updateResource = async (req, res, next) => {
  try {
    const { resourceId } = req.params;
    const { name, apiKey, hourlyRate, tokenRate, status, billingCycle } = req.body;
    const update = {};
    if (name) update.name = name;
    if (apiKey) update.encryptedKey = encrypt(apiKey);
    if (hourlyRate) update.hourlyRate = parseFloat(hourlyRate);
    if (tokenRate) update.tokenRate = parseFloat(tokenRate);
    if (billingCycle) update.billingCycle = billingCycle;
    if (status) update.status = status;

    const resource = await ApiResource.findOneAndUpdate(
      { _id: resourceId, host: req.user.id },
      { $set: update },
      { new: true }
    );
    res.json({ message: "Resource updated successfully", resource });
  } catch (error) {
    next(error);
  }
};

export const deleteResource = async (req, res, next) => {
  try {
    const { resourceId } = req.params;
    await ApiResource.findOneAndDelete({ _id: resourceId, host: req.user.id });
    res.json({ message: "Resource deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const getUsageStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Aggregate past 7 days of usage
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const stats = await ApiUsage.aggregate([
      {
        $match: {
          buyer: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalTokens: { $sum: "$tokens.total" },
          totalCost: { $sum: "$cost" },
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Format for Recharts
    const formatted = stats.map(s => ({
      date: s._id,
      tokens: s.totalTokens,
      cost: s.totalCost
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};
