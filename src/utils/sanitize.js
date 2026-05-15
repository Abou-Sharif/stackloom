/**
 * Input Sanitization Utilities
 * Production-ready helpers for preventing XSS, injection, data pollution
 */

/**
 * Strip HTML tags from text
 */
export function sanitizeText(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>?/gm, "").trim();
}

/**
 * Sanitize HTML - allow only safe whitelist
 */
export function sanitizeHTML(value) {
  if (typeof value !== "string") return value;
  
  // Remove scripts, event handlers, javascript: URLs
  const dangerous = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /on\w+="[^"]*"/gi,
    /javascript:/gi,
    /data:/gi,
  ];
  
  let cleaned = value;
  dangerous.forEach(pattern => {
    cleaned = cleaned.replace(pattern, "");
  });
  
  return cleaned.trim();
}

/**
 * Normalize email to lowercase, trim whitespace
 */
export function sanitizeEmail(value) {
  if (typeof value !== "string") return value;
  return value.toLowerCase().trim();
}

/**
 * Validate and normalize URL
 */
export function sanitizeUrl(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  // Ensure http/https protocol
  if (!/^https?:\/\//.test(trimmed)) {
    return "https://" + trimmed;
  }
  return trimmed;
}

/**
 * Phone sanitization — E.164 format (removes all non-digit except leading +)
 */
export function sanitizePhone(value) {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/[^+0-9]/g, "");
  // Already starts with + and country code?
  if (!/^[+]?[1-9]/.test(cleaned)) {
    // Remove leading zeros and ensure proper format
    return cleaned.replace(/^0+/, "");
  }
  return cleaned;
}

/**
 * Number sanitization — parseFloat with sanitization
 */
export function sanitizeNumber(value) {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Boolean sanitization
 */
export function sanitizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return Boolean(value);
}

/**
 * Date sanitization — return ISO string
 */
export function sanitizeDate(value) {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  return null;
}

/**
 * Array sanitization — remove empty, null, duplicate entries
 */
export function sanitizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(v => v != null && v !== "" && typeof v === "string" ? v.trim() : v))];
}

/**
 * Full form data sanitization based on field config
 */
export function sanitizeFormData(data, fieldConfigs) {
  const sanitized = {};
  
  for (const field of fieldConfigs) {
    const value = data[field.name];
    
    if (value === undefined || value === null) {
      sanitized[field.name] = field.default || getDefaultValue(field.type);
      continue;
    }
    
    const sanitizer = SANITIZER_MAP[field.type] || ((v) => v);
    sanitized[field.name] = sanitizer(value);
  }
  
  return sanitized;
}

function getDefaultValue(type) {
  const defaults = {
    string: "",
    text: "",
    email: "",
    number: 0,
    boolean: false,
    date: null,
    array: [],
  };
  return defaults[type] ?? null;
}

const SANITIZER_MAP = {
  text: sanitizeText,
  textarea: sanitizeText,
  email: sanitizeEmail,
  password: (v) => v, // Don't sanitize passwords
  number: sanitizeNumber,
  tel: sanitizePhone,
  url: sanitizeUrl,
  date: sanitizeDate,
  "datetime-local": sanitizeDate,
  time: (v) => String(v),
  color: (v) => String(v).toUpperCase(),
  range: sanitizeNumber,
  boolean: sanitizeBoolean,
  file: (v) => v,
};

/**
 * Escape HTML entities for safe rendering
 */
export function escapeHtml(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validate phone number format
 */
export function isValidPhone(value) {
  const cleaned = sanitizePhone(value);
  return /^[+]?[1-9]\d{1,14}$/.test(cleaned);
}

/**
 * Validate email format
 */
export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate URL format
 */
export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\/.+\..+/.test(value);
}

// Export sanitizer map for code generation
export { SANITIZER_MAP };

