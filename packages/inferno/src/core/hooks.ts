import type { ContextObject, InfernoNode, RefObject, VNode } from './types';
import { isFunction, isNullOrUndef, throwError } from 'inferno-shared';
import {
  registerFunctionalUpdateQueue,
  scheduleUpdate,
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
type StoreSelectionComparator<T> = (lastSelection: T, nextSelection: T) => boolean;

const resolvedPromise = Promise.resolve();

// Keep these values in sync with hookTypeGlobals in jest.config.js.
declare const enum HookType {
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
  deps?: readonly unknown[] | null;
  dispatch?: (value: unknown) => void;
  getSnapshot?: SnapshotGetter<unknown>;
  isEqual?: StoreSelectionComparator<unknown>;
  ref?: RefObject<unknown> | ((value: unknown) => void) | null;
  reducer?: Reducer<unknown, unknown>;
  selector?: StoreSelector<unknown, unknown>;
  snapshot?: unknown;
  subscribe?: StoreSubscribe;
  type?: HookType;
  value?: unknown;
}

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
  context: ContextObject;
  hookCount?: number;
  hooks: Hook[] | null;
  isServer: boolean;
  isSVG: boolean;
  parentDOM: Element | null;
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
let currentParentDOM: Element | null = null;
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
    const previouslyRenderedWithoutHooks = currentVNode.$H === null;

    currentComponent = setFunctionalComponentState(
      currentVNode,
      createFunctionalComponentState(
        currentVNode,
        currentContext!,
        currentIsSVG,
        currentParentDOM,
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

function getHook(component: FunctionalComponentState, type: HookType): Hook {
  const hooks = component.hooks || (component.hooks = []);
  const index = currentHookIndex++;
  let hook = hooks[index];

  if (isNullOrUndef(hook)) {
    hook = hooks[index] = {};

    if (process.env.NODE_ENV !== 'production') {
      hook.type = type;
    }
  } else if (process.env.NODE_ENV !== 'production' && hook.type !== type) {
    throwError('hooks must be called in the same order on every render.');
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
  if (component.unmounted) {
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
    create: hook.create!,
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
  parentDOM: Element | null = null,
  isServer = false,
): FunctionalComponentState {
  const component: FunctionalComponentState = {
    animation: null,
    context,
    hooks: null,
    isServer,
    isSVG,
    parentDOM,
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
export function setFunctionalComponentState(vNode: VNode, component: null): null;
export function setFunctionalComponentState(
  vNode: VNode,
  component: FunctionalComponentState | null,
): FunctionalComponentState | null {
  Object.defineProperty(vNode, '$H', {
    configurable: true,
    value: component,
    writable: true,
  });

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
): void {
  if (
    process.env.NODE_ENV !== 'production' &&
    component.renderCount! > 0 &&
    currentHookIndex !== component.hookCount
  ) {
    throwError('hooks must be called in the same order on every render.');
  }

  if (process.env.NODE_ENV !== 'production') {
    component.renderCount!++;
  }
}

export function commitFunctionalComponentEffects(
  component: FunctionalComponentState,
  lifecycle: Array<() => void>,
): void {
  if (!isNullOrUndef(component.pendingLayoutEffects)) {
    const effects = component.pendingLayoutEffects;
    component.pendingLayoutEffects = null;

    lifecycle.push(() => {
      for (let i = 0; i < effects.length; i++) {
        runEffect(effects[i]);
      }
    });
  }

  if (!isNullOrUndef(component.pendingEffects)) {
    const effects = component.pendingEffects;
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

  const hooks = component.hooks;

  if (isNullOrUndef(hooks)) {
    return;
  }

  for (let i = 0; i < hooks.length; i++) {
    cleanupHook(hooks[i]);
  }
}

function rerenderFunctionalComponents(): void {
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

registerFunctionalUpdateQueue({
  flush: rerenderFunctionalComponents,
  hasPending: () => functionalComponentQueue.length > 0,
});

export function useState<S>(
  initialState: S | (() => S),
): [S, (value: HookAction<S>) => void] {
  const component = getCurrentComponent();
  const hook = getHook(component, HookType.State);

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
  const hook = getHook(component, HookType.Reducer);

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

export function useRef<T = undefined>(): { current: T | undefined };
export function useRef<T>(initialValue: T): { current: T };
export function useRef<T>(initialValue?: T): { current: T | undefined } {
  const component = getCurrentComponent();
  const hook = getHook(component, HookType.Ref);

  if (!('value' in hook)) {
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
  const hook = getHook(component, HookType.Effect);

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
  const hook = getHook(component, HookType.LayoutEffect);

  if (depsChanged(hook.deps, deps)) {
    hook.create = create;
    hook.deps = isNullOrUndef(deps) ? null : deps;
    queueEffect(component, hook, true);
  }
}

export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const component = getCurrentComponent();
  const hook = getHook(component, HookType.Memo);

  if (!('value' in hook) || depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = isNullOrUndef(deps) ? null : deps;
  }

  return hook.value as T;
}

export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: readonly unknown[],
): T {
  return useMemo(() => callback, deps);
}

export function useSyncExternalStore<T>(
  subscribe: StoreSubscribe,
  getSnapshot: SnapshotGetter<T>,
  getServerSnapshot?: SnapshotGetter<T>,
): T {
  const component = getCurrentComponent();
  const hook = getHook(component, HookType.ExternalStore);
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
  const hook = getHook(component, HookType.ExternalStoreWithSelector);
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
  const hook = getHook(component, HookType.ImperativeHandle);
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

  getHook(component, HookType.Animation).value = callbacks;
  component.animation = callbacks;
}

export function renderFunctionalComponentWithHooks(
  vNode: VNode,
  context: ContextObject,
  isSVG: boolean,
  parentDOM: Element | null,
  isServer: boolean,
  render: () => InfernoNode,
): InfernoNode {
  const lastComponent = currentComponent;
  const lastContext = currentContext;
  const lastHookIndex = currentHookIndex;
  const lastIsServer = currentIsServer;
  const lastIsSVG = currentIsSVG;
  const lastParentDOM = currentParentDOM;
  const lastVNode = currentVNode;
  const component = vNode.$H;

  currentComponent = component || null;
  currentContext = context;
  currentHookIndex = 0;
  currentIsServer = isServer;
  currentIsSVG = isSVG;
  currentParentDOM = parentDOM;
  currentVNode = vNode;

  if (!isNullOrUndef(component)) {
    component.context = context;
    component.isServer = isServer;
    component.isSVG = isSVG;
    component.parentDOM = parentDOM;
    component.vNode = vNode;
    prepareFunctionalComponentHooks(component);
  }

  try {
    return renderWithContext(context, vNode, render);
  } finally {
    try {
      if (!isNullOrUndef(currentComponent)) {
        finishFunctionalComponentHooks(currentComponent);
      } else if (process.env.NODE_ENV !== 'production') {
        setFunctionalComponentState(vNode, null);
      }
    } finally {
      currentComponent = lastComponent;
      currentContext = lastContext;
      currentHookIndex = lastHookIndex;
      currentIsServer = lastIsServer;
      currentIsSVG = lastIsSVG;
      currentParentDOM = lastParentDOM;
      currentVNode = lastVNode;
    }
  }
}
