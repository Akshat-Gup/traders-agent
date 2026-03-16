const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

class CodexAppServerClient extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.rl = null;
    this.started = false;
    this.initialized = false;
    this.nextId = 1;
    this.pending = new Map();
    this.log = "";
    this.startPromise = null;
  }

  appendLog(text) {
    this.log += text;
    if (this.log.length > 50000) {
      this.log = this.log.slice(-50000);
    }
  }

  getLog() {
    return this.log;
  }

  async start() {
    if (this.initialized) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise((resolve, reject) => {
      this.proc = spawn("codex", ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.once("error", (error) => {
        this.appendLog(`${error.stack || error.message}\n`);
        reject(error);
      });

      this.proc.stderr?.on("data", (chunk) => {
        this.appendLog(chunk.toString());
      });

      this.proc.once("spawn", () => {
        this.started = true;
        this.rl = readline.createInterface({ input: this.proc.stdout });
        this.rl.on("line", (line) => this.handleLine(line));
        this.proc.once("exit", (code, signal) => {
          const message = `codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"})\n`;
          this.appendLog(message);
          this.started = false;
          this.initialized = false;
          const error = new Error(message.trim());
          for (const [, pending] of this.pending) {
            pending.reject(error);
          }
          this.pending.clear();
          this.emit("exit", { code, signal });
        });
        resolve();
      });
    })
      .then(async () => {
        await this.initializeAfterSpawn();
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async initializeAfterSpawn() {
    if (this.initialized) return;
    await this._rawRequest("initialize", {
      clientInfo: {
        name: "traders_desktop",
        title: "Traders",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

  async _rawRequest(method, params = {}) {
    if (!this.proc?.stdin) {
      throw new Error("codex app-server is not running");
    }
    const id = this.nextId++;
    const payload = { method, id, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(payload);
    });
  }

  async rawRequest(method, params = {}) {
    await this.start();
    return this._rawRequest(method, params);
  }

  async request(method, params = {}) {
    return this.rawRequest(method, params);
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  send(payload) {
    if (!this.proc?.stdin) {
      throw new Error("codex app-server is not running");
    }
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  handleLine(line) {
    if (!line.trim()) return;
    this.appendLog(`${line}\n`);

    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.emit("protocolError", { line, error });
      return;
    }

    if (typeof message.id !== "undefined" && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || "Codex app-server request failed");
        error.code = message.error.code;
        error.details = message.error;
        pending.reject(error);
        return;
      }
      pending.resolve(message.result ?? {});
      return;
    }

    if (typeof message.id !== "undefined" && message.method) {
      this.emit("serverRequest", message);
      return;
    }

    if (message.method) {
      this.emit("notification", message);
    }
  }

  respond(id, result) {
    this.send({ id, result });
  }

  respondError(id, code, message) {
    this.send({
      id,
      error: {
        code,
        message,
      },
    });
  }

  stop() {
    this.rl?.close();
    this.proc?.kill();
    this.proc = null;
    this.rl = null;
    this.started = false;
    this.initialized = false;
  }
}

module.exports = {
  CodexAppServerClient,
};
