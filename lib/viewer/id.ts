export function createId(prefix = "id") {
  // Prefer a standards-based UUID when available (modern browsers).
  const c = globalThis.crypto as Crypto | undefined;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  // Fallback: reasonably unique ID for older environments.
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

