import { Component, render, useAnimation } from 'inferno';

describe('functional animation hooks', () => {
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

  it('should call onAppear when component has been inserted into DOM', () => {
    const spyer = jasmine.createSpy();

    function Animated() {
      useAnimation({
        onAppear(dom) {
          spyer('didAppear');
          expect(dom instanceof HTMLDivElement).toEqual(true);
        },
      });

      return <div />;
    }

    class App extends Component {
      public componentDidMount() {
        spyer('didMount');
      }

      public render() {
        return <Animated />;
      }
    }

    render(<App />, container);

    expect(spyer).toHaveBeenCalledTimes(2);
    expect(spyer.calls.argsFor(0)).toEqual(['didMount']);
    expect(spyer.calls.argsFor(1)).toEqual(['didAppear']);
  });

  it('should only call parent onAppear when a functional animation subtree mounts', () => {
    const spyer = jasmine.createSpy();

    function Child() {
      useAnimation({
        onAppear() {
          spyer('childDidAppear');
        },
      });

      return <div />;
    }

    function Parent() {
      useAnimation({
        onAppear(dom) {
          spyer('parentDidAppear');
          expect(dom instanceof HTMLDivElement).toEqual(true);
        },
      });

      return <Child />;
    }

    class App extends Component {
      public componentDidMount() {
        spyer('didMount');
      }

      public render() {
        return (
          <div>
            <Parent />
          </div>
        );
      }
    }

    render(<App />, container);

    expect(spyer).toHaveBeenCalledTimes(2);
    expect(spyer.calls.argsFor(0)).toEqual(['didMount']);
    expect(spyer.calls.argsFor(1)).toEqual(['parentDidAppear']);
  });

  it('should allow onDisappear to defer DOM removal', (done) => {
    const spyer = jasmine.createSpy();

    function App() {
      useAnimation({
        onDisappear(dom, callback) {
          spyer('willDisappear');
          expect(dom instanceof HTMLDivElement).toEqual(true);
          expect(callback instanceof Function).toEqual(true);
          setTimeout(callback, 10);
        },
      });

      return <div />;
    }

    render(<App />, container);
    render(null, container);

    expect(spyer).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('<div></div>');

    setTimeout(() => {
      expect(container.innerHTML).toBe('');
      done();
    }, 20);
  });

  it('should call onMove when a keyed functional component moves', () => {
    const spyer = jasmine.createSpy();

    function Item(props: { children?: any }) {
      useAnimation({
        onMove(_parentVNode, parentDOM, dom) {
          spyer('willMove');
          expect(parentDOM instanceof HTMLDivElement).toEqual(true);
          expect(dom instanceof HTMLDivElement).toEqual(true);
        },
      });

      return <div>{props.children}</div>;
    }

    render(
      <div>
        <Item key="1">1</Item>
        <Item key="2">2</Item>
      </div>,
      container,
    );
    expect(container.textContent).toEqual('12');

    render(
      <div>
        <Item key="2">2</Item>
        <Item key="1">1</Item>
      </div>,
      container,
    );

    expect(container.textContent).toEqual('21');
    expect(spyer).toHaveBeenCalledTimes(1);
  });
});
