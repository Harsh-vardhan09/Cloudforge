import net from "net";

/**
 * Validation for the agent address a GPU host registers for itself.
 *
 * The backend makes server-side requests to this address and returns the agent's
 * response to the caller, so an unvalidated value is a request-forgery primitive:
 * a host could point it at cloud metadata or at a service only the backend can
 * reach. Private LAN ranges stay allowed — hosts legitimately share GPUs from
 * home networks — but addresses with no legitimate agent use are rejected.
 */

const LOOPBACK_ALLOWED = () => process.env.ALLOW_LOOPBACK_AGENT_IPS === "true";

/** Strip the IPv4-mapped IPv6 prefix Express reports for IPv4 clients. */
export const normalizeIp = (value) =>
  typeof value === "string" ? value.trim().replace(/^::ffff:/i, "") : "";

/**
 * @returns {string|null} why the address is unusable, or null if it is allowed.
 */
export const describeDisallowedAgentIp = (value) => {
  const ip = normalizeIp(value);
  const version = net.isIP(ip);
  if (!version) return "must be a plain IPv4 or IPv6 address";

  if (version === 4) {
    const octets = ip.split(".").map(Number);
    if (octets[0] === 0) return "must not be an unspecified address";
    if (octets[0] === 127 && !LOOPBACK_ALLOWED()) return "must not be a loopback address";
    if (octets[0] === 169 && octets[1] === 254) return "must not be a link-local address";
    if (octets[0] >= 224) return "must not be a multicast or broadcast address";
    return null;
  }

  const lower = ip.toLowerCase();
  if (lower === "::") return "must not be an unspecified address";
  if (lower === "::1" && !LOOPBACK_ALLOWED()) return "must not be a loopback address";
  if (/^fe[89ab]/.test(lower)) return "must not be a link-local address";
  if (/^ff/.test(lower)) return "must not be a multicast address";
  return null;
};

export const isAllowedAgentIp = (value) => describeDisallowedAgentIp(value) === null;

/** Agent ports must be a real, non-privileged TCP port. */
export const isAllowedAgentPort = (value) => {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
};
