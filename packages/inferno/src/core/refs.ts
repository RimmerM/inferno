import { isFunction, isNullOrUndef, warning } from 'inferno-shared';
import { safeCall1 } from '../DOM/utils/common';
import type { ForwardRef, InfernoNode, Ref, RefObject } from './types';

export function createRef<T = Element>(): RefObject<T> {
  return {
    current: null,
  };
}

// TODO: Make this return value typed
export function forwardRef<T = any, P = any>(
  render: (
    props: Readonly<{ children?: InfernoNode }> & Readonly<P>,
    ref: Ref<T> | RefObject<T> | null,
  ) => InfernoNode,
): ForwardRef<P, T> {
  if (process.env.NODE_ENV !== 'production') {
    if (!isFunction(render)) {
      warning(
        `forwardRef requires a render function but was given ${
          render === null ? 'null' : typeof render
        }.`,
      );

      return undefined as any;
    }
  }

  return {
    render,
  } as ForwardRef<P, T>;
}

export function unmountRef(ref): void {
  if (!isNullOrUndef(ref)) {
    if (!safeCall1(ref, null) && (ref as RefObject<unknown>).current) {
      ref.current = null;
    }
  }
}

export function mountRef(ref, value, lifecycle: Array<() => void>): void {
  if (!isNullOrUndef(ref) && (isFunction(ref) || ref.current !== void 0)) {
    lifecycle.push(() => {
      if (!safeCall1(ref, value) && ref.current !== void 0) {
        ref.current = value;
      }
    });
  }
}
