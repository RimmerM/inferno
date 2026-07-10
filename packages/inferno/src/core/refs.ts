import { isFunction, isNullOrUndef } from 'inferno-shared';
import { safeCall1 } from '../DOM/utils/common';
import type { RefObject } from './types';

export function createRef<T = Element>(): RefObject<T> {
  return {
    current: null,
  };
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
