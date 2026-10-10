/**
 * Pure, opt-in preparation helpers for a future Ombre Brain bridge.
 * This module has no network, DB, or side effects and is not wired into worker.js.
 * Never send records to OB without an explicit user-controlled consent gate.
 */
const SOURCE_TYPES = new Set(["diary", "memory"]);
const MAX_TEXT = 20000;

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " is required");
  return value.trim();
}

export function prepareOmbreSource(type, record) {
  if (!SOURCE_TYPES.has(type)) throw new TypeError("Unsupported OB source type");
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError("Invalid record");
  const id = requiredString(record.id, "id");
  const content = requiredString(record.content, "content");
  if (content.length > MAX_TEXT) throw new RangeError("Content exceeds OB adapter limit");
  const date = type === "diary" ? requiredString(record.date ?? record.event_date, "date") : String(record.created_at ?? "");
  if (type === "diary" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError("Invalid diary date");
  const title = type === "diary" ? String(record.title ?? "日记") : "长期记忆";
  return Object.freeze({
    source_type: type,
    source_id: id,
    source_updated_at: String(record.updated_at ?? record.created_at ?? ""),
    date,
    title,
    content,
    author: String(record.author ?? "")
  });
}

export async function fingerprintOmbreSource(source, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("Web Crypto SHA-256 unavailable");
  const stable = JSON.stringify([source.source_type, source.source_id, source.date, source.title, source.content, source.author]);
  const bytes = new TextEncoder().encode(stable);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}

/** A hash match means there is nothing new to send; no OB call is made here. */
export function needsOmbreSync(sourceHash, previousLink) {
  if (!previousLink) return true;
  return previousLink.content_hash !== sourceHash || previousLink.sync_status !== "synced";
}

/** Records stay immutable and sorted by original event date; never invent events. */
export function buildRiverEntries(dailybook = [], diary = [], includeDiary = false) {
  const entries = [];
  for (const record of dailybook) {
    if (!record?.id || !record?.date) continue;
    entries.push({ id: String(record.id), source: "dailybook", date: String(record.date), title: String(record.title ?? ""), content: String(record.content ?? ""), original: record });
  }
  if (includeDiary) for (const record of diary) {
    if (!record?.id || !record?.date) continue;
    entries.push({ id: String(record.id), source: "diary", date: String(record.date), title: String(record.title ?? ""), content: String(record.content ?? ""), original: record });
  }
  return entries.sort((a,b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
}
