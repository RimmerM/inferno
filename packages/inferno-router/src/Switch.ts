import {
  Component,
  type Context,
  createComponentVNode,
  readContext,
  type VNode,
} from 'inferno';
import { matchPath } from './matchPath';
import { invariant, warning } from './utils';
import { isArray, isInvalid } from 'inferno-shared';
import { type IRouteProps, type Match } from './Route';
import { routerContext } from './Router';

function getMatch(
  pathname: string,
  { path, exact, strict, sensitive, loader, from },
  router: { route; initialData?: any },
): Match<any> | null {
  path ??= from;
  const { initialData, route } = router; // This is the parent route

  return path
    ? matchPath(pathname, {
        path,
        exact,
        strict,
        sensitive,
        loader,
        initialData,
      })
    : route.match;
}

interface SwitchState {
  match: Match<any> | null;
  _child: any;
}

function extractFirstMatchFromChildren(
  pathname: string,
  children,
  router,
): SwitchState {
  if (isArray(children)) {
    for (let i = 0; i < children.length; ++i) {
      const nestedMatch = extractFirstMatchFromChildren(
        pathname,
        children[i],
        router,
      );
      if (nestedMatch.match) {
        return nestedMatch;
      }
    }
    return {
      match: null,
      _child: null,
    };
  }

  return {
    _child: children,
    match: getMatch(pathname, children.props, router),
  };
}

export class Switch extends Component<IRouteProps, SwitchState> {
  constructor(props, context: Context) {
    super(props, context);

    if (process.env.NODE_ENV !== 'production') {
      invariant(
        readContext(context, routerContext),
        'You should not use <Switch> outside a <Router>',
      );
    }

    const router = readContext(context, routerContext)!;
    const { location, children } = props;
    const pathname = (location || router.route.location).pathname;
    const { match, _child } = extractFirstMatchFromChildren(
      pathname,
      children,
      router,
    );

    this.state = {
      _child,
      match,
    };
  }

  public componentWillReceiveProps(
    nextProps: IRouteProps,
    nextContext: Context,
  ): void {
    if (process.env.NODE_ENV !== 'production') {
      warning(
        !(nextProps.location && !this.props.location),
        '<Switch> elements should not change from uncontrolled to controlled (or vice versa). You initially used no "location" prop and then provided one on a subsequent render.',
      );

      warning(
        !(!nextProps.location && this.props.location),
        '<Switch> elements should not change from controlled to uncontrolled (or vice versa). You provided a "location" prop initially but omitted it on a subsequent render.',
      );
    }

    const router = readContext(nextContext, routerContext)!;
    const { location, children } = nextProps;
    const pathname = (location || router.route.location).pathname;
    const { match, _child } = extractFirstMatchFromChildren(
      pathname,
      children,
      router,
    );

    this.setState({ match, _child });
  }

  public render(
    { children, location }: IRouteProps,
    { match, _child }: SwitchState,
    context: Context,
  ): VNode | null {
    if (isInvalid(children)) {
      return null;
    }

    if (match) {
      location ??= readContext(context, routerContext)!.route.location;
      return createComponentVNode(_child.flags, _child.type, {
        ..._child.props,
        ...{ location, computedMatch: match },
      });
    }

    return null;
  }
}
