import { throwError } from 'inferno-shared';

interface UpdateQueue {
  clear(): void;
  flush(): void;
  hasPending(): boolean;
}

/*
 * Guards against a component that updates state unconditionally while
 * rendering, which would otherwise keep this loop going forever.
 */
export const NESTED_UPDATE_LIMIT = 50;

export const resolvedPromise = Promise.resolve();

let classQueue: UpdateQueue | null = null;
let functionalQueue: UpdateQueue | null = null;
let flushing = false;
let pending = false;
let version = 0;

export function registerClassUpdateQueue(queue: UpdateQueue): void {
  classQueue = queue;
}

export function registerFunctionalUpdateQueue(queue: UpdateQueue): void {
  functionalQueue = queue;
}

export function tooManyUpdates(): never {
  throwError(
    'too many re-renders. A component is updating state while rendering, which leaves the update loop unable to settle.',
  );
  throw new Error();
}

export function scheduleUpdate(): void {
  if (pending || flushing) {
    return;
  }

  pending = true;
  const scheduledVersion = version;

  resolvedPromise.then(() => {
    if (pending && scheduledVersion === version) {
      flushUpdates();
    }
  });
}

export function hasScheduledUpdates(): boolean {
  return pending;
}

export function flushUpdates(): void {
  // rerender() is public API and can be called from within a flush, so the
  // flag has to be restored rather than cleared for the outer flush.
  const lastFlushing = flushing;
  let passes = 0;
  let overflowed = false;

  pending = false;
  version++;
  flushing = true;

  try {
    do {
      if (++passes > NESTED_UPDATE_LIMIT) {
        // The queued work is what keeps re-triggering itself. Dropping it
        // leaves the offending component broken but the scheduler usable.
        overflowed = true;
        classQueue?.clear();
        functionalQueue?.clear();
        tooManyUpdates();
      }

      classQueue?.flush();
      functionalQueue?.flush();
    } while (classQueue?.hasPending() || functionalQueue?.hasPending());
  } finally {
    flushing = lastFlushing;

    // Work queued by a component that crashed is still worth flushing, but
    // re-scheduling a loop that just overflowed would only repeat the throw.
    if (
      !overflowed &&
      !flushing &&
      (classQueue?.hasPending() || functionalQueue?.hasPending())
    ) {
      scheduleUpdate();
    }
  }
}
