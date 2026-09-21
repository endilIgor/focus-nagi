import type { Context } from "hono";
import { z } from "zod";
import { ApiError, malformed, validationError } from "./errors";

export const MAX_BODY_BYTES = 1_048_576;
export const MAX_PAGE_SIZE = 100;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTEGER = /^-?\d+$/;
const PATH_ID = /^\d{1,15}$/;

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const payloadTooLarge = () => new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");

async function readJson(c: Context): Promise<unknown> {
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw payloadTooLarge();
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw payloadTooLarge();
  }
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw malformed();
  }
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  const messages = issues.map((issue) => `${issue.path.map(String).join(".") || "body"} ${issue.message}`);
  return [...new Set(messages)].join("; ");
}

/** Parses and validates a JSON object body; unknown properties are ignored like the original API. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const raw = await readJson(c);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw malformed();
  const result = schema.safeParse(raw);
  if (!result.success) throw validationError(formatIssues(result.error.issues));
  return result.data;
}

const typeError = (expected: string) => ({
  error: (issue: { input?: unknown }) =>
    issue.input === undefined || issue.input === null ? "is required" : `must be ${expected}`,
});

/** Required, non-blank string (checked before trimming, like @NotBlank + @Size). */
export const requiredText = (max: number) =>
  z
    .string(typeError("a string"))
    .refine((value) => value.trim().length > 0, { message: "is required", abort: true })
    .refine((value) => value.length <= max, { message: `must be at most ${max} characters` });

/** Optional text that may be omitted or null. */
export const optionalText = (max: number) =>
  z.string(typeError("a string")).max(max, `must be at most ${max} characters`).nullish();

/** Optional title for partial updates: may be omitted, but not blank when present. */
export const optionalTitle = (max: number) =>
  z
    .string(typeError("a string"))
    .refine((value) => value.trim().length > 0, { message: "must not be blank", abort: true })
    .refine((value) => value.length <= max, { message: `must be at most ${max} characters` })
    .nullish();

export const boundedInt = (min: number, max: number) =>
  z
    .number(typeError("a number"))
    .int("must be an integer")
    .min(min, `must be at least ${min}`)
    .max(max, `must be at most ${max}`);

export const optionalId = () =>
  z
    .number(typeError("a number"))
    .int("must be an integer")
    .min(1, "must be a positive id")
    .max(Number.MAX_SAFE_INTEGER, "is out of range")
    .nullish();

export const isoDate = () =>
  z.string(typeError("a date (yyyy-MM-dd)")).refine(isCalendarDate, { message: "must be a valid date (yyyy-MM-dd)" });

export const enumOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, {
    error: (issue: { input?: unknown }) =>
      issue.input === undefined || issue.input === null ? "is required" : `must be one of ${values.join(", ")}`,
  });

/** Normalises "absent" to null so every SQL function argument is always sent explicitly. */
export const orNull = <T>(value: T | null | undefined): T | null => (value === undefined ? null : value);

// ---------- query string & path parameters ----------

export function pathId(c: Context, name = "id"): number {
  const raw = c.req.param(name) ?? "";
  if (!PATH_ID.test(raw)) throw malformed();
  return Number(raw);
}

export function intQuery(c: Context, name: string, fallback: number): number {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return fallback;
  if (!INTEGER.test(raw) || raw.length > 10) throw malformed();
  return Number(raw);
}

export function pageQuery(c: Context, defaultSize: number): { p_page: number; p_size: number } {
  const page = intQuery(c, "page", 0);
  const size = intQuery(c, "size", defaultSize);
  return { p_page: Math.max(page, 0), p_size: Math.min(Math.max(size, 1), MAX_PAGE_SIZE) };
}

export function idQuery(c: Context, name: string): number | null {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return null;
  if (!PATH_ID.test(raw)) throw malformed();
  return Number(raw);
}

export function enumQuery<T extends string>(c: Context, name: string, values: readonly T[]): T | null {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return null;
  if (!(values as readonly string[]).includes(raw)) throw malformed();
  return raw as T;
}

export function boolQuery(c: Context, name: string): boolean | null {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return null;
  const normalized = raw.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw malformed();
}

export function dateQuery(c: Context, name: string, required = false): string | null {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") {
    if (required) throw validationError(`${name} is required`);
    return null;
  }
  if (!isCalendarDate(raw)) throw malformed();
  return raw;
}

export function textQuery(c: Context, name: string, max: number): string | null {
  const raw = c.req.query(name);
  if (raw === undefined || raw.trim() === "") return null;
  if (raw.length > max) throw validationError(`${name} must be at most ${max} characters`);
  return raw;
}
