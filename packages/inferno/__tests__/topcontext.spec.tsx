import {
  Component,
  contextValue,
  createContext,
  createContextValues,
  createFragment,
  type Context,
  Fragment,
  memo,
  provideContext,
  readContext,
  render,
  useContext,
} from 'inferno';
import { ChildFlags } from 'inferno-vnode-flags';

const FooContext = createContext('default');
const BarContext = createContext('default');

function checkContextTypes(): void {
  const NumberContext = createContext(0);
  const value: number = readContext([], NumberContext);
  contextValue(NumberContext, value);
  // @ts-expect-error context values retain the registered type
  contextValue(NumberContext, 'wrong');
}
void checkContextTypes;

function Child(_props, context: Context) {
  return (
    <span>
      {readContext(context, FooContext)} {useContext(BarContext)}
    </span>
  );
}

describe('top level context', () => {
  let container;

  beforeEach(function () {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(function () {
    render(null, container);
    container.innerHTML = '';
    document.body.removeChild(container);
  });

  it('seeds indexed context values through render', () => {
    render(
      <Child />,
      container,
      null,
      createContextValues(
        contextValue(FooContext, 'first'),
        contextValue(BarContext, 'second'),
      ),
    );

    expect(container.innerHTML).toBe('<span>first second</span>');
  });

  it('applies class child-context overrides without changing render context', () => {
    class Parent extends Component {
      public getChildContext() {
        return contextValue(FooContext, 'child');
      }

      public render(_props, _state, context: Context) {
        return [<div>{readContext(context, FooContext)}</div>, <Child />];
      }
    }

    render(
      <Parent />,
      container,
      null,
      createContextValues(
        contextValue(FooContext, 'parent'),
        contextValue(BarContext, 'second'),
      ),
    );

    expect(container.innerHTML).toBe(
      '<div>parent</div><span>child second</span>',
    );
  });

  it('supports render-scoped class reads and retained functional contexts', () => {
    let readRetainedContext: () => string = () => '';

    function Retainer(_props, context: Context) {
      readRetainedContext = () => readContext(context, FooContext);
      return null;
    }

    class Reader extends Component {
      public render() {
        return (
          <span>
            {useContext(FooContext)}
            <Retainer />
          </span>
        );
      }
    }

    render(
      <Reader />,
      container,
      null,
      createContextValues(contextValue(FooContext, 'retained')),
    );

    expect(container.textContent).toBe('retained');
    expect(readRetainedContext()).toBe('retained');
  });

  it('provides context efficiently from a function component', () => {
    const Provider = ({ children }) => {
      const current = useContext(FooContext);
      expect(current).toBe('parent');
      // Functional provision is deliberately imperative and copy-on-write.
      provideContext(FooContext, 'functional');
      return children;
    };

    render(
      <Provider>
        <Child />
      </Provider>,
      container,
      null,
      createContextValues(
        contextValue(FooContext, 'parent'),
        contextValue(BarContext, 'second'),
      ),
    );

    expect(container.innerHTML).toBe('<span>functional second</span>');
  });

  it('reuses functional provider context when its values are unchanged', () => {
    let renders = 0;
    const MemoChild = memo(() => {
      renders++;
      return <span>{useContext(FooContext)}</span>;
    });
    const Provider = ({ children, value }) => {
      provideContext(FooContext, value);
      return children;
    };

    render(
      <Provider value="same">
        <MemoChild />
      </Provider>,
      container,
    );
    render(
      <Provider value="same">
        <MemoChild />
      </Provider>,
      container,
    );

    expect(renders).toBe(1);

    render(
      <Provider value="changed">
        <MemoChild />
      </Provider>,
      container,
    );

    expect(renders).toBe(2);
    expect(container.innerHTML).toBe('<span>changed</span>');
  });

  it('reuses class provider context when its values are unchanged', () => {
    let renders = 0;
    const MemoChild = memo(() => {
      renders++;
      return <span>{useContext(FooContext)}</span>;
    });

    class Provider extends Component<{ value: string }> {
      public getChildContext() {
        return contextValue(FooContext, this.props.value);
      }

      public render() {
        return <MemoChild />;
      }
    }

    render(<Provider value="same" />, container);
    render(<Provider value="same" />, container);
    expect(renders).toBe(1);

    render(<Provider value="changed" />, container);
    expect(renders).toBe(2);
  });

  it('passes context through single and multiple-child fragments', () => {
    class Single extends Component {
      public render() {
        return createFragment(<Child />, ChildFlags.HasVNodeChildren);
      }
    }

    class Multiple extends Component {
      public getChildContext() {
        return contextValue(FooContext, 'fragment');
      }

      public render() {
        return (
          <Fragment>
            <Child />
          </Fragment>
        );
      }
    }

    render(
      <Fragment>
        <Single />
        <Multiple />
      </Fragment>,
      container,
      null,
      createContextValues(
        contextValue(FooContext, 'root'),
        contextValue(BarContext, 'second'),
      ),
    );

    expect(container.innerHTML).toBe(
      '<span>root second</span><span>fragment second</span>',
    );
  });
});
