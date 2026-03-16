/// <reference types="vite/client" />

interface PickPathsOptions {
  mode?: "files" | "folders" | "mixed";
  multiple?: boolean;
  title?: string;
}

interface CodexApproval {
  requestId: number;
  method: string;
  itemId: string;
  threadId: string;
  turnId: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  grantRoot?: string | null;
}

interface CodexSessionSnapshot {
  jobId: string;
  threadId: string | null;
  activeTurnId: string | null;
  codexStatus: string;
  lastEventAt: string | null;
  agentText: string;
  commandOutput: string;
  fileChanges: Array<{ path: string; kind: { type: string; move_path?: string | null }; diff: string }>;
  approvals: CodexApproval[];
  lastError: string | null;
  running: boolean;
}

interface CodexAccountSnapshot {
  account: { type: string; email?: string; planType?: string } | null;
  requiresOpenaiAuth: boolean;
  authMode: string | null;
}

interface DesktopBridge {
  pickPaths: (options?: PickPathsOptions) => Promise<string[]>;
  openPath: (path: string) => Promise<string>;
  getBackendLog: () => Promise<string>;
  getPathForFile: (file: File) => string;
  appState: () => Promise<unknown>;
  createProject: (payload: unknown) => Promise<unknown>;
  createJob: (payload: unknown) => Promise<unknown>;
  listJobOutputs: (jobId: string) => Promise<Array<{
    name: string;
    path: string;
    relativePath: string;
    kind: "file" | "directory";
    size: number;
    modifiedAt: string;
  }>>;
  appendJobQa: (jobId: string, content: string) => Promise<unknown>;
  createUpdateDefinition: (payload: unknown) => Promise<unknown>;
  runUpdateDefinition: (definitionId: string) => Promise<unknown>;
  getSettings: () => Promise<unknown>;
  saveSettings: (payload: unknown) => Promise<unknown>;
  focusTerminal: () => Promise<void>;
  codex: {
    getAccount: () => Promise<CodexAccountSnapshot>;
    login: () => Promise<unknown>;
    launchJob: (jobId: string) => Promise<unknown>;
    getSession: (jobId: string) => Promise<CodexSessionSnapshot>;
    getServerLog: () => Promise<string>;
    respondToApproval: (requestId: number, decision: string) => Promise<{ ok: boolean }>;
    subscribe: (listener: (payload: unknown) => void) => () => void;
  };
}

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}

export {};
