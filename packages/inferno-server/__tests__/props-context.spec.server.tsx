import { renderToStaticMarkup } from 'inferno-server';
import {
  Component,
  contextValue,
  type Context,
  createContext,
  InfernoNode,
  readContext,
} from 'inferno';

const TestContextValue = createContext('');
const TestContextWrap = createContext('');

describe('SSR render() arguments', () => {
  class TestProvider extends Component<{ children?: InfernoNode }> {
    getChildContext() {
      return contextValue(TestContextValue, 'context-works');
    }

    render({ children }) {
      return children;
    }
  }

  it('should have props as 1st argument', () => {
    interface TestChildProps {
      testProps: string;
    }

    class TestChild extends Component<TestChildProps> {
      render(props) {
        return <p>{props.testProps}</p>;
      }
    }

    const output = renderToStaticMarkup(<TestChild testProps="props-works" />);
    expect(output).toBe('<p>props-works</p>');
  });

  it('should have state as 2nd argument', () => {
    class TestChild extends Component {
      constructor() {
        super();
        this.state = { testState: 'state-works' };
      }

      render(_props, state) {
        return <p>{state.testState}</p>;
      }
    }
    const output = renderToStaticMarkup(<TestChild />);
    expect(output).toBe('<p>state-works</p>');
  });

  it('statefull has context as 3rd argument', () => {
    class TestChild extends Component {
      render(_props, _state, context) {
        return <p>{readContext(context, TestContextValue)}</p>;
      }
    }

    const output = renderToStaticMarkup(
      <TestProvider>
        <TestChild />
      </TestProvider>,
    );
    expect(output).toBe('<p>context-works</p>');
  });

  it('stateless has context as 2nd argument', () => {
    function TestChild(_props, context: Context) {
      return <p>{readContext(context, TestContextValue)}</p>;
    }

    const output = renderToStaticMarkup(
      <TestProvider>
        <TestChild />
      </TestProvider>,
    );
    expect(output).toBe('<p>context-works</p>');
  });

  it('nested stateless has context as 2nd argument', () => {
    function ChildWrapper(props) {
      return props.children;
    }
    function TestChild(_props, context: Context) {
      return <p>{readContext(context, TestContextValue)}</p>;
    }
    const output = renderToStaticMarkup(
      <TestProvider>
        <ChildWrapper>
          <ChildWrapper>
            <TestChild />
          </ChildWrapper>
        </ChildWrapper>
      </TestProvider>,
    );
    expect(output).toBe('<p>context-works</p>');
  });

  it('nested providers should have merged context', () => {
    class TestContext extends Component<{ children?: InfernoNode }> {
      getChildContext() {
        return contextValue(TestContextWrap, 'context-wrap-works');
      }

      render({ children }) {
        return children;
      }
    }
    function TestChild(_props: unknown, context: Context) {
      return (
        <p>
          {readContext(context, TestContextValue)}|
          {readContext(context, TestContextWrap)}
        </p>
      );
    }
    const output = renderToStaticMarkup(
      <TestProvider>
        <TestContext>
          <TestChild />
        </TestContext>
      </TestProvider>,
    );
    expect(output).toBe('<p>context-works|context-wrap-works</p>');
  });
});
