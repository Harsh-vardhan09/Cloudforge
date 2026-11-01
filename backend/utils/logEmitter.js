import { EventEmitter } from "events";

/**
 * Node EventEmitter used to bridge pushLog → SSE stream.
 * When an agent POSTs /api/jobs/:id/logs, we emit here.
 * The SSE handler in jobs.controller listens on this emitter.
 */
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(200); // Support many concurrent SSE connections

export default logEmitter;
