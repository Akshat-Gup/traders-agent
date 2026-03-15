/// <reference types="vite/client" />

interface DesktopBridge {
  getBackendUrl: () => Promise<string>;
  pickPaths: (options?: {
    mode?: "files" | "folders" | "mixed";
    multiple?: boolean;
    title?: string;
  }) => Promise<string[]>;
  openPath: (path: string) => Promise<string>;
   getBackendLog: () => Promise<string>;
}

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}

export {};
