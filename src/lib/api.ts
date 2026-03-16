import type { AppState, IntakeQuestion } from "./types";

function ensureDesktop() {
  if (!window.desktop) {
    throw new Error("Desktop bridge is unavailable.");
  }
  return window.desktop;
}

export const api = {
  state: async () => ensureDesktop().appState() as Promise<AppState>,
  registerTemplate: async (_body: unknown) => ({ ok: false }),
  createProject: async (body: unknown) => ensureDesktop().createProject(body),
  createJob: async (body: unknown) => ensureDesktop().createJob(body),
  launchJob: async (jobId: string, _executor = "codex") => ensureDesktop().codex.launchJob(jobId),
  appendQa: async (jobId: string, body: { content: string }) => ensureDesktop().appendJobQa(jobId, body.content),
  jobLogs: async (jobId: string) => {
    try {
      const session = await ensureDesktop().codex.getSession(jobId);
      const parts: string[] = [];
      if (session.agentText.trim()) {
        parts.push(session.agentText.trim());
      }
      if (session.commandOutput.trim()) {
        parts.push(`$ command output\n${session.commandOutput.trim()}`);
      }
      return { log: parts.join("\n\n") };
    } catch {
      return { log: "" };
    }
  },
  jobQuestions: async (jobId: string) => {
    try {
      const session = await ensureDesktop().codex.getSession(jobId);
      if (!session.approvals.length) {
        return { questions: "No pending questions yet." };
      }
      return {
        questions: session.approvals
          .map((approval) => {
            if (approval.method === "item/fileChange/requestApproval") {
              return `File change approval requested${approval.reason ? `: ${approval.reason}` : "."}`;
            }
            return approval.command
              ? `Command approval requested:\n${approval.command}`
              : approval.reason || "Command approval requested.";
          })
          .join("\n\n"),
      };
    } catch {
      return { questions: "No pending questions yet." };
    }
  },
  createUpdateDefinition: async (body: unknown) => ensureDesktop().createUpdateDefinition(body),
  runUpdateDefinition: async (definitionId: string) => ensureDesktop().runUpdateDefinition(definitionId),
  getSettings: async () => {
    const settings = await ensureDesktop().getSettings() as Record<string, unknown>;
    return {
      api_key_set: false,
      executor: "codex",
      ...settings,
    };
  },
  saveSettings: async (body: unknown) => ensureDesktop().saveSettings(body),
  runFinder: async (_body: unknown) => ({
    recipe_id: "codex-finder-placeholder",
    status: "error",
  }),
  finderLog: async (_recipeId: string) => ({
    log: "Finder browser automation is not wired into the Codex-only runtime yet. You can still stage finder workspaces.",
    status: "error",
  }),
  intakeQuestions: async (_body: unknown) => ({ questions: [] as IntakeQuestion[] }),
};
