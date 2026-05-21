import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataRoot, resolveInside } from "./paths";

export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    const filePath = resolveInside(getDataRoot(), [filename]);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(filename: string, value: T) {
  const filePath = resolveInside(getDataRoot(), [filename]);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function dataFilePath(filename: string) {
  return path.join(getDataRoot(), filename);
}
