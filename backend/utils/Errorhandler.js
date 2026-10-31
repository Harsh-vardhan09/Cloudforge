import { logger } from "./logger.js";
import util from 'util';

const ErrorHandler = (err, req, res, next) => {
  const errorMessage = err?.stack || err?.message || err;
  logger.error(typeof errorMessage === 'object' ? util.inspect(errorMessage, { depth: null }) : errorMessage);
  
  res.status(err?.status || 500).json({
    success: false,
    message: err?.message || "Internal server error",
    stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
  });
};

export default ErrorHandler;