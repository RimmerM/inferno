import type { ContextObject, InfernoNode, RefObject, VNode } from './types';
import { isFunction, isNullOrUndef, throwError } from 'inferno-shared';
import {
  NESTED_UPDATE_LIMIT,
  registerFunctionalUpdateQueue,
  resolvedPromise,
  scheduleUpdate,
  tooManyUpdates,
} from './scheduler';
import { renderWithContext } from './context';

type HookAction<S> = S | ((lastState: S) => S);
type Reducer<S, A> = (lastState: S, action: A) => S;
type ReducerInitializer<I, S> = (initialArg: I) => S;
type EffectCallback = () => void | (() => void);
type EffectCleanup = (() => void) | null;
type StoreSubscribe = (onStoreChange: () => void) => () => void;
type SnapshotGetter<T> = () => T;
type StoreSelector<S, T> = (snapshot: S) => T;
type StoreSelectionComparator<T> = (
  lastSelection: T,
  nextSelection: T,
) => boolean;

/*
 * Hook kinds. Plain constants rather than a const enum, so every toolchain
 * that compiles this file directly - tsc, swc - resolves them without extra
 * configuration.
 */
type HookType = number;

const HookState: HookType = 0;
const HookReducer: HookType = 1;
const HookRef: HookType = 2;
const HookEffect: HookType = 3;
const HookLayoutEffect: HookType = 4;
const HookMemo: HookType = 5;
const HookImperativeHandle: HookType = 6;
const HookAnimation: HookType = 7;
const HookExternalStore: HookType = 8;
const HookExternalStoreWithSelector: HookType = 9;

// Only referenced from development branches, so it drops out of the bundle.
const hookNames = [
  'useState',
  'useReducer',
  'useRef',
  'useEffect',
  'useLayoutEffect',
  'useMemo/useCallback',
  'useImperativeHandle',
  'useAnimation',
  'useSyncExternalStore',
  'useSyncExternalStoreWithSelector',
];

/*
 * Marks a hook value that has never been assigned. `undefined` is a valid
 * state, so it cannot double as the "not initialized yet" signal.
 */
const UNSET = {};

/*
 * Hooks are created through the three factories below rather than field by
 * field, so that every hook of a given family shares one object shape. The
 * sites that see hooks of mixed kinds - runEffect, cleanupHook,
 * updateHookState - then only ever observe two shapes.
 */
interface Hook {
  cleanup?: EffectCleanup;
  create?: EffectCallback | null;
  deps?: readonly unknown[] | null;
  dispatch?: (value: unknown) => void;
  getSnapshot?: SnapshotGetter<unknown>;
  isEqual?: StoreSelectionComparator<unknown>;
  ref?: RefObject<unknown> | ((value: unknown) => void) | null;
  reducer?: Reducer<unknown, unknown>;
  selector?: StoreSelector<unknown, unknown>;
  snapshot?: unknown;
  subscribe?: StoreSubscribe;
  type: HookType;
  value?: unknown;
}

/*
 * A queued effect captures the callback of the render that queued it, so two
 * renders in one tick run both callbacks rather than the newest one twice.
 */
interface EffectJob {
  component: FunctionalComponentState;
  create: EffectCallback;
  hook: Hook;
}

export interface AnimationHookCallbacks {
  onAppear?: (dom: Element) => void;
  onDisappear?: (dom: Element, callback: () => void) => void;
  onMove?: (parentVNode: VNode, parentDOM: Element, dom: Element) => void;
}

export interface FunctionalComponentState {
  animation: AnimationHookCallbacks | null;
  cleanups: Hook[] | null;
  context: ContextObject;
  hookCount?: number;
  hooks: Hook[] | null;
  isServer: boolean;
  isSVG: boolean;
  pendingEffects: EffectJob[] | null;
  pendingLayoutEffects: EffectJob[] | null;
  queued: boolean;
  renderCount?: number;
  unmounted: boolean;
  vNode: VNode;
}

let currentComponent: FunctionalComponentState | null = null;
let currentContext: ContextObject | null = null;
let currentHookIndex = 0;
let currentIsServer = false;
let currentIsSVG = false;
let currentVNode: VNode | null = null;
let functionalComponentUpdate:
  | ((component: FunctionalComponentState) => void)
  | null = null;

const functionalComponentQueue: FunctionalComponentState[] = [];
const pendingPassiveEffects: EffectJob[] = [];
let passiveEffectsPending = false;

function invalidHookCall(): never {
  throwError('hooks can only be called inside functional components.');
  throw new Error();
}

function getCurrentComponent(): FunctionalComponentState {
  if (isNullOrUndef(currentVNode)) {
    invalidHookCall();
  }

  if (isNullOrUndef(currentComponent)) {
    // `null` is set by renderFunctionalComponentWithHooks below when a render
    // completed without touching a single hook, and is distinct from the
    // `undefined` a freshly created vNode carries.
    const previouslyRenderedWithoutHooks = currentVNode.$H === null;

    currentComponent = setFunctionalComponentState(
      currentVNode,
      createFunctionalComponentState(
        currentVNode,
        currentContext!,
        currentIsSVG,
        currentIsServer,
      ),
    );

    if (
      process.env.NODE_ENV !== 'production' &&
      previouslyRenderedWithoutHooks
    ) {
      currentComponent.renderCount = 1;
    }
  }

  return currentComponent;
}

function createValueHook(type: HookType): Hook {
  return {
    deps: null,
    dispatch: undefined,
    reducer: undefined,
    type,
    value: UNSET,
  };
}

function createEffectHook(type: HookType): Hook {
  return {
    cleanup: null,
    create: null,
    deps: null,
    ref: null,
    type,
  };
}

function createStoreHook(type: HookType): Hook {
  return {
    cleanup: null,
    create: null,
    deps: null,
    dispatch: undefined,
    getSnapshot: undefined,
    isEqual: undefined,
    ref: null,
    selector: undefined,
    snapshot: undefined,
    subscribe: undefined,
    type,
    value: UNSET,
  };
}

function trackCleanup(component: FunctionalComponentState, hook: Hook): Hook {
  const cleanups = component.cleanups || (component.cleanups = []);

  cleanups.push(hook);

  return hook;
}

function createHook(component: FunctionalComponentState, type: HookType): Hook {
  switch (type) {
    case HookEffect:
    case HookLayoutEffect:
    case HookImperativeHandle:
      return trackCleanup(component, createEffectHook(type));
    case HookExternalStore:
    case HookExternalStoreWithSelector:
      return trackCleanup(component, createStoreHook(type));
    default:
      return createValueHook(type);
  }
}

function getHook(component: FunctionalComponentState, type: HookType): Hook {
  const hooks = component.hooks || (component.hooks = []);
  const index = currentHookIndex++;
  let hook = hooks[index];

  if (isNullOrUndef(hook)) {
    hook = hooks[index] = createHook(component, type);
  } else if (process.env.NODE_ENV !== 'production' && hook.type !== type) {
    throwError(
      `hooks must be called in the same order on every render. Expected ${
        hookNames[hook.type]
      } but got ${hookNames[type]}.`,
    );
  }

  return hook;
}

function depsChanged(
  lastDeps: readonly unknown[] | null | undefined,
  nextDeps: readonly unknown[] | undefined,
): boolean {
  if (isNullOrUndef(nextDeps) || isNullOrUndef(lastDeps)) {
    return true;
  }

  if (lastDeps.length !== nextDeps.length) {
    return true;
  }

  for (let i = 0; i < nextDeps.length; i++) {
    if (!Object.is(lastDeps[i], nextDeps[i])) {
      return true;
    }
  }

  return false;
}

function queueFunctionalComponentUpdate(
  component: FunctionalComponentState,
): void {
  // Nothing re-renders on the server, so state updates are dropped instead of
  // piling up in a queue that is never drained.
  if (component.unmounted || component.isServer) {
    return;
  }

  if (!component.queued) {
    component.queued = true;
    functionalComponentQueue.push(component);
  }

  scheduleUpdate();
}

function updateHookState<S>(
  component: FunctionalComponentState,
  hook: Hook,
  nextState: S,
): void {
  if (!Object.is(hook.value, nextState)) {
    hook.value = nextState;
    queueFunctionalComponentUpdate(component);
  }
}

function updateExternalStoreSnapshot(
  component: FunctionalComponentState,
  hook: Hook,
): void {
  if (!isNullOrUndef(hook.getSnapshot)) {
    updateHookState(component, hook, hook.getSnapshot());
  }
}

function areSelectionsEqual(
  lastSelection: unknown,
  nextSelection: unknown,
  isEqual?: StoreSelectionComparator<unknown>,
): boolean {
  return isFunction(isEqual)
    ? isEqual(lastSelection, nextSelection)
    : Object.is(lastSelection, nextSelection);
}

function updateExternalStoreSelection(
  component: FunctionalComponentState,
  hook: Hook,
): void {
  if (!isNullOrUndef(hook.getSnapshot) && !isNullOrUndef(hook.selector)) {
    const snapshot = hook.getSnapshot();
    const nextSelection = hook.selector(snapshot);

    hook.snapshot = snapshot;

    if (!areSelectionsEqual(hook.value, nextSelection, hook.isEqual)) {
      hook.value = nextSelection;
      queueFunctionalComponentUpdate(component);
    }
  }
}

function runEffect(job: EffectJob): void {
  const { component, create, hook } = job;

  if (component.unmounted) {
    return;
  }

  if (isFunction(hook.cleanup)) {
    hook.cleanup();
  }

  const cleanup = create();
  hook.cleanup = isFunction(cleanup) ? cleanup : null;
}

function flushPassiveEffects(): void {
  passiveEffectsPending = false;

  let index = 0;

  try {
    while (index < pendingPassiveEffects.length) {
      runEffect(pendingPassiveEffects[index++]);
    }
  } finally {
    if (index === pendingPassiveEffects.length) {
      pendingPassiveEffects.length = 0;
    } else if (index > 0) {
      pendingPassiveEffects.splice(0, index);
    }

    if (pendingPassiveEffects.length > 0 && !passiveEffectsPending) {
      passiveEffectsPending = true;
      resolvedPromise.then(flushPassiveEffects);
    }
  }
}

function schedulePassiveEffects(effects: EffectJob[]): void {
  for (let i = 0; i < effects.length; i++) {
    pendingPassiveEffects.push(effects[i]);
  }

  if (!passiveEffectsPending) {
    passiveEffectsPending = true;
    resolvedPromise.then(flushPassiveEffects);
  }
}

function runLayoutEffects(effects: EffectJob[]): void {
  for (let i = 0; i < effects.length; i++) {
    runEffect(effects[i]);
  }
}

function cleanupHook(hook: Hook): void {
  if (isFunction(hook.cleanup)) {
    hook.cleanup();
    hook.cleanup = null;
  } else if (!isNullOrUndef(hook.ref)) {
    assignRef(hook.ref, null);
  }
}

function assignRef(
  ref: RefObject<unknown> | ((value: unknown) => void),
  value: unknown,
): void {
  if (isFunction(ref)) {
    ref(value);
  } else {
    (ref as { current: unknown }).current = value;
  }
}

function queueEffect(
  component: FunctionalComponentState,
  hook: Hook,
  layout: boolean,
): void {
  let effects = layout
    ? component.pendingLayoutEffects
    : component.pendingEffects;

  if (isNullOrUndef(effects)) {
    effects = [];
    if (layout) {
      component.pendingLayoutEffects = effects;
    } else {
      component.pendingEffects = effects;
    }
  }

  effects.push({
    component,
    create: hook.create as EffectCallback,
    hook,
  });
}

export function setFunctionalComponentUpdate(
  update: (component: FunctionalComponentState) => void,
): void {
  functionalComponentUpdate = update;
}

export function createFunctionalComponentState(
  vNode: VNode,
  context: ContextObject,
  isSVG: boolean,
  isServer = false,
): FunctionalComponentState {
  const component: FunctionalComponentState = {
    animation: null,
    cleanups: null,
    context,
    hooks: null,
    isServer,
    isSVG,
    pendingEffects: null,
    pendingLayoutEffects: null,
    queued: false,
    unmounted: false,
    vNode,
  };

  if (process.env.NODE_ENV !== 'production') {
    component.hookCount = 0;
    component.renderCount = 0;
  }

  return component;
}

export function setFunctionalComponentState(
  vNode: VNode,
  component: FunctionalComponentState,
): FunctionalComponentState;
export function setFunctionalComponentState(
  vNode: VNode,
  component: null,
): null;
export function setFunctionalComponentState(
  vNode: VNode,
  component: FunctionalComponentState | null,
): FunctionalComponentState | null {
  vNode.$H = component;

  return component;
}

function prepareFunctionalComponentHooks(
  component: FunctionalComponentState,
): void {
  component.animation = null;
  component.pendingEffects = null;
  component.pendingLayoutEffects = null;

  if (process.env.NODE_ENV !== 'production') {
    component.hookCount = component.hooks?.length || 0;
  }
}

function finishFunctionalComponentHooks(
  component: FunctionalComponentState,
  rendered: boolean,
): void {
  if (process.env.NODE_ENV !== 'production') {
    // A render that threw part way through has called fewer hooks than it
    // will on a healthy render. Reporting that as a hook order violation
    // would bury the error the component actually threw.
    if (
      rendered &&
      component.renderCount! > 0 &&
      currentHookIndex !== component.hookCount
    ) {
      throwError('hooks must be called in the same order on every render.');
    }

    component.renderCount!++;
  }
}

export function commitFunctionalComponentEffects(
  component: FunctionalComponentState,
  lifecycle: Array<() => void>,
): void {
  const layoutEffects = component.pendingLayoutEffects;

  if (!isNullOrUndef(layoutEffects)) {
    component.pendingLayoutEffects = null;

    lifecycle.push(() => {
      runLayoutEffects(layoutEffects);
    });
  }

  const effects = component.pendingEffects;

  if (!isNullOrUndef(effects)) {
    component.pendingEffects = null;

    lifecycle.push(() => {
      schedulePassiveEffects(effects);
    });
  }
}

export function unmountFunctionalComponentHooks(
  component: FunctionalComponentState,
): void {
  component.unmounted = true;

  const cleanups = component.cleanups;

  if (isNullOrUndef(cleanups)) {
    return;
  }

  for (let i = 0; i < cleanups.length; i++) {
    cleanupHook(cleanups[i]);
  }
}

function rerenderFunctionalComponents(): void {
  /*
   * Components queued while this loop runs are picked up by it, which is what
   * keeps a chain of updates in a single batch. The budget scales with the
   * work actually queued, so it only trips on a component that re-queues
   * itself without ever settling.
   */
  const limit = (functionalComponentQueue.length + 1) * NESTED_UPDATE_LIMIT;
  let index = 0;

  try {
    while (index < functionalComponentQueue.length) {
      if (index > limit) {
        clearFunctionalComponentQueue();
        tooManyUpdates();
      }

      const component = functionalComponentQueue[index++];

      component.queued = false;

      if (!component.unmounted && !isNullOrUndef(functionalComponentUpdate)) {
        functionalComponentUpdate(component);
      }
    }
  } finally {
    if (index === functionalComponentQueue.length) {
      functionalComponentQueue.length = 0;
    } else if (index > 0) {
      functionalComponentQueue.splice(0, index);
    }
  }
}

function clearFunctionalComponentQueue(): void {
  for (let i = 0; i < functionalComponentQueue.length; i++) {
    functionalComponentQueue[i].queued = false;
  }

  functionalComponentQueue.length = 0;
}

registerFunctionalUpdateQueue({
  clear: clearFunctionalComponentQueue,
  flush: rerenderFunctionalComponents,
  hasPending: () => functionalComponentQueue.length > 0,
});

export function useState<S>(
  initialState: S | (() => S),
): [S, (value: HookAction<S>) => void] {
  const component = getCurrentComponent();
  const hook = getHook(component, HookState);

  if (hook.value === UNSET) {
    hook.value = isFunction(initialState)
      ? (initialState as () => S)()
      : initialState;
    hook.dispatch = (value) => {
      const nextState = isFunction(value)
        ? (value as (lastState: S) => S)(hook.value as S)
        : (value as S);

      updateHookState(component, hook, nextState);
    };
  }

  return [hook.value as S, hook.dispatch as (value: HookAction<S>) => void];
}

export function useReducer<S, A, I = S>(
  reducer: Reducer<S, A>,
  initialArg: I,
  init?: ReducerInitializer<I, S>,
): [S, (action: A) => void] {
  const component = getCurrentComponent();
  const hook = getHook(component, HookReducer);

  if (hook.value === UNSET) {
    hook.value = isFunction(init) ? init(initialArg) : (initialArg as unknown);
    hook.dispatch = (action) => {
      const nextState = (hook.reducer as Reducer<S, A>)(
        hook.value as S,
        action as A,
      );

      updateHookState(component, hook, nextState);
    };
  }

  hook.reducer = reducer as Reducer<unknown, unknown>;

  return [hook.value as S, hook.dispatch as (action: A) => void];
}

export function useRef<T = undefined>(): { current: T | undefined };
export function useRef<T>(initialValue: T): { current: T };
export function useRef<T>(initialValue?: T): { current: T | undefined } {
  const hook = getHook(getCurrentComponent(), HookRef);

  if (hook.value === UNSET) {
    hook.value = {
      current: initialValue,
    };
  }

  return hook.value as { current: T | undefined };
}

export function useEffect(
  create: EffectCallback,
  deps?: readonly unknown[],
): void {
  const component = getCurrentComponent();
  const hook = getHook(component, HookEffect);

  if (depsChanged(hook.deps, deps)) {
    hook.create = create;
    hook.deps = isNullOrUndef(deps) ? null : deps;
    queueEffect(component, hook, false);
  }
}

export function useLayoutEffect(
  create: EffectCallback,
  deps?: readonly unknown[],
): void {
  const component = getCurrentComponent();
  const hook = getHook(component, HookLayoutEffect);

  if (depsChanged(hook.deps, deps)) {
    hook.create = create;
    hook.deps = isNullOrUndef(deps) ? null : deps;
    queueEffect(component, hook, true);
  }
}

export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const hook = getHook(getCurrentComponent(), HookMemo);

  // On the first render hook.deps is null, which depsChanged already reports
  // as changed, so there is no separate "not initialized" check.
  if (depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = isNullOrUndef(deps) ? null : deps;
  }

  return hook.value as T;
}

export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: readonly unknown[],
): T {
  const hook = getHook(getCurrentComponent(), HookMemo);

  if (depsChanged(hook.deps, deps)) {
    hook.value = callback;
    hook.deps = isNullOrUndef(deps) ? null : deps;
  }

  return hook.value as T;
}

export function useSyncExternalStore<T>(
  subscribe: StoreSubscribe,
  getSnapshot: SnapshotGetter<T>,
  getServerSnapshot?: SnapshotGetter<T>,
): T {
  const component = getCurrentComponent();
  const hook = getHook(component, HookExternalStore);
  const lastSubscribe = hook.subscribe;

  hook.value =
    component.isServer && isFunction(getServerSnapshot)
      ? getServerSnapshot()
      : getSnapshot();

  if (isNullOrUndef(hook.dispatch)) {
    hook.dispatch = () => {
      updateExternalStoreSnapshot(component, hook);
    };
  }

  hook.getSnapshot = getSnapshot as SnapshotGetter<unknown>;
  hook.subscribe = subscribe;

  if (!component.isServer && lastSubscribe !== subscribe) {
    hook.create = () => {
      const unsubscribe = subscribe(hook.dispatch as () => void);

      updateExternalStoreSnapshot(component, hook);

      return unsubscribe;
    };
    queueEffect(component, hook, true);
  }

  return hook.value as T;
}

export function useSyncExternalStoreWithSelector<S, T>(
  subscribe: StoreSubscribe,
  getSnapshot: SnapshotGetter<S>,
  getServerSnapshot: SnapshotGetter<S> | undefined,
  selector: StoreSelector<S, T>,
  isEqual?: StoreSelectionComparator<T>,
): T {
  const component = getCurrentComponent();
  const hook = getHook(component, HookExternalStoreWithSelector);
  const snapshot =
    component.isServer && isFunction(getServerSnapshot)
      ? getServerSnapshot()
      : getSnapshot();
  const lastSubscribe = hook.subscribe;
  const lastSelector = hook.selector;
  const hasValue = hook.value !== UNSET;

  if (
    !hasValue ||
    !Object.is(hook.snapshot, snapshot) ||
    lastSelector !== selector
  ) {
    const nextSelection = selector(snapshot);

    hook.snapshot = snapshot;

    if (
      !hasValue ||
      !areSelectionsEqual(
        hook.value,
        nextSelection,
        isEqual as StoreSelectionComparator<unknown>,
      )
    ) {
      hook.value = nextSelection;
    }
  }

  if (isNullOrUndef(hook.dispatch)) {
    hook.dispatch = () => {
      updateExternalStoreSelection(component, hook);
    };
  }

  hook.getSnapshot = getSnapshot as SnapshotGetter<unknown>;
  hook.isEqual = isEqual as StoreSelectionComparator<unknown> | undefined;
  hook.selector = selector as StoreSelector<unknown, unknown>;
  hook.subscribe = subscribe;

  if (!component.isServer && lastSubscribe !== subscribe) {
    hook.create = () => {
      const unsubscribe = subscribe(hook.dispatch as () => void);

      updateExternalStoreSelection(component, hook);

      return unsubscribe;
    };
    queueEffect(component, hook, true);
  }

  return hook.value as T;
}

export function useImperativeHandle<T>(
  ref: RefObject<T> | ((value: T | null) => void) | null | undefined,
  create: () => T,
  deps?: readonly unknown[],
): void {
  const component = getCurrentComponent();
  const hook = getHook(component, HookImperativeHandle);
  const lastRef = hook.ref;

  hook.ref = isNullOrUndef(ref)
    ? null
    : (ref as RefObject<unknown> | ((value: unknown) => void));

  if (lastRef !== hook.ref || depsChanged(hook.deps, deps)) {
    const activeRef = hook.ref;

    hook.create = () => {
      if (!isNullOrUndef(activeRef)) {
        assignRef(activeRef, create());
      }

      return () => {
        if (!isNullOrUndef(activeRef)) {
          assignRef(activeRef, null);
        }
      };
    };
    hook.deps = isNullOrUndef(deps) ? null : deps;
    queueEffect(component, hook, true);
  }
}

export function useAnimation(callbacks: AnimationHookCallbacks): void {
  const component = getCurrentComponent();

  getHook(component, HookAnimation).value = callbacks;
  component.animation = callbacks;
}

export function renderFunctionalComponentWithHooks(
  vNode: VNode,
  context: ContextObject,
  isSVG: boolean,
  isServer: boolean,
  render: () => InfernoNode,
): InfernoNode {
  const lastComponent = currentComponent;
  const lastContext = currentContext;
  const lastHookIndex = currentHookIndex;
  const lastIsServer = currentIsServer;
  const lastIsSVG = currentIsSVG;
  const lastVNode = currentVNode;
  const component = vNode.$H;
  let rendered = false;

  currentComponent = component || null;
  currentContext = context;
  currentHookIndex = 0;
  currentIsServer = isServer;
  currentIsSVG = isSVG;
  currentVNode = vNode;

  if (!isNullOrUndef(component)) {
    component.context = context;
    component.isServer = isServer;
    component.isSVG = isSVG;
    component.vNode = vNode;
    prepareFunctionalComponentHooks(component);
  }

  try {
    const input = renderWithContext(context, vNode, render);

    rendered = true;

    return input;
  } finally {
    try {
      if (!isNullOrUndef(currentComponent)) {
        finishFunctionalComponentHooks(currentComponent, rendered);
      } else if (process.env.NODE_ENV !== 'production') {
        // Records that this render used no hooks at all, which is what lets a
        // component that starts calling them later be detected.
        setFunctionalComponentState(vNode, null);
      }
    } finally {
      currentComponent = lastComponent;
      currentContext = lastContext;
      currentHookIndex = lastHookIndex;
      currentIsServer = lastIsServer;
      currentIsSVG = lastIsSVG;
      currentVNode = lastVNode;
    }
  }
}
