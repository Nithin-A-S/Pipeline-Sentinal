/**
 * Thin fetch wrapper around the future FastAPI backend.
 *
 * Nothing in the app calls `fetch` directly — every network call goes through
 * this client so the base URL, headers, and error handling live in one place.
 * Today no `Api*Service` implementation is wired up (see each service file),
 * but this exists so that swap-in requires no changes to components or hooks.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  /** The server's own explanation: FastAPI's `detail`, or this app's proxy `error`. */
  detail: string | null;
  constructor(message: string, status: number, detail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function errorDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown; error?: unknown };
    const d = body.detail ?? body.error;
    return typeof d === "string" ? d : d ? JSON.stringify(d) : null;
  } catch {
    return null;
  }
}

const REQUEST_TIMEOUT_MS = 110_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError(
      "NEXT_PUBLIC_API_URL is not configured — the live backend is not connected yet.",
      503,
    );
  }
  // Genie can take a while to query the data, but never hang the chat forever.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed with ${res.status}`, res.status, await errorDetail(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};
