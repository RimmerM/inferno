import React, {
  Children,
  cloneElement,
  Component,
  createElement,
  hydrate,
  PropTypes,
  render,
  unstable_renderSubtreeIntoContainer,
} from 'inferno-compat';

describe('MISC', () => {
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

  describe('PropTypes', () => {
    it('PropTypes should exists in inferno-compat', () => {
      expect(typeof PropTypes).toBe('object');
      expect(PropTypes.any()).toBeTruthy();
      expect(typeof PropTypes.any().isRequired).toBe('function');
      expect(PropTypes.any().isRequired()).toBeUndefined();
    });

    it('checkPropTypes should return null', () => {
      expect(PropTypes.checkPropTypes()).toBeNull();
    });
  });

  describe('React Synthetic event simulation', () => {
    it('should have isPropagationStopped and isDefaultPrevented defined in Event prototype', () => {
      const spyObj = {
        foo: (event) => {
          expect(event.isDefaultPrevented()).toBe(false);
          expect(event.isPropagationStopped()).toBe(false);

          event.preventDefault();
          expect(event.isDefaultPrevented()).toBe(true);

          event.stopPropagation();
          expect(event.isPropagationStopped()).toBe(true);
        },
      };
      spyOn(spyObj, 'foo').and.callThrough();

      render(<div onClick={spyObj.foo} />, container);

      container.firstChild.click();

      expect(spyObj.foo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Children Only', () => {
    it('Should return first of array', () => {
      const divOne = <div />;
      const children = [divOne];

      expect(Children.only(children)).toBe(divOne);
    });

    it('Should two if children length is not one', () => {
      const divOne = <div />;
      const children = [divOne, 'two', 3];

      expect(() => Children.only(children)).toThrow();
    });
  });

  describe('Children toArray', () => {
    it('Should return child in array', () => {
      const divOne = <div />;

      expect(Children.toArray(divOne)).toEqual([divOne]);
    });

    it('Should return array if its already array', () => {
      const children = [<div />];

      expect(Children.toArray(children)).toEqual(children);
    });

    it('Should return empty array if its null/undef', () => {
      const children = null;

      expect(Children.toArray(children)).toEqual([]);
    });
  });

  describe('render()', () => {
    it('should be exported', () => {
      expect(React.render).toBe(render);
    });

    it('should replace isomorphic content', () => {
      const ce = (type) => document.createElement(type);
      const Text = (text) => document.createTextNode(text);
      const root = ce('div');
      const initialChild = ce('div');
      initialChild.appendChild(Text('initial content'));
      root.appendChild(initialChild);

      hydrate(<div>dynamic content</div>, root);
      expect(root.textContent).toEqual('dynamic content');
    });

    it('hydrate should remove extra elements', () => {
      const ce = (type) => document.createElement(type);
      const Text = (text) => document.createTextNode(text);
      const root = ce('div');

      const c1 = ce('div');
      c1.appendChild(Text('isomorphic content'));
      root.appendChild(c1);

      const c2 = ce('div');
      c2.appendChild(Text('extra content'));
      root.appendChild(c2);

      hydrate(<div>dynamic content</div>, root);
      expect(root.textContent).toEqual('dynamic content');
    });

    it('should remove text nodes', () => {
      const ce = (type) => document.createElement(type);
      const Text = (text) => document.createTextNode(text);
      const root = ce('div');

      root.appendChild(Text('Text Content in the root'));
      root.appendChild(Text('More Text Content'));

      hydrate(<div>dynamic content</div>, root);
      expect(root.textContent).toEqual('dynamic content');
    });

    it('should support defaultValue', () => {
      const div2 = document.createElement('div');
      (document.body || document.documentElement).appendChild(div2);
      render(<input defaultValue="foo" />, div2);
      expect(div2.firstElementChild.value).toBe('foo');

      render(null, div2);
      document.body.removeChild(div2);
    });
  });

  describe('createElement()', () => {
    it('should be exported', () => {
      expect(React.createElement).toBe(createElement);
    });
  });

  describe('Component', () => {
    it('should be exported', () => {
      expect(React.Component).toEqual(Component);
    });
  });

  describe('memo()', () => {
    it('should skip updates when props are shallowly equal', () => {
      let renders = 0;

      const Child = React.memo(function Child(props) {
        renders++;

        return <span>{props.value}</span>;
      });

      function Parent(props) {
        return (
          <div>
            <Child value={props.value} />
          </div>
        );
      }

      render(<Parent value="stable" />, container);
      render(<Parent value="stable" />, container);

      expect(container.innerHTML).toBe('<div><span>stable</span></div>');
      expect(renders).toBe(1);

      render(<Parent value="changed" />, container);

      expect(container.innerHTML).toBe('<div><span>changed</span></div>');
      expect(renders).toBe(2);
    });
  });

  describe('useSyncExternalStore()', () => {
    it('should subscribe to external stores', () => {
      let value = 1;
      const listeners = [];
      const subscribe = (listener) => {
        listeners.push(listener);

        return () => {
          const index = listeners.indexOf(listener);

          if (index > -1) {
            listeners.splice(index, 1);
          }
        };
      };
      const getSnapshot = () => value;

      function StoreReader() {
        return <div>{React.useSyncExternalStore(subscribe, getSnapshot)}</div>;
      }

      render(<StoreReader />, container);
      expect(container.innerHTML).toBe('<div>1</div>');

      value = 2;
      listeners.slice().forEach((listener) => listener());
      React.rerender();

      expect(container.innerHTML).toBe('<div>2</div>');
    });
  });

  describe('useSyncExternalStoreWithSelector()', () => {
    it('should subscribe to selected external store values', () => {
      let snapshot = { first: 1, second: 1 };
      const listeners = [];
      const subscribe = (listener) => {
        listeners.push(listener);

        return () => {
          const index = listeners.indexOf(listener);

          if (index > -1) {
            listeners.splice(index, 1);
          }
        };
      };
      const getSnapshot = () => snapshot;
      let renders = 0;

      function StoreReader() {
        renders++;

        return (
          <div>
            {React.useSyncExternalStoreWithSelector(
              subscribe,
              getSnapshot,
              undefined,
              (value) => value.first,
            )}
          </div>
        );
      }

      render(<StoreReader />, container);
      expect(container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      snapshot = { first: 1, second: 2 };
      listeners.slice().forEach((listener) => listener());
      React.rerender();

      expect(container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      snapshot = { first: 2, second: 2 };
      listeners.slice().forEach((listener) => listener());
      React.rerender();

      expect(container.innerHTML).toBe('<div>2</div>');
      expect(renders).toBe(2);
    });
  });

  describe('cloneElement', () => {
    it('should clone elements', () => {
      const element = (
        <foo a="b" c="d">
          a<span>b</span>
        </foo>
      );
      expect(JSON.stringify(cloneElement(element).children)).toEqual(
        JSON.stringify(element.children),
      );
    });

    it('should support props.children', () => {
      const element = <foo children={<span>b</span>} />;
      const clone = cloneElement(element);

      expect(cloneElement(clone).props.children).toEqual(
        element.props.children,
      );
    });

    it('children take precedence over props.children', () => {
      const element = (
        <foo children={<span>c</span>}>
          <div>b</div>
        </foo>
      );
      const clone = cloneElement(element);

      expect(clone.children.children).toEqual('b');
    });

    it('should support children in prop argument', () => {
      const element = <foo />;
      const children = [<span>b</span>];
      const clone = cloneElement(element, { children });
      expect(JSON.stringify(clone.children)).toEqual(JSON.stringify(children));
    });

    it('children argument takes precedence over props.children', () => {
      const element = <foo />;
      const childrenA = [<span>b</span>];
      const childrenB = [<div>c</div>];
      const clone = cloneElement(element, { children: childrenA }, childrenB);
      expect(JSON.stringify(clone.children)).toEqual(JSON.stringify(childrenB));
    });

    it('children argument takes precedence over props.children even if falsey', () => {
      const element = <foo />;
      const childrenA = [<span>b</span>];
      const clone = cloneElement(element, { children: childrenA }, undefined);
      expect(clone.children).toEqual(null);
    });
  });

  describe('unstable_renderSubtreeIntoContainer', () => {
    class Inner extends Component {
      render() {
        return null;
      }

      getNode() {
        return 'inner';
      }
    }

    it('should export instance', () => {
      class App extends Component {
        render() {
          return null;
        }

        componentDidMount() {
          this.renderInner();
        }

        renderInner() {
          const wrapper = document.createElement('div');
          this.inner = unstable_renderSubtreeIntoContainer(
            this,
            <Inner />,
            wrapper,
          );
        }
      }
      const root = document.createElement('div');
      const app = render(<App />, root);
      expect(typeof app.inner.getNode === 'function').toEqual(true);
    });

    it('should there must be a context in callback', () => {
      class App extends Component {
        render() {
          return null;
        }

        componentDidMount() {
          this.renderInner();
        }

        renderInner() {
          const wrapper = document.createElement('div');
          const self = this;
          unstable_renderSubtreeIntoContainer(
            this,
            <Inner />,
            wrapper,
            function () {
              self.inner = this;
            },
          );
        }
      }
      const root = document.createElement('div');
      const app = render(<App />, root);
      expect(typeof app.inner.getNode === 'function').toEqual(true);
    });
  });
});
