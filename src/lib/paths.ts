import { mkdirSync } from "node:fs";
import path from "node:path";

export function getDataRoot() {
  const dataRoot = process.env.DATA_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  mkdirSync(dataRoot, { recursive: true });
  return dataRoot;
}

export function getMediaRoot() {
  const mediaRoot = process.env.MEDIA_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), "media");
  mkdirSync(mediaRoot, { recursive: true });
  return mediaRoot;
}

export function resolveInside(root: string, segments: string[]) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, ...segments);
  const isInside = targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);

  if (!isInside) {
    throw new Error("Path escapes configured root");
  }

  return targetPath;
}
