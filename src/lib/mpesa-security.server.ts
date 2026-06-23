// Safaricom known IP ranges for callback verification
// In production, maintain an updated list from Safaricom documentation
const SAFARICOM_IPS = new Set([
  // Safaricom sandbox IPs
  "196.201.214.200",
  "196.201.214.206",
  "196.201.214.207",
  "196.201.214.208",
  // Production IPs (update from Safaricom docs)
  "196.201.214.0/24",
]);

/**
 * Verify that a callback request originates from Safaricom.
 * In production, validate against known Safaricom IP ranges.
 * Returns true if the request appears legitimate.
 */
export function verifySafaricomOrigin(request: Request): boolean {
  // In development/sandbox mode, allow all callbacks
  const mpesaEnv = process.env.MPESA_ENV ?? "sandbox";
  if (mpesaEnv === "sandbox") return true;

  // In production, check the source IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const sourceIp = realIp || forwardedFor?.split(",")[0]?.trim() || "";

  if (!sourceIp) return false;

  // Check if IP is in the Safaricom whitelist
  for (const allowed of SAFARICOM_IPS) {
    if (allowed.includes("/")) {
      // CIDR range check (simplified - checks prefix)
      const prefix = allowed.split("/")[0].split(".").slice(0, 3).join(".");
      if (sourceIp.startsWith(prefix)) return true;
    } else {
      if (sourceIp === allowed) return true;
    }
  }

  return false;
}
