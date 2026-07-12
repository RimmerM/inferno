import {
  Component,
  contextValue,
  type Context,
  type ContextOverrides,
  type InfernoNode,
  readContext,
} from 'inferno';
import { type Action, type AnyAction, type Store } from 'redux';
import { warning } from '../utils/warning';
import { reduxContext } from './context';

let didWarnAboutReceivingStore = false;
const warnAboutReceivingStore = (): void => {
  if (didWarnAboutReceivingStore) {
    return;
  }

  didWarnAboutReceivingStore = true;

  warning('<Provider> does not support changing `store` on the fly.');
};

export interface Props<A extends Action = AnyAction> {
  store: Store<any, A>;
  children?: InfernoNode;
}

export class Provider<A extends Action = AnyAction> extends Component<
  Props<A>
> {
  public static displayName = 'Provider';
  private readonly store: Store<any, A>;

  constructor(props: Props<A>, context: Context) {
    super(props, context);
    this.store = props.store;
  }

  public getChildContext(): ContextOverrides {
    return [
      contextValue(reduxContext, {
        ...readContext(this.context, reduxContext),
        store: this.store,
        storeSubscription: null,
      }),
    ];
  }

  // Don't infer the return type. It may be expanded and cause reference errors
  // in the output.
  public render(): InfernoNode {
    return this.props.children;
  }

  public componentWillReceiveProps?(
    nextProps: Readonly<{ children?: InfernoNode } & Props<A>>,
    nextContext: Context,
  ): void;
}

if (process.env.NODE_ENV !== 'production') {
  Provider.prototype.componentWillReceiveProps =
    function componentWillReceiveProps(nextProps) {
      const { store } = this;
      const { store: nextStore } = nextProps;

      if (store !== nextStore) {
        warnAboutReceivingStore();
      }
    };
}
