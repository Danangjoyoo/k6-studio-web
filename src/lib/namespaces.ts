export const DEFAULT_NAMESPACE = "default";
export const NAMESPACE_MARKER = ".namespace";

const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export class NamespaceError extends Error {
  constructor(message = "Invalid namespace") {
    super(message);
    this.name = "NamespaceError";
  }
}

export function normalizeNamespace(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_NAMESPACE;
  if (typeof value !== "string") throw new NamespaceError();

  const namespace = value.trim();
  if (!namespace) return DEFAULT_NAMESPACE;

  if (
    !NAMESPACE_PATTERN.test(namespace) ||
    namespace.includes("/") ||
    namespace.includes("\\") ||
    namespace === "." ||
    namespace === ".." ||
    namespace.includes("..")
  ) {
    throw new NamespaceError();
  }

  return namespace;
}

export function getNamespaceFromRequest(request: Request): string {
  return normalizeNamespace(new URL(request.url).searchParams.get("namespace"));
}

export function toNamespacedKey(
  namespaceValue: unknown,
  relativePath: string
): string {
  const namespace = normalizeNamespace(namespaceValue);
  const path = relativePath.split("/").filter(Boolean).join("/");
  return path ? `${namespace}/${path}` : `${namespace}/`;
}

export function stripNamespacePrefix(
  namespaceValue: unknown,
  key: string
): string | null {
  const namespace = normalizeNamespace(namespaceValue);
  const prefix = `${namespace}/`;
  if (!key.startsWith(prefix)) return null;
  return key.slice(prefix.length);
}

export function namespacePrefix(namespaceValue: unknown): string {
  return `${normalizeNamespace(namespaceValue)}/`;
}

export function NAMESPACE_MARKER_OBJECT(namespaceValue: unknown): string {
  return `${normalizeNamespace(namespaceValue)}/${NAMESPACE_MARKER}`;
}
