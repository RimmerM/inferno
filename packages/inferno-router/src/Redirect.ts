import { Component, type InfernoNode, readContext } from 'inferno';
import { type Location, parsePath, type Path } from 'history';
import { combinePath, invariant } from './utils';
import { isString } from 'inferno-shared';
import { routerContext } from './Router';

export interface RedirectProps {
  from?: string;
  to: string | Partial<Location>;
  exact?: any;
  push?: boolean;
}

function getLocationTarget(to): Partial<Path> {
  if (!isString(to)) {
    to = combinePath(to);
  }

  return parsePath(to);
}

export class Redirect extends Component<RedirectProps, any> {
  public isStatic(): boolean {
    return Boolean(readContext(this.context, routerContext)?.staticContext);
  }

  public componentWillMount(): void {
    invariant(
      readContext(this.context, routerContext),
      'You should not use <Redirect> outside a <Router>',
    );

    if (this.isStatic()) {
      this.perform();
    }
  }

  public componentDidMount(): void {
    if (!this.isStatic()) {
      this.perform();
    }
  }

  public componentDidUpdate(prevProps): void {
    const prevTo = getLocationTarget(prevProps.to);
    const nextTo = getLocationTarget(this.props.to);

    if (
      prevTo.pathname === nextTo.pathname &&
      prevTo.search === nextTo.search
    ) {
      console.error(
        `You tried to redirect to the same route you're currently on: "${nextTo.pathname}${nextTo.search}"`,
      );
      return;
    }

    this.perform();
  }

  public perform(): void {
    const { history } = readContext(this.context, routerContext)!;
    const { push = false, to } = this.props;

    if (push) {
      history.push(to);
    } else {
      history.replace(to);
    }
  }

  public render(): InfernoNode {
    return null;
  }
}
