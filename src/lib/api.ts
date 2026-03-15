import type { AppState } from "./types";

let cachedBaseUrl: string | null = null;

async function baseUrl(): Promise<string> {
  if (!cachedBaseUrl) {
    cachedBaseUrl = await window.desktop.getBackendUrl();
  }
  return cachedBaseUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${await baseUrl()}${path}`, {
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
}

export const api = {
  state: () => request<AppState>("/app-state"),
  registerTemplate: (body: unknown) =>
    request("/templates/register", { method: "POST", body: JSON.stringify(body) }),
  createProject: (body: unknown) =>
    request("/projects", { method: "POST", body: JSON.stringify(body) }),
  createJob: (body: unknown) =>
    request("/jobs", { method: "POST", body: JSON.stringify(body) }),
  launchJob: (jobId: string) =>
    request(`/jobs/${jobId}/launch`, { method: "POST" }),
  appendQa: (jobId: string, body: unknown) =>
    request(`/jobs/${jobId}/qa`, { method: "POST", body: JSON.stringify(body) }),
  createUpdateDefinition: (body: unknown) =>
    request("/update-definitions", { method: "POST", body: JSON.stringify(body) }),
  runUpdateDefinition: (definitionId: string) =>
    request(`/update-definitions/${definitionId}/run`, { method: "POST" })
};
