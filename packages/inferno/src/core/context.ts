import { isArray, isNullOrUndef, throwError } from 'inferno-shared';

export type ContextValue = NonNullable<unknown> | null;
export type Context = ReadonlyArray<ContextValue | undefined>;

declare const contextType: unique symbol;

type WidenContextValue<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

export type ContextType<T extends ContextValue> = number & {
  readonly [contextType]: T;
};

export type ContextOverride<T extends ContextValue = ContextValue> = readonly [
  ContextType<T>,
  T,
];
export type ContextOverrides =
  | ContextOverride
  | ReadonlyArray<ContextOverride>;

interface ContextTarget {
  $CX?: Context | null;
}

const defaultContextValues: Array<ContextValue | undefined> = [];
let contextLocked = false;
let currentContext: Context | null = null;
let currentTarget: ContextTarget | null = null;

export function createContext<T extends ContextValue>(): ContextType<T>;
export function createContext<T extends ContextValue>(
  defaultValue: T,
): ContextType<WidenContextValue<T>>;
export function createContext<T extends ContextValue>(
  defaultValue?: T,
): ContextType<T> {
  if (contextLocked) {
    throwError('createContext() must be called before rendering begins.');
  }

  if (process.env.NODE_ENV !== 'production') {
    if (arguments.length > 0 && defaultValue === undefined) {
      throwError('context values cannot be undefined. Use null instead.');
    }
  }

  const index = defaultContextValues.length;
  defaultContextValues.push(defaultValue);

  return index as ContextType<T>;
}

export function contextValue<T extends ContextValue>(
  type: ContextType<T>,
  value: NoInfer<T>,
): ContextOverride<T> {
  return [type, value];
}

export function createContextValues(
  ...overrides: ReadonlyArray<ContextOverride>
): Context {
  let context: Context = defaultContextValues;

  for (let i = 0; i < overrides.length; i++) {
    context = setContext(context, overrides[i][0], overrides[i][1]);
  }

  return context;
}

export function setContext<T extends ContextValue>(
  context: Context,
  type: ContextType<T>,
  value: NoInfer<T>,
): Context {
  if (process.env.NODE_ENV !== 'production' && value === undefined) {
    throwError('context values cannot be undefined. Use null instead.');
  }

  if (Object.is(context[type], value)) {
    return context;
  }

  const nextContext = context.slice();
  nextContext[type] = value;

  return nextContext;
}

export function readContext<T extends ContextValue>(
  context: Context,
  type: ContextType<T>,
): T {
  const value = context[type];

  if (process.env.NODE_ENV !== 'production' && value === undefined) {
    throwError(
      `context at index ${type} has no default or provided value. ` +
        'Give it a default or include it in the initial render context.',
    );
  }

  return value as T;
}

export function useContext<T extends ContextValue>(type: ContextType<T>): T {
  if (isNullOrUndef(currentContext)) {
    throwError('useContext() can only be called while a component is rendering.');
  }

  return readContext(currentContext!, type);
}

export function provideContext<T extends ContextValue>(
  type: ContextType<T>,
  value: NoInfer<T>,
): void {
  if (isNullOrUndef(currentContext) || isNullOrUndef(currentTarget)) {
    throwError(
      'provideContext() can only be called while a component is rendering.',
    );
  }

  const target = currentTarget!;
  const baseContext = target.$CX || currentContext!;
  const childContext = setContext(baseContext, type, value);

  if (childContext !== baseContext) {
    setChildContext(target, childContext);
  }
}

export function applyContextOverrides(
  context: Context,
  overrides: ContextOverrides | null | undefined,
): Context {
  if (isNullOrUndef(overrides)) {
    return context;
  }

  if (overrides.length === 0) {
    return context;
  }

  if (!isArray(overrides[0])) {
    const override = overrides as ContextOverride;
    return setContext(context, override[0], override[1]);
  }

  let childContext = context;
  const entries = overrides as ReadonlyArray<ContextOverride>;

  for (let i = 0; i < entries.length; i++) {
    childContext = setContext(
      childContext,
      entries[i][0],
      entries[i][1],
    );
  }

  return childContext;
}

export function renderWithContext<T>(
  context: Context,
  target: ContextTarget,
  render: () => T,
): T {
  const lastContext = currentContext;
  const lastTarget = currentTarget;
  const lastChildContext = target.$CX;

  if (!isNullOrUndef(target.$CX)) {
    target.$CX = context;
  }

  currentContext = context;
  currentTarget = target;

  try {
    return render();
  } finally {
    if (!isNullOrUndef(lastChildContext) && !isNullOrUndef(target.$CX)) {
      target.$CX = reuseContext(lastChildContext, target.$CX);
    }
    currentContext = lastContext;
    currentTarget = lastTarget;
  }
}

export function reuseContext(lastContext: Context, context: Context): Context {
  if (lastContext === context || lastContext.length !== context.length) {
    return context;
  }

  for (let i = 0; i < context.length; i++) {
    if (!Object.is(lastContext[i], context[i])) {
      return context;
    }
  }

  return lastContext;
}

export function getChildContext(
  target: ContextTarget,
  parentContext: Context,
): Context {
  return target.$CX || parentContext;
}

export function transferChildContext(
  from: ContextTarget,
  to: ContextTarget,
): void {
  if (!isNullOrUndef(from.$CX)) {
    setChildContext(to, from.$CX);
  }
}

export function getDefaultContext(): Context {
  return defaultContextValues;
}

export function lockContext(): void {
  contextLocked = true;
}

function setChildContext(target: ContextTarget, context: Context): void {
  if ('$CX' in target) {
    target.$CX = context;
  } else {
    Object.defineProperty(target, '$CX', {
      configurable: true,
      value: context,
      writable: true,
    });
  }
}
