// The domain passkeys are bound to (WebAuthn's relying party id). It defaults
// to the auth origin's host. PASSKEY_RP_ID overrides it, so after a move to a
// new domain the old one can stay the passkey domain and existing passkeys
// keep working through WebAuthn related origins (spec: "Passkey domain").
export function passkeyRpID(baseURL: string, override?: string): string {
  return override ?? new URL(baseURL).hostname;
}
