import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { Snapshot } from "./types";

export interface StateStore {
  readonly kind: string;
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
}

/** Upstash Redis over its REST API — survives Render restarts and redeploys. */
class UpstashStore implements StateStore {
  readonly kind = "Upstash Redis";

  private async command(args: string[]): Promise<unknown> {
    const res = await fetch(config.state.upstashUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.state.upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Upstash ${args[0]} failed: HTTP ${res.status} ${json.error ?? ""}`);
    }
    return json.result;
  }

  async load(): Promise<Snapshot | null> {
    const raw = await this.command(["GET", config.state.key]);
    return typeof raw === "string" ? (JSON.parse(raw) as Snapshot) : null;
  }

  async save(snapshot: Snapshot): Promise<void> {
    await this.command(["SET", config.state.key, JSON.stringify(snapshot)]);
  }
}

/** Local JSON file — fine for running on your own machine, wiped on Render restarts. */
class FileStore implements StateStore {
  readonly kind = `file (${config.state.file})`;

  async load(): Promise<Snapshot | null> {
    try {
      return JSON.parse(await fs.promises.readFile(config.state.file, "utf8")) as Snapshot;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async save(snapshot: Snapshot): Promise<void> {
    await fs.promises.mkdir(path.dirname(config.state.file), { recursive: true });
    const tmp = `${config.state.file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(snapshot, null, 2));
    await fs.promises.rename(tmp, config.state.file);
  }
}

export function createStateStore(): StateStore {
  return config.state.upstashUrl && config.state.upstashToken ? new UpstashStore() : new FileStore();
}
