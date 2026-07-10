interface UpdateQueue {
  flush(): void;
  hasPending(): boolean;
}

const resolvedPromise = Promise.resolve();
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
  pending = false;
  version++;
  flushing = true;

  try {
    do {
      classQueue?.flush();
      functionalQueue?.flush();
    } while (classQueue?.hasPending() || functionalQueue?.hasPending());
  } finally {
    flushing = false;

    if (classQueue?.hasPending() || functionalQueue?.hasPending()) {
      scheduleUpdate();
    }
  }
}
