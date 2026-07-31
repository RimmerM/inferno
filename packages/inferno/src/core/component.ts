import type { Inferno, InfernoNode, IComponent, VNode } from './types';
import { isFunction, isNullOrUndef, throwError } from 'inferno-shared';
import { updateClassComponent } from '../DOM/patching';
import {
  AnimationQueues,
  callAll,
  callAllAnimationHooks,
  EMPTY_OBJ,
  findDOMFromVNode,
  renderCheck,
} from '../DOM/utils/common';
import {
  flushPendingEffects,
  flushUpdates,
  hasScheduledUpdates,
  NESTED_UPDATE_LIMIT,
  registerClassUpdateQueue,
  scheduleUpdate,
  tooManyUpdates,
} from './scheduler';
import {
  type Context,
  type ContextOverrides,
  getDefaultContext,
} from './context';

const COMPONENTS_QUEUE: Array<Component<any, any>> = [];

function queueStateChanges<P, S>(
  component: Component<P, S>,
  newState: any,
  callback: (() => void) | undefined,
  force: boolean,
): void {
  const pending = component.$PS;

  if (isFunction(newState)) {
    newState = newState(
      pending ? { ...component.state, ...pending } : component.state,
      component.props,
      component.context,
    );
  }

  if (isNullOrUndef(pending)) {
    component.$PS = newState;
  } else {
    for (const stateKey in newState) {
      pending[stateKey] = newState[stateKey];
    }
  }

  if (!component.$BR) {
    if (!renderCheck.v) {
      if (COMPONENTS_QUEUE.length === 0 && !hasScheduledUpdates()) {
        // This commits synchronously without going through flushUpdates, so
        // it has to settle outstanding effects itself.
        flushPendingEffects();
        applyState(component, force);
        if (isFunction(callback)) {
          callback.call(component);
        }
        return;
      }
    }
    if (!COMPONENTS_QUEUE.includes(component)) {
      COMPONENTS_QUEUE.push(component);
    }
    if (force) {
      component.$F = true;
    }
    scheduleUpdate();
    if (isFunction(callback)) {
      let QU = component.$QU;

      if (!QU) {
        QU = component.$QU = [] as Array<() => void>;
      }
      QU.push(callback);
    }
  } else if (isFunction(callback)) {
    (component.$L as Array<() => void>).push(callback.bind(component));
  }
}

function callSetStateCallbacks(component): void {
  const queue = component.$QU;

  for (let i = 0; i < queue.length; ++i) {
    queue[i].call(component);
  }

  component.$QU = null;
}

function rerenderClassComponents(): void {
  // Budget scales with the work actually queued, so it only trips on a
  // component that keeps re-queueing itself without ever settling.
  const limit = (COMPONENTS_QUEUE.length + 1) * NESTED_UPDATE_LIMIT;
  let component: Component<any, any> | undefined;
  let processed = 0;

  while ((component = COMPONENTS_QUEUE.shift())) {
    if (processed++ > limit) {
      COMPONENTS_QUEUE.length = 0;
      tooManyUpdates();
    }

    if (!component.$UN) {
      const force = component.$F;
      component.$F = false;
      applyState(component, force);

      if (component.$QU) {
        callSetStateCallbacks(component);
      }
    }
  }
}

registerClassUpdateQueue({
  clear: () => {
    COMPONENTS_QUEUE.length = 0;
  },
  flush: rerenderClassComponents,
  hasPending: () => COMPONENTS_QUEUE.length > 0,
});

export function rerender(): void {
  flushUpdates();
}

function applyState<P, S>(component: Component<P, S>, force: boolean): void {
  if (force || !component.$BR) {
    const pendingState = component.$PS;

    component.$PS = null;

    const lifecycle: Array<() => void> = [];
    const animations: AnimationQueues = new AnimationQueues();

    renderCheck.v = true;

    updateClassComponent(
      component,
      { ...component.state, ...pendingState },
      component.props,
      (findDOMFromVNode(component.$LI, true) as Element).parentNode as Element,
      component.context,
      component.$SVG,
      force,
      null,
      lifecycle,
      animations,
    );
    callAll(lifecycle);
    callAllAnimationHooks(animations.componentDidAppear);

    renderCheck.v = false;
  } else {
    component.state = component.$PS as any;
    component.$PS = null;
  }
}
export type ComponentType<P = Record<string, unknown>> =
  | typeof Component<P>
  | Inferno.StatelessComponent<P>;

export abstract class Component<
  P = Record<string, unknown>,
  S = Record<string, unknown>,
> implements IComponent<P, S>
{
  // Public
  public state: Readonly<S | null> = null;
  public props: Readonly<{ children?: InfernoNode }> & Readonly<P>;
  public context: Context;
  public displayName?: string;

  // Internal properties
  public $BR: boolean = false; // BLOCK RENDER
  public $BS: boolean = true; // BLOCK STATE
  public $PS: Partial<S> | null = null; // PENDING STATE (PARTIAL or FULL)
  public $LI: any = null; // LAST INPUT
  public $UN: boolean = false; // UNMOUNTED
  public $CX: Context | null = null; // CHILDCONTEXT
  public $QU: Array<() => void> | null = null; // QUEUE
  public $N: boolean = false; // Uses new lifecycle API Flag
  public $SSR: boolean = false; // Server side rendering flag, true when rendering on server
  public $L: Array<() => void> | null = null; // Current lifecycle of this component
  public $SVG: boolean = false; // Flag to keep track if component is inside SVG tree
  public $F: boolean = false; // Force update flag

  constructor(props?: P, context?: Context) {
    this.props = (props || EMPTY_OBJ) as Readonly<{ children?: InfernoNode }> &
      Readonly<P>;
    this.context = context || getDefaultContext();
  }

  public forceUpdate(callback?: (() => void) | undefined): void {
    if (this.$UN) {
      return;
    }
    // Do not allow double render during force update
    queueStateChanges(this, {} as any, callback, true);
  }

  public setState<K extends keyof S>(
    newState:
      | ((
          prevState: Readonly<S>,
          props: Readonly<{ children?: InfernoNode } & P>,
        ) => Pick<S, K> | S | null)
      | (Pick<S, K> | S | null),
    callback?: () => void,
  ): void {
    if (this.$UN) {
      return;
    }
    if (!this.$BS) {
      queueStateChanges(this, newState, callback, false);
    } else {
      // Development warning
      if (process.env.NODE_ENV !== 'production') {
        throwError(
          'cannot update state via setState() in constructor. Instead, assign to `this.state` directly or define a `state = {};`',
        );
      }
    }
  }

  public componentDidMount?(): void;

  public componentWillMount?(): void;

  public componentWillReceiveProps?(
    nextProps: Readonly<{ children?: InfernoNode } & P>,
    nextContext: Context,
  ): void;

  public shouldComponentUpdate?(
    nextProps: Readonly<{ children?: InfernoNode } & P>,
    nextState: Readonly<S>,
    context: Context,
  ): boolean;

  public componentWillUpdate?(
    nextProps: Readonly<{ children?: InfernoNode } & P>,
    nextState: Readonly<S>,
    context: Context,
  ): void;

  public componentDidUpdate?(
    prevProps: Readonly<{ children?: InfernoNode } & P>,
    prevState: Readonly<S>,
    snapshot: any,
  ): void;

  public componentWillUnmount?(): void;

  public componentDidAppear?(domNode: Element): void;

  public componentWillDisappear?(domNode: Element, callback: () => void): void;

  public componentWillMove?(
    parentVNode: VNode,
    parentDOM: Element,
    dom: Element,
  ): void;

  public getChildContext?(): ContextOverrides | null;

  public getSnapshotBeforeUpdate?(
    prevProps: Readonly<{ children?: InfernoNode } & P>,
    prevState: Readonly<S>,
  ): any;

  public static defaultProps?: Record<string, unknown> | null = null;

  public static getDerivedStateFromProps?(nextProps: any, state: any): any;

  /* eslint-disable */
  // @ts-ignore
  public render(props: Readonly<{ children?: InfernoNode } & P>, state: Readonly<S>, context: Context): InfernoNode {
    return null;
  }
}
