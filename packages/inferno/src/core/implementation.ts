import type {
  InfernoNode,
  MemoizedComponent,
  ParentDOM,
  Ref,
  VNode,
} from './types';
import { ChildFlags, VNodeFlags } from 'inferno-vnode-flags';
import {
  isArray,
  isFunction,
  isInvalid,
  isNull,
  isNullOrUndef,
  isString,
  isStringOrNumber,
  throwError,
} from 'inferno-shared';
import {
  throwIfObjectIsNotVNode,
  validateChildFlags,
  validateVNodeElementChildren,
} from './validate';
import { Fragment, mergeUnsetProperties, options } from './../DOM/utils/common';
import { type Component, type ComponentType } from './component';
import { isMemoizedComponent } from './memo';

const keyPrefix = '$';

function V(
  childFlags: ChildFlags,
  children,
  className: string | null | undefined,
  flags: VNodeFlags,
  key,
  props,
  ref,
  type,
): void {
  if (process.env.NODE_ENV !== 'production') {
    this.isValidated = false;
  }
  this.childFlags = childFlags;
  this.children = children;
  this.className = className;
  this.dom = null;
  this.flags = flags;
  this.key = key === void 0 ? null : key;
  this.props = props === void 0 ? null : props;
  this.ref = ref === void 0 ? null : ref;
  this.type = type;
  /*
   * Declared up front so every vNode shares one shape and these can be written
   * with a plain store. They must start as undefined: hooks.ts uses a null $H
   * to mark "this vNode rendered without calling any hook", which is a
   * different state from "never rendered".
   */
  this.$H = undefined;
  this.$CX = undefined;
}

export function createVNode<P>(
  flags: VNodeFlags,
  type: string,
  className?: string | null,
  children?: InfernoNode,
  childFlags?: ChildFlags,
  props?: Readonly<P> | null,
  key?: string | number | null,
  ref?: Ref | null,
): VNode {
  if (process.env.NODE_ENV !== 'production') {
    if (flags & VNodeFlags.Component) {
      throwError(
        'Creating Component vNodes using createVNode is not allowed. Use Inferno.createComponentVNode method.',
      );
    }
  }
  const childFlag: ChildFlags =
    childFlags === void 0 ? ChildFlags.HasInvalidChildren : childFlags;
  const vNode = new V(
    childFlag,
    children,
    className,
    flags,
    key,
    props,
    ref,
    type,
  ) as VNode;

  if (options.createVNode) {
    options.createVNode(vNode);
  }

  if (childFlag === ChildFlags.UnknownChildren) {
    normalizeChildren(vNode, vNode.children);
  }

  if (process.env.NODE_ENV !== 'production') {
    if (childFlag !== ChildFlags.UnknownChildren) {
      validateChildFlags(vNode);
    }
    validateVNodeElementChildren(vNode);
  }

  return vNode;
}

function mergeDefaultProps(type, props) {
  // set default props
  const defaultProps = type.defaultProps;

  if (isNullOrUndef(defaultProps)) {
    return props;
  }

  if (isNullOrUndef(props)) {
    return { ...defaultProps };
  }

  return mergeUnsetProperties(props, defaultProps);
}

function resolveComponentFlags(flags: VNodeFlags, type): VNodeFlags {
  if (flags & VNodeFlags.ComponentKnown) {
    return flags;
  }

  if (type.prototype?.render) {
    return VNodeFlags.ComponentClass;
  }

  if (isMemoizedComponent(type)) {
    return VNodeFlags.MemoComponent;
  }

  return VNodeFlags.ComponentFunction;
}

export function createComponentVNode<P>(
  flags: VNodeFlags,
  type:
    | Function
    | ComponentType<P>
    | Component<P, unknown>
    | MemoizedComponent<P>,
  props?: Readonly<P> | null,
  key?: null | string | number,
  ref?: Ref | null,
): VNode {
  if (process.env.NODE_ENV !== 'production') {
    if ((flags & VNodeFlags.HtmlElement) !== 0) {
      throwError(
        'Creating element vNodes using createComponentVNode is not allowed. Use Inferno.createVNode method.',
      );
    }
  }

  flags = resolveComponentFlags(flags, type);

  let componentProps = mergeDefaultProps(type, props);

  // Function component refs are regular props. JSX transforms pass ref as the
  // dedicated VNode argument, so move it into props once at creation time.
  if (flags & VNodeFlags.ComponentFunction && ref !== void 0) {
    if (isNullOrUndef(componentProps)) {
      componentProps = { ref };
    } else {
      componentProps.ref = ref;
    }
    ref = null;
  } else if (
    flags & VNodeFlags.ComponentClass &&
    !isNullOrUndef(componentProps) &&
    componentProps.ref !== void 0
  ) {
    if (ref === void 0) {
      ref = componentProps.ref;
    }
    componentProps.ref = undefined;
  }

  const vNode = new V(
    ChildFlags.HasInvalidChildren,
    null,
    null,
    flags,
    key,
    componentProps,
    ref,
    type,
  ) as VNode;

  if (isFunction(options.createVNode)) {
    options.createVNode(vNode);
  }

  return vNode;
}

export function createTextVNode(
  text?: string | boolean | null | number,
  key?: string | number | null,
): VNode {
  return new V(
    ChildFlags.HasInvalidChildren,
    isNullOrUndef(text) || text === true || text === false ? '' : text,
    null,
    VNodeFlags.Text,
    key,
    null,
    null,
    null,
  ) as VNode;
}

export function createFragment(
  children: any,
  childFlags: ChildFlags,
  key?: string | number | null,
): VNode {
  const fragment = createVNode(
    VNodeFlags.Fragment,
    VNodeFlags.Fragment as any,
    null,
    children,
    childFlags,
    null,
    key,
    null,
  );

  switch (fragment.childFlags) {
    case ChildFlags.HasInvalidChildren:
      fragment.children = createVoidVNode();
      fragment.childFlags = ChildFlags.HasVNodeChildren;
      break;
    case ChildFlags.HasTextChildren:
      fragment.children = [createTextVNode(children)];
      fragment.childFlags = ChildFlags.HasNonKeyedChildren;
      break;
    default:
      break;
  }

  return fragment;
}

export function normalizeProps(vNode: VNode): VNode {
  const props = vNode.props;

  if (props) {
    const flags = vNode.flags;

    if (flags & VNodeFlags.Element) {
      if (props.children !== void 0 && isNullOrUndef(vNode.children)) {
        normalizeChildren(vNode, props.children);
      }
      if (props.className !== void 0) {
        if (isNullOrUndef(vNode.className)) {
          vNode.className = props.className || null;
        }
        props.className = undefined;
      }
    }
    if (props.key !== void 0) {
      vNode.key = props.key;
      props.key = undefined;
    }
    if (props.ref !== void 0 && !(flags & VNodeFlags.ComponentFunction)) {
      vNode.ref = props.ref;
      props.ref = undefined;
    }
  }

  return vNode;
}

/*
 * Fragment is different from normal vNode,
 * because when it needs to be cloned we need to clone its children too
 * But not normalize, because otherwise those possibly get KEY and re-mount
 */
function cloneFragment(vNodeToClone: VNode): VNode {
  const oldChildren = vNodeToClone.children;
  const childFlags = vNodeToClone.childFlags;

  return createFragment(
    childFlags === ChildFlags.HasVNodeChildren
      ? directClone(oldChildren as VNode)
      : (oldChildren as VNode[]).map(directClone),
    childFlags,
    vNodeToClone.key,
  );
}

export function directClone(vNodeToClone: VNode): VNode {
  const flags = vNodeToClone.flags & VNodeFlags.ClearInUse;
  let props = vNodeToClone.props;

  if (flags & VNodeFlags.Component) {
    if (!isNull(props)) {
      const propsToClone = props;
      props = {};
      for (const key in propsToClone) {
        props[key] = propsToClone[key];
      }
    }
  }
  if ((flags & VNodeFlags.Fragment) === 0) {
    return new V(
      vNodeToClone.childFlags,
      vNodeToClone.children,
      vNodeToClone.className,
      flags,
      vNodeToClone.key,
      props,
      vNodeToClone.ref,
      vNodeToClone.type,
    ) as VNode;
  }

  return cloneFragment(vNodeToClone);
}

export function createVoidVNode(): VNode {
  return createTextVNode('', null);
}

export function createPortal(children, container: ParentDOM): VNode {
  const normalizedRoot = normalizeRoot(children);

  return createVNode(
    VNodeFlags.Portal,
    VNodeFlags.Portal as any,
    null,
    normalizedRoot,
    ChildFlags.UnknownChildren,
    null,
    normalizedRoot.key,
    container as any, // Should there be own prop for this?
  );
}

export function _normalizeVNodes(
  nodes: any[],
  result: VNode[],
  index: number,
  currentKey: string,
): void {
  for (const len = nodes.length; index < len; index++) {
    let n = nodes[index];

    if (!isInvalid(n)) {
      const newKey: string = currentKey + keyPrefix + index;

      if (isArray(n)) {
        _normalizeVNodes(n, result, 0, newKey);
      } else {
        if (isStringOrNumber(n)) {
          n = createTextVNode(n, newKey);
        } else {
          if (process.env.NODE_ENV !== 'production') {
            throwIfObjectIsNotVNode(n);
          }
          const oldKey = n.key;
          const isPrefixedKey = isString(oldKey) && oldKey[0] === keyPrefix;

          if (n.flags & VNodeFlags.InUseOrNormalized || isPrefixedKey) {
            n = directClone(n);
          }

          n.flags |= VNodeFlags.Normalized;

          if (!isPrefixedKey) {
            if (isNull(oldKey)) {
              n.key = newKey;
            } else {
              n.key = currentKey + oldKey;
            }
          } else if (oldKey.substring(0, currentKey.length) !== currentKey) {
            n.key = currentKey + oldKey;
          }
        }

        result.push(n);
      }
    }
  }
}

export function getFlagsForElementVnode(type: string): VNodeFlags {
  switch (type) {
    case 'svg':
      return VNodeFlags.SvgElement;
    case 'input':
      return VNodeFlags.InputElement;
    case 'select':
      return VNodeFlags.SelectElement;
    case 'textarea':
      return VNodeFlags.TextareaElement;
    // @ts-expect-error Fragment is special case
    case Fragment:
      return VNodeFlags.Fragment;
    default:
      return VNodeFlags.HtmlElement;
  }
}

export function normalizeChildren(vNode: VNode, children): VNode {
  let newChildren;
  let newChildFlags: ChildFlags = ChildFlags.HasInvalidChildren;

  // Don't change children to match strict equal (===) true in patching
  if (isInvalid(children)) {
    newChildren = children;
  } else if (isStringOrNumber(children)) {
    newChildFlags = ChildFlags.HasTextChildren;
    newChildren = children;
  } else if (isArray(children)) {
    const len = children.length;

    for (let i = 0; i < len; ++i) {
      let n = children[i];

      if (isInvalid(n) || isArray(n)) {
        newChildren = newChildren || children.slice(0, i);

        _normalizeVNodes(children, newChildren, i, '');
        break;
      } else if (isStringOrNumber(n)) {
        newChildren = newChildren || children.slice(0, i);
        newChildren.push(createTextVNode(n, keyPrefix + i));
      } else {
        if (process.env.NODE_ENV !== 'production') {
          throwIfObjectIsNotVNode(n);
        }
        const key = n.key;
        const needsCloning: boolean =
          (n.flags & VNodeFlags.InUseOrNormalized) > 0;
        const isNullKey: boolean = isNull(key);
        const isPrefixed: boolean = isString(key) && key[0] === keyPrefix;

        if (needsCloning || isNullKey || isPrefixed) {
          newChildren = newChildren || children.slice(0, i);
          if (needsCloning || isPrefixed) {
            n = directClone(n);
          }
          if (isNullKey || isPrefixed) {
            n.key = keyPrefix + i;
          }
          newChildren.push(n);
        } else if (newChildren) {
          newChildren.push(n);
        }

        n.flags |= VNodeFlags.Normalized;
      }
    }
    newChildren = newChildren || children;
    if (newChildren.length === 0) {
      newChildFlags = ChildFlags.HasInvalidChildren;
    } else {
      newChildFlags = ChildFlags.HasKeyedChildren;
    }
  } else {
    newChildren = children;
    newChildren.flags |= VNodeFlags.Normalized;

    if (children.flags & VNodeFlags.InUseOrNormalized) {
      newChildren = directClone(children as VNode);
    }
    newChildFlags = ChildFlags.HasVNodeChildren;
  }

  vNode.children = newChildren;
  vNode.childFlags = newChildFlags;

  return vNode;
}

export function normalizeRoot(input): VNode {
  if (isInvalid(input) || isStringOrNumber(input)) {
    return createTextVNode(input, null);
  }
  if (isArray(input)) {
    return createFragment(input, ChildFlags.UnknownChildren, null);
  }

  return input.flags & VNodeFlags.InUse ? directClone(input) : input;
}
