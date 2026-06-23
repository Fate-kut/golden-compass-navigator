/**
 * M-Pesa configuration that switches between sandbox and production
 * based on the MPESA_ENV environment variable.
 */

type MpesaEnvironment = "sandbox" | "production";

function getEnv(): MpesaEnvironment {
  const env = (process.env.MPESA_ENV ?? "sandbox").toLowerCase();
  if (env === "production" || env === "live") return "production";
  return "sandbox";
}

const URLS = {
  sandbox: {
    oauth: "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    stkPush: "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    stkQuery: "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
    b2c: "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
  },
  production: {
    oauth: "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    stkPush: "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    stkQuery: "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query",
    b2c: "https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest",
  },
} as const;

export function getMpesaUrls() {
  return URLS[getEnv()];
}

export function getMpesaEnv(): MpesaEnvironment {
  return getEnv();
}
