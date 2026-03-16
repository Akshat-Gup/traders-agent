import type { AppState, IntakeQuestion } from "./types";

let cachedBaseUrl: string | null = null;

async function baseUrl(): Promise<string> {
  if (!cachedBaseUrl) {
    if (window.desktop?.getBackendUrl) {
      cachedBaseUrl = await window.desktop.getBackendUrl();
    } else {
      cachedBaseUrl = "http://127.0.0.1:8765";
    }
  }
  return cachedBaseUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${await baseUrl()}${path}`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      },
      ...init
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Request failed with ${response.status}`);
    }
    return response.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out — is the backend running?");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  state: () => request<AppState>("/app-state"),
  registerTemplate: (body: unknown) =>
    request("/templates/register", { method: "POST", body: JSON.stringify(body) }),
  createProject: (body: unknown) =>
    request("/projects", { method: "POST", body: JSON.stringify(body) }),
  createJob: (body: unknown) =>
    request("/jobs", { method: "POST", body: JSON.stringify(body) }),
  launchJob: (jobId: string, executor = "codex") =>
    request(`/jobs/${jobId}/launch`, { method: "POST", body: JSON.stringify({ executor }) }),
  appendQa: (jobId: string, body: unknown) =>
    request(`/jobs/${jobId}/qa`, { method: "POST", body: JSON.stringify(body) }),
  jobLogs: (jobId: string) =>
    request<{ log: string }>(`/jobs/${jobId}/logs`),
  jobQuestions: (jobId: string) =>
    request<{ questions: string }>(`/jobs/${jobId}/questions`),
  createUpdateDefinition: (body: unknown) =>
    request("/update-definitions", { method: "POST", body: JSON.stringify(body) }),
  runUpdateDefinition: (definitionId: string) =>
    request(`/update-definitions/${definitionId}/run`, { method: "POST" }),
  getSettings: () =>
    request<{ api_key_set: boolean; executor: string }>("/settings"),
  saveSettings: (body: unknown) =>
    request("/settings", { method: "POST", body: JSON.stringify(body) }),
  runFinder: (body: unknown) =>
    request<{ recipe_id: string; status: string }>("/finder/run", { method: "POST", body: JSON.stringify(body) }),
  finderLog: (recipeId: string) =>
    request<{ log: string; status: string }>(`/finder/${recipeId}/log`),
  intakeQuestions: (body: unknown) =>
    request<{ questions: IntakeQuestion[] }>("/intake/questions", { method: "POST", body: JSON.stringify(body) }),
};
