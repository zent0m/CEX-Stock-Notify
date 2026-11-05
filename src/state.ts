import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { Meta, Snapshot } from "./types";

/** Two records: the stock snapshot, and small "meta" (daily-email bookkeeping). */
type RecordName = "snapshot" | "meta";

export interface StateStore {
  readonly kind: string;
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  loadMeta(): Promise<Meta | null>;
  saveMeta(meta: Meta): Promise<void>;
}

abstract class BaseStore implements StateStore {
  abstract readonly kind: string;
  protected abstract get(name: RecordName): Promise<string | null>;
  protected abstract set(name: RecordName, value: string): Promise<void>;

  async load(): Promise<Snapshot | null> {
    const raw = await this.get("snapshot");
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  }
  async save(snapshot: Snapshot): Promise<void> {
    await this.set("snapshot", JSON.stringify(snapshot));
  }
  async loadMeta(): Promise<Meta | null> {
    const raw = await this.get("meta");
    return raw ? (JSON.parse(raw) as Meta) : null;
  }
  async saveMeta(meta: Meta): Promise<void> {
    await this.set("meta", JSON.stringify(meta));
  }
}

/** Upstash Redis over its REST API — survives Render restarts and redeploys. */
class UpstashStore extends BaseStore {
  readonly kind = "Upstash Redis";

  private key(name: RecordName): string {
    return name === "snapshot" ? config.state.key : `${config.state.key}:${name}`;
  }

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

  protected async get(name: RecordName): Promise<string | null> {
    const raw = await this.command(["GET", this.key(name)]);
    return typeof raw === "string" ? raw : null;
  }
  protected async set(name: RecordName, value: string): Promise<void> {
    await this.command(["SET", this.key(name), value]);
  }
}

/** Local JSON files — fine for running on your own machine, wiped on Render restarts. */
class FileStore extends BaseStore {
  readonly kind = `file (${config.state.file})`;

  private file(name: RecordName): string {
    return name === "snapshot" ? config.state.file : config.state.file.replace(/(\.json)?$/, ".meta.json");
  }

  protected async get(name: RecordName): Promise<string | null> {
    try {
      return await fs.promises.readFile(this.file(name), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  protected async set(name: RecordName, value: string): Promise<void> {
    const file = this.file(name);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, value);
    await fs.promises.rename(tmp, file);
  }
}

export function createStateStore(): StateStore {
  return config.state.upstashUrl && config.state.upstashToken ? new UpstashStore() : new FileStore();
}
