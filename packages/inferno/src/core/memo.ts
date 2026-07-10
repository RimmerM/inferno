import type { Inferno, MemoizedComponent } from './types';
import { isFunction, isNullOrUndef, warning } from 'inferno-shared';

const memoType =
  typeof Symbol === 'function' && Symbol.for
    ? Symbol.for('inferno.memo')
    : 0xeac7;

export function isMemoizedComponent(type): type is MemoizedComponent<any> {
  return !isNullOrUndef(type) && type.$$typeof === memoType;
}

export function shallowEqualProps(lastProps, nextProps): boolean {
  if (Object.is(lastProps, nextProps)) {
    return true;
  }

  if (isNullOrUndef(lastProps) || isNullOrUndef(nextProps)) {
    return false;
  }

  const lastKeys = Object.keys(lastProps);
  const nextKeys = Object.keys(nextProps);

  if (lastKeys.length !== nextKeys.length) {
    return false;
  }

  for (let i = 0; i < lastKeys.length; i++) {
    const key = lastKeys[i];

    if (
      !Object.prototype.hasOwnProperty.call(nextProps, key) ||
      !Object.is(lastProps[key], nextProps[key])
    ) {
      return false;
    }
  }

  return true;
}

export function memo<P>(
  render: Inferno.StatelessComponent<P>,
  compare?: ((lastProps: Readonly<P>, nextProps: Readonly<P>) => boolean) | null,
): MemoizedComponent<P> {
  if (process.env.NODE_ENV !== 'production') {
    if (!isFunction(render)) {
      warning(
        `memo requires a functional component but was given ${
          render === null ? 'null' : typeof render
        }.`,
      );

      return undefined as any;
    }

    if (!isNullOrUndef(compare) && !isFunction(compare)) {
      warning(
        `memo compare must be a function or null but was given ${typeof compare}.`,
      );
    }
  }

  const component = {
    $$typeof: memoType,
    compare: isFunction(compare) ? compare : null,
    render,
  } as MemoizedComponent<P>;
  const defaultProps = (render as any).defaultProps;

  if (!isNullOrUndef(defaultProps)) {
    component.defaultProps = defaultProps;
  }

  return component;
}
