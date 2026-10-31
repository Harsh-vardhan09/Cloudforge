import mongoose from "mongoose";
import { logger } from "./utils/logger.js";

const Dbconnect = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/gpushare";
    const connect = await mongoose.connect(mongoUri);
    if (connect) {
      logger.info(`💾 MongoDB connected: ${connect.connection.host}`);
    }
  } catch (error) {
    logger.error(`❌ DB connection error: ${error.message}`);
    // Don't exit process in dev, just log it
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};

export default Dbconnect;