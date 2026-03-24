import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const candidates = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs"];

async function findResolvedPath(basePath) {
  for (const suffix of candidates) {
    const candidatePath = `${basePath}${suffix}`;
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {}
  }

  for (const indexFile of ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs"]) {
    const candidatePath = path.join(basePath, indexFile);
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {}
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const basePath = path.join(projectRoot, "src", specifier.slice(2));
    const resolvedPath = await findResolvedPath(basePath);
    if (resolvedPath) {
      return defaultResolve(pathToFileURL(resolvedPath).href, context, defaultResolve);
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentPath = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : projectRoot;
    const basePath = path.resolve(parentPath, specifier);
    const resolvedPath = await findResolvedPath(basePath);
    if (resolvedPath) {
      return defaultResolve(pathToFileURL(resolvedPath).href, context, defaultResolve);
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}
