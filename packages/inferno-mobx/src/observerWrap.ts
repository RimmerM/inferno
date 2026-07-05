import {
  _HI as normalizeRoot,
  createComponentVNode,
  type InfernoNode,
  render,
  useLayoutEffect,
  type VNode,
} from 'inferno';
import { Reaction } from 'mobx';
import { throwError, warning } from 'inferno-shared';
import { VNodeFlags } from 'inferno-vnode-flags';

type Render = (
  properties?: any,
  context?: Record<string, unknown>,
) => InfernoNode;

interface InnerProperties {
  readonly context: unknown;
  readonly dispose: () => void;
  readonly props: unknown;
  readonly self: VNode;
  readonly track: (f: () => void) => void;
}

function innerVNode<T>(
  type: (p: InnerProperties) => T,
  properties: InnerProperties,
): VNode {
  if (process.env.NODE_ENV !== 'production') {
    Object.freeze(properties);
  }
  return createComponentVNode(
    VNodeFlags.ComponentFunction,
    type,
    properties,
    undefined,
  );
}

function makeProxy(target: VNode): { $V: InfernoNode } {
  return {
    get $V() {
      return target.children;
    },
    set $V(value) {
      target.children = value;
    },
  };
}

export function observerWrap<T extends Render>(base: T): typeof base {
  if (process.env.NODE_ENV !== 'production') {
    if (typeof base !== 'function') {
      throwError(
        `observerWrap requires a function to wrap, got ${typeof base} instead`,
      );
    }
    if (base.prototype?.render) {
      throwError('observerWrap should not be applied to constructors.');
    }
    // @ts-expect-error there is no type for this
    if (base.isMobXInfernoObserver) {
      warning(
        "'observerWrap' was used on a component that already has 'observerWrap' applied. Please only apply once",
      );
    }
  }
  function tracked({
    context,
    dispose,
    props,
    self,
    track,
  }: InnerProperties): ReturnType<typeof base> {
    let result;
    let caught;
    track(() => {
      try {
        result = base.call(self, props, context);
      } catch (error) {
        caught = error;
      }
    });
    if (caught) {
      throw caught;
    }
    useLayoutEffect(() => dispose, [dispose]);
    return result;
  }
  function wrapper(this: VNode, props, context): VNode {
    // eslint-disable-next-line prefer-const
    let proxy;
    const reaction = new Reaction(base.name, () => {
      let next;
      reaction.track(() => {
        next = normalizeRoot(base.call(this, props, context));
      });
      if (next) {
        // indirectly call patch as inferno does not export patch
        render(next, proxy, null, context);
      }
    });
    const inner = innerVNode(tracked, {
      context,
      dispose: reaction.dispose.bind(reaction),
      props,
      self: this,
      track: reaction.track.bind(reaction),
    });
    proxy = makeProxy(inner);
    return inner;
  }
  wrapper.defaultProps = (base as any).defaultProps;
  if (process.env.NODE_ENV !== 'production') {
    wrapper.isMobXInfernoObserver = true;
  }
  return wrapper as any;
}
