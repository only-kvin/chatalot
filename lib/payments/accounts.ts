import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { MERCHANT_ID_RE, MERCHANT_KEY_RE, PASSPHRASE_RE } from "./payfast";
import type { PaymentAccountSecrets } from "./types";

// A business's own gateway account: what the owner types in, how it's
// stored (key and passphrase encrypted with ENCRYPTION_KEY) and how the
// server loads it back. Decrypted values never leave the server.

export const payfastCredentialsSchema = z.object({
  mode: z.enum(["sandbox", "live"]),
  merchantId: z.string().trim().regex(MERCHANT_ID_RE, "Merchant ID is the number on your PayFast dashboard"),
  merchantKey: z.string().trim().regex(MERCHANT_KEY_RE, "Merchant key is the letters and numbers under your Merchant ID"),
  passphrase: z
    .string()
    .trim()
    .regex(PASSPHRASE_RE, "Use 8–64 letters, numbers, dots, dashes or underscores (set the same one in PayFast)"),
});
export type PayfastCredentials = z.infer<typeof payfastCredentialsSchema>;

// The columns written to payment_accounts (service role only).
export function encryptPayfastCredentials(c: PayfastCredentials) {
  return {
    provider: "payfast" as const,
    mode: c.mode,
    merchant_id: c.merchantId,
    merchant_key_encrypted: encrypt(c.merchantKey),
    passphrase_encrypted: encrypt(c.passphrase),
  };
}

type AccountRow = {
  id: string;
  provider: "payfast";
  mode: "sandbox" | "live";
  merchant_id: string;
  merchant_key_encrypted: string;
  passphrase_encrypted: string;
  status: "unverified" | "active" | "disabled";
};

export type LoadedAccount = { id: string; status: AccountRow["status"]; secrets: PaymentAccountSecrets };

// Needs the service-role client: members can't read the encrypted columns.
export async function loadPaymentAccount(admin: SupabaseClient, tenantId: string): Promise<LoadedAccount | null> {
  const { data, error } = await admin
    .from("payment_accounts")
    .select("id, provider, mode, merchant_id, merchant_key_encrypted, passphrase_encrypted, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "payfast")
    .maybeSingle<AccountRow>();
  if (error || !data) return null;
  return {
    id: data.id,
    status: data.status,
    secrets: {
      provider: data.provider,
      mode: data.mode,
      merchantId: data.merchant_id,
      merchantKey: decrypt(data.merchant_key_encrypted),
      passphrase: decrypt(data.passphrase_encrypted),
    },
  };
}
