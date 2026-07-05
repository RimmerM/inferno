import type { VNode } from '../core/types';
import { isFunction, isNull, isNullOrUndef } from 'inferno-shared';
import { ChildFlags, VNodeFlags } from 'inferno-vnode-flags';
import { syntheticEvents, unmountSyntheticEvent } from './events/delegation';
import {
  AnimationQueues,
  callAllAnimationHooks,
  clearVNodeDOM,
  findDOMFromVNode,
  removeVNodeDOM,
} from './utils/common';
import { unmountRef } from '../core/refs';
import {
  type FunctionalComponentState,
  unmountFunctionalComponentHooks,
} from '../core/hooks';

export function remove(
  vNode: VNode,
  parentDOM: Element,
  animations: AnimationQueues,
): void {
  unmount(vNode, animations);
  removeVNodeDOM(vNode, parentDOM, animations);
}

export function unmount(vNode, animations: AnimationQueues): void {
  const flags = vNode.flags;
  const children = vNode.children;
  let ref;

  if ((flags & VNodeFlags.Element) !== 0) {
    ref = vNode.ref;
    const props = vNode.props;

    unmountRef(ref);

    const childFlags = vNode.childFlags;

    if (!isNull(props)) {
      const keys = Object.keys(props);

      for (let i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];
        if (syntheticEvents[key]) {
          unmountSyntheticEvent(key, vNode.dom);
        }
      }
    }

    if (childFlags & ChildFlags.MultipleChildren) {
      unmountAllChildren(children, animations);
    } else if (childFlags === ChildFlags.HasVNodeChildren) {
      unmount(children as VNode, animations);
    }
  } else if (children) {
    if (flags & VNodeFlags.ComponentClass) {
      if (isFunction(children.componentWillUnmount)) {
        // TODO: Possible entrypoint
        children.componentWillUnmount();
      }

      // If we have a componentWillDisappear on this component, block children from animating
      let childAnimations = animations;
      if (isFunction(children.componentWillDisappear)) {
        childAnimations = new AnimationQueues();
        addDisappearAnimationHook(
          animations,
          children,
          children.$LI.dom,
          flags,
        );
      }

      unmountRef(vNode.ref);
      children.$UN = true;
      unmount(children.$LI, childAnimations);
    } else if (flags & VNodeFlags.ComponentFunction) {
      // If this component has an animation disappear hook, block children from animating
      let childAnimations = animations;
      ref = vNode.$H;
      if (!isNullOrUndef(ref)) {
        let domEl: Element | null = null;

        if (isFunction(ref.animation?.onDisappear)) {
          childAnimations = new AnimationQueues();
          domEl = domEl || findDOMFromVNode(vNode, true);
          addDisappearAnimationHook(
            animations,
            ref,
            domEl as Element,
            flags,
          );
        }
        unmountFunctionalComponentHooks(ref);
      }
      unmount(children, childAnimations);
    } else if (flags & VNodeFlags.Portal) {
      remove(children as VNode, vNode.ref, animations);
    } else if (flags & VNodeFlags.Fragment) {
      if (vNode.childFlags & ChildFlags.MultipleChildren) {
        unmountAllChildren(children, animations);
      }
    }
  }
}

export function unmountAllChildren(
  children: VNode[],
  animations: AnimationQueues,
): void {
  for (let i = 0, len = children.length; i < len; ++i) {
    unmount(children[i], animations);
  }
}

function createClearAllCallback(children, parentDOM) {
  return function () {
    // We need to remove children one by one because elements can be added during animation
    if (parentDOM) {
      for (let i = 0; i < children.length; i++) {
        const vNode = children[i];
        clearVNodeDOM(vNode, parentDOM, false);
      }
    }
  };
}
export function clearDOM(
  parentDOM,
  children: VNode[],
  animations: AnimationQueues,
): void {
  if (animations.componentWillDisappear.length > 0) {
    // Wait until animations are finished before removing actual dom nodes
    // Be aware that the element could be removed by a later operation
    callAllAnimationHooks(
      animations.componentWillDisappear,
      createClearAllCallback(children, parentDOM),
    );
  } else {
    // Optimization for clearing dom
    parentDOM.textContent = '';
  }
}

export function removeAllChildren(
  dom: Element,
  vNode: VNode,
  children,
  animations: AnimationQueues,
): void {
  unmountAllChildren(children, animations);

  if (vNode.flags & VNodeFlags.Fragment) {
    removeVNodeDOM(vNode, dom, animations);
  } else {
    clearDOM(dom, children, animations);
  }
}

// Only add animations to queue in browser
function addDisappearAnimationHook(
  animations: AnimationQueues,
  instanceOrRef: any | FunctionalComponentState,
  dom: Element,
  flags: VNodeFlags,
): void {
  // @ts-expect-error TODO: Here is something weird check this behavior
  animations.componentWillDisappear.push((callback) => {
    if (flags & VNodeFlags.ComponentClass) {
      instanceOrRef.componentWillDisappear(dom, callback);
    } else if (flags & VNodeFlags.ComponentFunction) {
      instanceOrRef.animation.onDisappear(dom, callback);
    }
  });
}
