import { FingerprintPattern, KeyRound, ScanFace, type LucideProps } from "lucide-react";
import type { PasskeyKind } from "@/lib/passkey-device";

// Apple's Face ID glyph isn't licensed for the web; ScanFace stands in.
export function PasskeyIcon({ kind, ...props }: { kind: PasskeyKind } & LucideProps) {
  const Icon = kind === "face-id" ? ScanFace : kind === "fingerprint" ? FingerprintPattern : KeyRound;
  return <Icon aria-hidden {...props} />;
}
