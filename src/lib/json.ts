/**
 * A JSON value as received from external APIs, storage payloads, or JSON text.
 * Includes undefined so optional record fields stay assignable; upstream data
 * crosses this type exactly once, at the decoding boundary, and everything
 * downstream works with named domain types.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | JsonObject;

/** An open JSON object with string keys. */
export interface JsonObject {
  [key: string]: JsonValue;
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return value instanceof Object && !Array.isArray(value);
}
export function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

/** Decode untrusted JSON text; malformed input yields null. */
export function parseJson(text: string): JsonValue | null {
  try {
    // SAFETY: JSON.parse returns whatever the sender serialized; JsonValue is
    // the widest type a JSON document can have, so nothing is narrowed here.
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}
