import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonStore {
  private data: Record<string, unknown> = {};
  private loaded = false;
  private writeQueue = Promise.resolve();

  constructor(private readonly path: string) {}

  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    await this.load();
    if (keys === null) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter((key) => key in this.data).map((key) => [key, this.data[key]]));
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.load();
    for (const [key, value] of Object.entries(items)) {
      if (value === undefined) delete this.data[key];
      else this.data[key] = value;
    }
    await this.persist();
  }

  async remove(keys: string | string[]): Promise<void> {
    await this.load();
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
    await this.persist();
  }

  async clearMatching(predicate: (key: string) => boolean): Promise<void> {
    await this.load();
    for (const key of Object.keys(this.data)) {
      if (predicate(key)) delete this.data[key];
    }
    await this.persist();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.data = JSON.parse(await readFile(this.path, "utf8")) as Record<string, unknown>;
    } catch {
      this.data = {};
    }
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(this.data, null, 2), "utf8");
      await rename(temporary, this.path);
    });
    await this.writeQueue;
  }
}
