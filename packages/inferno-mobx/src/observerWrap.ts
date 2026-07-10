import {
  type InfernoNode,
  rerender,
  useLayoutEffect,
  useRef,
  useState,
} from 'inferno';
import { Reaction } from 'mobx';
import { throwError, warning } from 'inferno-shared';

type Render = (
  properties?: any,
  context?: Record<string, unknown>,
) => InfernoNode;

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
  function wrapper(this: unknown, props, context): ReturnType<typeof base> {
    const [, setVersion] = useState(0);
    const reactionRef = useRef<Reaction>();
    let reaction = reactionRef.current;

    if (!reaction) {
      reaction = reactionRef.current = new Reaction(base.name, () => {
        setVersion((version) => version + 1);
        rerender();
      });
    }

    useLayoutEffect(() => () => reaction!.dispose(), [reaction]);

    let result;
    let caught;
    reaction.track(() => {
      try {
        result = base.call(this, props, context);
      } catch (error) {
        caught = error;
      }
    });

    if (caught) {
      throw caught;
    }

    return result as ReturnType<typeof base>;
  }
  wrapper.defaultProps = (base as any).defaultProps;
  if (process.env.NODE_ENV !== 'production') {
    wrapper.isMobXInfernoObserver = true;
  }
  return wrapper as any;
}
