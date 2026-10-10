/**
 * Pure consent gate for a future OB integration. No IO, no default opt-in.
 * Consent must be verified by the authenticated backend, not the WebView.
 */
export const OMBRE_ALLOWED_SOURCES = Object.freeze(["diary", "memory"]);

/** Unknown or malformed settings always fail closed. */
export function canSyncOmbre(type, settings) {
  if (!OMBRE_ALLOWED_SOURCES.includes(type)) return false;
  if (!settings || settings.enabled !== true) return false;
  if (!Array.isArray(settings.sources)) return false;
  return settings.sources.includes(type);
}

/** Compute a sync decision without side effects or leaking record contents. */
export function planOmbreSync({ type, settings, hash, previousLink } = {}) {
  if (!canSyncOmbre(type, settings)) return Object.freeze({ action: "skip", reason: "not_authorized" });
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return Object.freeze({ action: "skip", reason: "invalid_hash" });
  if (previousLink?.content_hash === hash && previousLink?.sync_status === "synced") {
    return Object.freeze({ action: "skip", reason: "unchanged" });
  }
  return Object.freeze({ action: "queue", reason: previousLink ? "changed_or_retry" : "new" });
}
