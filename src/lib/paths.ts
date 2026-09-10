import { promises as fs } from 'fs';
import path from 'path';

export class PathError extends Error {}

function assertInside(root: string, candidate: string, input: string): void {
  const rel = path.relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new PathError(`Path ${input} is outside the working directory ${root}`);
  }
}

/** Resolve `input` (relative to `base`) and require the result to stay inside `root`. */
export function resolveInside(root: string, input: string, base: string = root): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PathError('Path must be a non-empty string');
  }
  const absRoot = path.resolve(root);
  const resolved = path.resolve(base, input);
  assertInside(absRoot, resolved, input);
  return resolved;
}

/** Resolve an existing file or directory, following symlinks so a link cannot escape `root`. */
export async function resolveExistingInside(root: string, input: string, base: string = root): Promise<string> {
  const resolved = resolveInside(root, input, base);
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    throw new PathError(`File not found: ${input}`);
  }
  const realRoot = await fs.realpath(path.resolve(root));
  assertInside(realRoot, real, input);
  return real;
}

/** Resolve a path a file will be written to, creating its parent directory. */
export async function resolveOutputInside(root: string, input: string, base: string = root): Promise<string> {
  const resolved = resolveInside(root, input, base);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}
