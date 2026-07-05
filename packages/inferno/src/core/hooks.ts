import type { ContextObject, InfernoNode, RefObject, VNode } from './types';
import { isFunction, isNullOrUndef, throwError } from 'inferno-shared';

type HookAction<S> = S | ((lastState: S) => S);
type Reducer<S, A> = (lastState: S, action: A) => S;
type ReducerInitializer<I, S> = (initialArg: I) => S;
type EffectCallback = () => void | (() => void);
type EffectCleanup = (() => void) | null;
type StoreSubscribe = (onStoreChange: () => void) => () => void;
type SnapshotGetter<T> = () => T;
type StoreSelector<S, T> = (snapshot: S) => T;
type StoreSelectionComparator<T> = (lastSelection: T, nextSelection: T) => boolean;

const nextTick = Promise.resolve().then.bind(Promise.resolve());

const enum HookType {
  State,
  Reducer,
  Ref,
  Effect,
  LayoutEffect,
  Memo,
  ImperativeHandle,
  Animation,
  ExternalStore,
  ExternalStoreWithSelector,
}

interface Hook {
  cleanup?: EffectCleanup;
  create?: EffectCallback;
  deps?: unknown[] | null;
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

export interface AnimationHookCallbacks {
  onAppear?: (dom: Element) => void;
  onDisappear?: (dom: Element, callback: () => void) => void;
  onMove?: (parentVNode: VNode, parentDOM: Element, dom: Element) => void;
}

export interface FunctionalComponentState {
  animation: AnimationHookCallbacks | null;
  context: ContextObject;
  hookCount: number;
  hooks: Hook[];
  input: VNode | null;
  isServer: boolean;
  isSVG: boolean;
  pendingEffects: Hook[];
  pendingLayoutEffects: Hook[];
  queued: boolean;
  renderCount: number;
  unmounted: boolean;
  vNode: VNode;
}

let currentComponent: FunctionalComponentState | null = null;
let currentHookIndex = 0;
let functionalComponentUpdate:
  | ((component: FunctionalComponentState) => void)
  | null = null;

const functionalComponentQueue: FunctionalComponentState[] = [];
const pendingPassiveEffects: Array<{
  component: FunctionalComponentState;
  effects: Hook[];
}> = [];
let functionalQueuePending = false;
let passiveEffectsPending = false;

function invalidHookCall(): never {
  throwError('hooks can only be called inside functional components.');
  throw new Error();
}

function getCurrentComponent(): FunctionalComponentState {
  if (isNullOrUndef(currentComponent)) {
    invalidHookCall();
  }

  return currentComponent;
}

function getHook(type: HookType): Hook {
  const component = getCurrentComponent();
  const hooks = component.hooks;
  const index = currentHookIndex++;
  let hook = hooks[index];

  if (isNullOrUndef(hook)) {
    hook = hooks[index] = {
      type,
    };
  } else if (process.env.NODE_ENV !== 'production' && hook.type !== type) {
    throwError('hooks must be called in the same order on every render.');
  }

  return hook;
}

function depsChanged(lastDeps: unknown[] | null | undefined, nextDeps): boolean {
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
  if (component.unmounted) {
    return;
  }

  if (!component.queued) {
    component.queued = true;
    functionalComponentQueue.push(component);
  }

  if (!functionalQueuePending) {
    functionalQueuePending = true;
    nextTick(rerenderFunctionalComponents);
  }
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

function runEffect(hook: Hook, component: FunctionalComponentState): void {
  if (component.unmounted) {
    return;
  }

  if (isFunction(hook.cleanup)) {
    hook.cleanup();
  }

  const cleanup = hook.create!();
  hook.cleanup = isFunction(cleanup) ? cleanup : null;
}

function flushPassiveEffects(): void {
  passiveEffectsPending = false;

  let index = 0;

  try {
    while (index < pendingPassiveEffects.length) {
      const { component, effects } = pendingPassiveEffects[index++];

      for (let i = 0; i < effects.length; i++) {
        runEffect(effects[i], component);
      }
    }
  } finally {
    if (index === pendingPassiveEffects.length) {
      pendingPassiveEffects.length = 0;
    } else if (index > 0) {
      pendingPassiveEffects.splice(0, index);
    }
  }
}

function schedulePassiveEffects(
  component: FunctionalComponentState,
  effects: Hook[],
): void {
  pendingPassiveEffects.push({
    component,
    effects,
  });

  if (!passiveEffectsPending) {
    passiveEffectsPending = true;
    nextTick(flushPassiveEffects);
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

export function setFunctionalComponentUpdate(
  update: (component: FunctionalComponentState) => void,
): void {
  functionalComponentUpdate = update;
}

export function createFunctionalComponentState(
  vNode: VNode,
  context: ContextObject,
  isSVG: boolean,
): FunctionalComponentState {
  return {
    animation: null,
    context,
    hookCount: 0,
    hooks: [],
    input: null,
    isServer: false,
    isSVG,
    pendingEffects: [],
    pendingLayoutEffects: [],
    queued: false,
    renderCount: 0,
    unmounted: false,
    vNode,
  };
}

export function setFunctionalComponentState(
  vNode: VNode,
  component: FunctionalComponentState,
): FunctionalComponentState {
  Object.defineProperty(vNode, '$H', {
    configurable: true,
    value: component,
    writable: true,
  });

  return component;
}

export function prepareFunctionalComponentHooks(
  component: FunctionalComponentState,
  vNode: VNode,
  context: ContextObject,
  isSVG: boolean,
): void {
  component.animation = null;
  component.context = context;
  component.isSVG = isSVG;
  component.pendingEffects = [];
  component.pendingLayoutEffects = [];
  component.vNode = vNode;
  component.hookCount = component.hooks.length;
  currentComponent = component;
  currentHookIndex = 0;
}

export function finishFunctionalComponentHooks(
  component: FunctionalComponentState,
): void {
  if (
    process.env.NODE_ENV !== 'production' &&
    component.renderCount > 0 &&
    currentHookIndex !== component.hookCount
  ) {
    throwError('hooks must be called in the same order on every render.');
  }

  component.renderCount++;
  currentComponent = null;
  currentHookIndex = 0;
}

export function resetFunctionalComponentHooks(): void {
  currentComponent = null;
  currentHookIndex = 0;
}

export function commitFunctionalComponentEffects(
  component: FunctionalComponentState,
  lifecycle: Array<() => void>,
): void {
  if (component.pendingLayoutEffects.length > 0) {
    const effects = component.pendingLayoutEffects;

    lifecycle.push(() => {
      for (let i = 0; i < effects.length; i++) {
        runEffect(effects[i], component);
      }
    });
  }

  if (component.pendingEffects.length > 0) {
    const effects = component.pendingEffects;

    lifecycle.push(() => {
      schedulePassiveEffects(component, effects);
    });
  }
}

export function unmountFunctionalComponentHooks(
  component: FunctionalComponentState,
): void {
  component.unmounted = true;

  for (let i = 0; i < component.hooks.length; i++) {
    cleanupHook(component.hooks[i]);
  }
}

export function rerenderFunctionalComponents(): void {
  functionalQueuePending = false;

  let index = 0;

  try {
    while (index < functionalComponentQueue.length) {
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

export function useState<S>(
  initialState: S | (() => S),
): [S, (value: HookAction<S>) => void] {
  const component = getCurrentComponent();
  const hook = getHook(HookType.State);

  if (!('value' in hook)) {
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
  const hook = getHook(HookType.Reducer);

  if (!('value' in hook)) {
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

export function useRef<T>(initialValue: T): { current: T } {
  const hook = getHook(HookType.Ref);

  if (!('value' in hook)) {
    hook.value = {
      current: initialValue,
    };
  }

  return hook.value as { current: T };
}

export function useEffect(create: EffectCallback, deps?: unknown[]): void {
  const component = getCurrentComponent();
  const hook = getHook(HookType.Effect);

  if (depsChanged(hook.deps, deps)) {
    hook.create = create;
    hook.deps = isNullOrUndef(deps) ? null : deps;
    component.pendingEffects.push(hook);
  }
}

export function useLayoutEffect(
  create: EffectCallback,
  deps?: unknown[],
): void {
  const component = getCurrentComponent();
  const hook = getHook(HookType.LayoutEffect);

  if (depsChanged(hook.deps, deps)) {
    hook.create = create;
    hook.deps = isNullOrUndef(deps) ? null : deps;
    component.pendingLayoutEffects.push(hook);
  }
}

export function useMemo<T>(factory: () => T, deps?: unknown[]): T {
  const hook = getHook(HookType.Memo);

  if (!('value' in hook) || depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = isNullOrUndef(deps) ? null : deps;
  }

  return hook.value as T;
}

export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: unknown[],
): T {
  return useMemo(() => callback, deps);
}

export function useSyncExternalStore<T>(
  subscribe: StoreSubscribe,
  getSnapshot: SnapshotGetter<T>,
  getServerSnapshot?: SnapshotGetter<T>,
): T {
  const component = getCurrentComponent();
  const hook = getHook(HookType.ExternalStore);
  const snapshot =
    component.isServer && isFunction(getServerSnapshot)
      ? getServerSnapshot()
      : getSnapshot();
  const lastSubscribe = hook.subscribe;

  if (!('value' in hook) || !Object.is(hook.value, snapshot)) {
    hook.value = snapshot;
  }

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
    component.pendingLayoutEffects.push(hook);
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
  const hook = getHook(HookType.ExternalStoreWithSelector);
  const snapshot =
    component.isServer && isFunction(getServerSnapshot)
      ? getServerSnapshot()
      : getSnapshot();
  const lastSubscribe = hook.subscribe;
  const lastSelector = hook.selector;
  const hasValue = 'value' in hook;

  if (
    !hasValue ||
    !Object.is(hook.snapshot, snapshot) ||
    lastSelector !== selector
  ) {
    const nextSelection = selector(snapshot);

    hook.snapshot = snapshot;

    if (
      !hasValue ||
      !areSelectionsEqual(hook.value, nextSelection, isEqual as StoreSelectionComparator<unknown>)
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
    component.pendingLayoutEffects.push(hook);
  }

  return hook.value as T;
}

export function useImperativeHandle<T>(
  ref: RefObject<T> | ((value: T | null) => void) | null | undefined,
  create: () => T,
  deps?: unknown[],
): void {
  const component = getCurrentComponent();
  const hook = getHook(HookType.ImperativeHandle);
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
    component.pendingLayoutEffects.push(hook);
  }
}

export function useAnimation(callbacks: AnimationHookCallbacks): void {
  const component = getCurrentComponent();

  getHook(HookType.Animation).value = callbacks;
  component.animation = callbacks;
}

export function renderFunctionalComponentWithHooks(
  component: FunctionalComponentState,
  render: () => InfernoNode,
): InfernoNode {
  prepareFunctionalComponentHooks(
    component,
    component.vNode,
    component.context,
    component.isSVG,
  );

  try {
    return render();
  } finally {
    finishFunctionalComponentHooks(component);
  }
}
