import {
  existsSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';

const DEFAULT_FS_OPS = {
  existsSync,
  renameSync,
  unlinkSync,
  writeFileSync,
};

export function writeFileBatchAtomically(
  writes,
  { fsOps = DEFAULT_FS_OPS, transactionId = randomUUID(), allowCreate = false } = {},
) {
  if (!Array.isArray(writes)) throw new TypeError('writes must be an array');
  if (!/^[A-Za-z0-9_-]+$/u.test(transactionId)) {
    throw new Error('transactionId must contain only letters, digits, underscores, or hyphens');
  }

  const seenPaths = new Set();
  const states = writes.map((write, index) => {
    if (typeof write?.path !== 'string' || !write.path) {
      throw new TypeError(`write ${index} requires a non-empty path`);
    }
    if (typeof write.content !== 'string') {
      throw new TypeError(`write ${index} requires string content`);
    }
    if (seenPaths.has(write.path)) {
      throw new Error(`duplicate atomic write target: ${write.path}`);
    }
    seenPaths.add(write.path);
    return {
      ...write,
      tempPath: `${write.path}.${transactionId}.${index}.tmp`,
      backupPath: `${write.path}.${transactionId}.${index}.bak`,
      backedUp: false,
      created: false,
    };
  });

  try {
    for (const state of states) {
      fsOps.writeFileSync(state.tempPath, state.content, { flag: 'wx' });
    }
    for (const state of states) {
      if (!allowCreate || fsOps.existsSync(state.path)) {
        fsOps.renameSync(state.path, state.backupPath);
        state.backedUp = true;
      }
      fsOps.renameSync(state.tempPath, state.path);
      state.created = !state.backedUp;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...states].reverse()) {
      try {
        if (state.backedUp) {
          if (fsOps.existsSync(state.path)) fsOps.unlinkSync(state.path);
          if (fsOps.existsSync(state.backupPath)) {
            fsOps.renameSync(state.backupPath, state.path);
          }
        }
        if (state.created && fsOps.existsSync(state.path)) fsOps.unlinkSync(state.path);
        if (fsOps.existsSync(state.tempPath)) fsOps.unlinkSync(state.tempPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Atomic batch write failed and rollback encountered ${rollbackErrors.length} error(s)`,
      );
    }
    throw error;
  }

  const cleanupErrors = [];
  for (const state of states) {
    try {
      if (fsOps.existsSync(state.backupPath)) fsOps.unlinkSync(state.backupPath);
    } catch (error) {
      cleanupErrors.push({ path: state.backupPath, error });
    }
  }
  return { committed: true, cleanupErrors };
}
