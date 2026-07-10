import {
  Component,
  createRef,
  memo,
  type RefObject,
  render,
  rerender,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useSyncExternalStoreWithSelector,
} from 'inferno';
import Spy = jasmine.Spy;

describe('Component lifecycle (JSX)', () => {
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

  describe('componentWillUnmount', () => {
    it('Should trigger UnMount for all children', () => {
      let updater: (() => void) | null = null;

      interface AState {
        foo: boolean;
      }

      class A extends Component<unknown, AState> {
        public state: AState;

        public componentWillUnmount() {}

        constructor(props) {
          super(props);

          this.state = {
            foo: true,
          };

          this.updateme = this.updateme.bind(this);
          updater = this.updateme;
        }

        public updateme() {
          this.setState({
            foo: !this.state.foo,
          });
        }

        public render() {
          return (
            <div>
              {(() => {
                if (this.state.foo) {
                  return null;
                }
                return <B />;
              })()}
              <button onClick={this.updateme}>btn</button>
            </div>
          );
        }
      }

      class B extends Component {
        public componentWillUnmount() {}

        public render() {
          return (
            <div>
              <C />
            </div>
          );
        }
      }

      class C extends Component {
        public componentWillUnmount() {}

        public render() {
          return (
            <div>
              <D />
            </div>
          );
        }
      }

      class D extends Component {
        public componentWillUnmount() {}

        public render() {
          return <div>Terve</div>;
        }
      }

      const Aspy = spyOn(A.prototype, 'componentWillUnmount');
      const Bspy = spyOn(B.prototype, 'componentWillUnmount');
      const CSpy = spyOn(C.prototype, 'componentWillUnmount');
      const DSpy = spyOn(D.prototype, 'componentWillUnmount');

      render(<A />, container);
      expect(container.innerHTML).toBe('<div><button>btn</button></div>');
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      updater!();
      expect(container.innerHTML).toBe(
        '<div><div><div><div>Terve</div></div></div><button>btn</button></div>',
      );
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      updater!();
      expect(container.innerHTML).toBe('<div><button>btn</button></div>');
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(CSpy).toHaveBeenCalledTimes(1);
      expect(DSpy).toHaveBeenCalledTimes(1);
    });

    it('Should not trigger unmount for new node', () => {
      let updater: (() => void) | null = null;

      interface AState {
        foo: boolean;
      }

      class A extends Component<unknown, AState> {
        public state: AState;
        public componentWillUnmount() {}

        constructor(props) {
          super(props);

          this.state = {
            foo: true,
          };

          this.updateme = this.updateme.bind(this);
          updater = this.updateme;
        }

        public updateme() {
          this.setState({
            foo: !this.state.foo,
          });
        }

        public render() {
          return (
            <div>
              {(() => {
                if (this.state.foo) {
                  return null;
                }
                return <B />;
              })()}
              <button onClick={this.updateme}>btn</button>
            </div>
          );
        }
      }

      class B extends Component {
        public componentWillUnmount() {}

        public render() {
          return <C />;
        }
      }

      class C extends Component {
        public componentWillUnmount() {}

        public render() {
          return <D />;
        }
      }

      class D extends Component {
        public componentWillUnmount() {}

        public render() {
          return <div>Terve</div>;
        }
      }

      const Aspy = spyOn(A.prototype, 'componentWillUnmount');
      const Bspy = spyOn(B.prototype, 'componentWillUnmount');
      const CSpy = spyOn(C.prototype, 'componentWillUnmount');
      const DSpy = spyOn(D.prototype, 'componentWillUnmount');

      render(<A />, container);
      expect(container.innerHTML).toBe('<div><button>btn</button></div>');
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      updater!();
      expect(container.innerHTML).toBe(
        '<div><div>Terve</div><button>btn</button></div>',
      );
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      updater!();
      expect(container.innerHTML).toBe('<div><button>btn</button></div>');
      expect(Aspy).not.toHaveBeenCalled();
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(CSpy).toHaveBeenCalledTimes(1);
      expect(DSpy).toHaveBeenCalledTimes(1);
    });

    it('Should trigger unMount once for direct nested children', () => {
      class B extends Component {
        public componentWillUnmount() {}

        public render() {
          return <div>B</div>;
        }
      }

      class C extends Component {
        public componentWillUnmount() {}

        public render() {
          return <div>C</div>;
        }
      }

      class D extends Component {
        public componentWillUnmount() {}

        public render() {
          return <div>D</div>;
        }
      }

      const Bspy = spyOn(B.prototype, 'componentWillUnmount');
      const CSpy = spyOn(C.prototype, 'componentWillUnmount');
      const DSpy = spyOn(D.prototype, 'componentWillUnmount');

      render(<B />, container);
      expect(container.innerHTML).toBe('<div>B</div>');
      expect(Bspy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      render(<C />, container);
      expect(container.innerHTML).toBe('<div>C</div>');
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(CSpy).not.toHaveBeenCalled();
      expect(DSpy).not.toHaveBeenCalled();

      render(<D />, container);
      expect(container.innerHTML).toBe('<div>D</div>');
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(CSpy).toHaveBeenCalledTimes(1);
      expect(DSpy).not.toHaveBeenCalled();

      render(<B />, container);
      expect(container.innerHTML).toBe('<div>B</div>');
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(CSpy).toHaveBeenCalledTimes(1);
      expect(DSpy).toHaveBeenCalledTimes(1);
    });

    it('Should trigger unmount once for children', () => {
      class B extends Component {
        public componentWillUnmount() {}

        public render() {
          return (
            <div>
              <B1 />
              <B2 />
            </div>
          );
        }
      }

      class B1 extends Component {
        public componentWillUnmount() {}

        public render() {
          return <p>B1</p>;
        }
      }

      class B2 extends Component {
        public componentWillUnmount() {}

        public render() {
          return <p>B2</p>;
        }
      }

      class C extends Component {
        constructor(props) {
          super(props);

          this.state = {
            text: 'C0',
          };

          this.updateMe = this.updateMe.bind(this);
        }

        public componentWillUnmount() {}

        public updateMe() {
          this.setState({
            text: 'C1',
          });
        }

        public render() {
          return (
            <div className="c">
              <C1 />
              <C2 />
            </div>
          );
        }
      }

      class C1 extends Component {
        public render() {
          return <p>C1</p>;
        }
      }

      class C2 extends Component {
        public render() {
          return <p>C2</p>;
        }
      }

      const Bspy = spyOn(B.prototype, 'componentWillUnmount');
      const B1spy = spyOn(B1.prototype, 'componentWillUnmount');
      const B2spy = spyOn(B2.prototype, 'componentWillUnmount');
      const CSpy = spyOn(C.prototype, 'componentWillUnmount');

      render(<B />, container);
      expect(container.innerHTML).toBe('<div><p>B1</p><p>B2</p></div>');
      expect(Bspy).not.toHaveBeenCalled();
      expect(B1spy).not.toHaveBeenCalled();
      expect(B2spy).not.toHaveBeenCalled();
      expect(CSpy).not.toHaveBeenCalled();

      Bspy.calls.reset();
      B1spy.calls.reset();
      B2spy.calls.reset();
      CSpy.calls.reset();

      render(<C />, container);
      expect(container.innerHTML).toBe(
        '<div class="c"><p>C1</p><p>C2</p></div>',
      );
      expect(Bspy).toHaveBeenCalledTimes(1);
      expect(B1spy).toHaveBeenCalledTimes(1);
      expect(B2spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Functional component hooks', () => {
    let _container;

    afterEach(function () {
      rerender();
      render(null, _container);
    });

    beforeEach(function () {
      _container = document.createElement('div');
    });

    function createExternalStore<T>(initialValue: T) {
      let value = initialValue;
      const listeners: Array<() => void> = [];
      const store = {
        subscribeCount: 0,
        unsubscribeCount: 0,
        getSnapshot() {
          return value;
        },
        set(nextValue: T) {
          value = nextValue;

          const currentListeners = listeners.slice();

          for (let i = 0; i < currentListeners.length; i++) {
            currentListeners[i]();
          }
        },
        subscribe(listener: () => void) {
          store.subscribeCount++;
          listeners.push(listener);

          return () => {
            store.unsubscribeCount++;

            const index = listeners.indexOf(listener);

            if (index > -1) {
              listeners.splice(index, 1);
            }
          };
        },
      };

      return store;
    }

    it('should update state from useState', () => {
      let setValue: (value: number | ((lastValue: number) => number)) => void;

      function Counter() {
        const [value, updateValue] = useState(1);
        setValue = updateValue;

        return <div>{value}</div>;
      }

      render(<Counter />, _container);
      expect(_container.innerHTML).toBe('<div>1</div>');

      setValue!((value) => value + 1);
      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
    });

    it('should update state from useReducer', () => {
      let dispatch: (value: number) => void;

      function Counter() {
        const [value, updateValue] = useReducer(
          (lastValue: number, action: number) => lastValue + action,
          1,
        );
        dispatch = updateValue;

        return <div>{value}</div>;
      }

      render(<Counter />, _container);
      expect(_container.innerHTML).toBe('<div>1</div>');

      dispatch!(2);
      rerender();

      expect(_container.innerHTML).toBe('<div>3</div>');
    });

    it('should subscribe to external stores and update from notifications', () => {
      const store = createExternalStore(1);
      let renders = 0;

      function StoreReader() {
        renders++;

        const value = useSyncExternalStore(
          store.subscribe,
          store.getSnapshot,
        );

        return <div>{value}</div>;
      }

      render(<StoreReader />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(store.subscribeCount).toBe(1);
      expect(renders).toBe(1);

      store.set(2);
      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
      expect(renders).toBe(2);

      store.set(2);
      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
      expect(renders).toBe(2);

      render(null, _container);

      expect(store.unsubscribeCount).toBe(1);
    });

    it('should resubscribe when external store subscribe function changes', () => {
      const firstStore = createExternalStore(1);
      const secondStore = createExternalStore(2);

      function StoreReader(props: { store: typeof firstStore }) {
        const value = useSyncExternalStore(
          props.store.subscribe,
          props.store.getSnapshot,
        );

        return <div>{value}</div>;
      }

      render(<StoreReader store={firstStore} />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(firstStore.subscribeCount).toBe(1);

      render(<StoreReader store={secondStore} />, _container);

      expect(_container.innerHTML).toBe('<div>2</div>');
      expect(firstStore.unsubscribeCount).toBe(1);
      expect(secondStore.subscribeCount).toBe(1);

      secondStore.set(3);
      rerender();

      expect(_container.innerHTML).toBe('<div>3</div>');
    });

    it('should catch external store changes between render and subscription', () => {
      let value = 1;
      let didChangeBeforeSubscribe = false;

      function getSnapshot() {
        return value;
      }

      function subscribe(_listener: () => void) {
        if (!didChangeBeforeSubscribe) {
          didChangeBeforeSubscribe = true;
          value = 2;
        }

        return () => {};
      }

      function StoreReader() {
        return <div>{useSyncExternalStore(subscribe, getSnapshot)}</div>;
      }

      render(<StoreReader />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');

      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
    });

    it('should update memoized components from external stores', () => {
      const store = createExternalStore(1);
      let renders = 0;

      const StoreReader = memo(function StoreReader(props: { label: string }) {
        renders++;

        const value = useSyncExternalStore(
          store.subscribe,
          store.getSnapshot,
        );

        return (
          <div>
            {props.label}:{value}
          </div>
        );
      });

      render(<StoreReader label="stable" />, _container);

      expect(_container.innerHTML).toBe('<div>stable:1</div>');
      expect(renders).toBe(1);

      store.set(2);
      rerender();

      expect(_container.innerHTML).toBe('<div>stable:2</div>');
      expect(renders).toBe(2);
    });

    it('should select external store values and skip updates when selection is equal', () => {
      const store = createExternalStore({ first: 1, second: 1 });
      let renders = 0;

      function StoreReader() {
        renders++;

        const value = useSyncExternalStoreWithSelector(
          store.subscribe,
          store.getSnapshot,
          undefined,
          (snapshot) => snapshot.first,
        );

        return <div>{value}</div>;
      }

      render(<StoreReader />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      store.set({ first: 1, second: 2 });
      rerender();

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      store.set({ first: 2, second: 2 });
      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
      expect(renders).toBe(2);
    });

    it('should use custom equality for selected external store values', () => {
      const store = createExternalStore({ first: 1, second: 1 });
      let renders = 0;

      function StoreReader() {
        renders++;

        const value = useSyncExternalStoreWithSelector(
          store.subscribe,
          store.getSnapshot,
          undefined,
          (snapshot) => ({ value: snapshot.first }),
          (lastValue, nextValue) => lastValue.value === nextValue.value,
        );

        return <div>{value.value}</div>;
      }

      render(<StoreReader />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      store.set({ first: 1, second: 2 });
      rerender();

      expect(_container.innerHTML).toBe('<div>1</div>');
      expect(renders).toBe(1);

      store.set({ first: 2, second: 2 });
      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
      expect(renders).toBe(2);
    });

    it('should recompute selected external store values when selector changes', () => {
      const store = createExternalStore({ value: 2 });

      function StoreReader(props: { multiplier: number }) {
        const value = useSyncExternalStoreWithSelector(
          store.subscribe,
          store.getSnapshot,
          undefined,
          (snapshot) => snapshot.value * props.multiplier,
        );

        return <div>{value}</div>;
      }

      render(<StoreReader multiplier={2} />, _container);
      expect(_container.innerHTML).toBe('<div>4</div>');

      render(<StoreReader multiplier={3} />, _container);
      expect(_container.innerHTML).toBe('<div>6</div>');
    });

    it('should catch selected external store changes between render and subscription', () => {
      let snapshot = { first: 1, second: 1 };
      let didChangeBeforeSubscribe = false;

      function getSnapshot() {
        return snapshot;
      }

      function subscribe(_listener: () => void) {
        if (!didChangeBeforeSubscribe) {
          didChangeBeforeSubscribe = true;
          snapshot = { first: 2, second: 1 };
        }

        return () => {};
      }

      function StoreReader() {
        const value = useSyncExternalStoreWithSelector(
          subscribe,
          getSnapshot,
          undefined,
          (nextSnapshot) => nextSnapshot.first,
        );

        return <div>{value}</div>;
      }

      render(<StoreReader />, _container);

      expect(_container.innerHTML).toBe('<div>1</div>');

      rerender();

      expect(_container.innerHTML).toBe('<div>2</div>');
    });

    it('should preserve useRef identity across renders', () => {
      const refs: Array<{ current: number }> = [];

      function RefComponent(props: { value: number }) {
        const ref = useRef(props.value);

        refs.push(ref);
        ref.current = props.value;

        return <div>{ref.current}</div>;
      }

      render(<RefComponent value={1} />, _container);
      render(<RefComponent value={2} />, _container);

      expect(refs.length).toBe(2);
      expect(refs[0]).toBe(refs[1]);
      expect(_container.innerHTML).toBe('<div>2</div>');
    });

    it('should memoize values and callbacks by dependency array', () => {
      let memoCount = 0;
      const values: unknown[] = [];
      const callbacks: unknown[] = [];

      function MemoComponent(props: { value: number }) {
        const value = useMemo(() => {
          memoCount++;
          return { value: props.value };
        }, [props.value]);
        const callback = useCallback(() => value.value, [value]);

        values.push(value);
        callbacks.push(callback);

        return <div>{callback()}</div>;
      }

      render(<MemoComponent value={1} />, _container);
      render(<MemoComponent value={1} />, _container);
      render(<MemoComponent value={2} />, _container);

      expect(memoCount).toBe(2);
      expect(values[0]).toBe(values[1]);
      expect(callbacks[0]).toBe(callbacks[1]);
      expect(values[1]).not.toBe(values[2]);
      expect(callbacks[1]).not.toBe(callbacks[2]);
      expect(_container.innerHTML).toBe('<div>2</div>');
    });

    it('should skip memoized functional component updates when props are shallowly equal', () => {
      let setParentValue: ((value: number) => void) | null = null;
      let childRenders = 0;

      const Child = memo(function Child(props: { value: string }) {
        childRenders++;

        return <span>{props.value}</span>;
      });

      function Parent() {
        const [, setValue] = useState(0);
        setParentValue = setValue;

        return (
          <div>
            <Child value="stable" />
          </div>
        );
      }

      render(<Parent />, _container);
      expect(_container.innerHTML).toBe('<div><span>stable</span></div>');
      expect(childRenders).toBe(1);

      setParentValue!(1);
      rerender();

      expect(_container.innerHTML).toBe('<div><span>stable</span></div>');
      expect(childRenders).toBe(1);
    });

    it('should use custom memo comparators', () => {
      let childRenders = 0;

      const Child = memo(
        function Child(props: { id: number; label: string }) {
          childRenders++;

          return <span>{props.label}</span>;
        },
        (lastProps, nextProps) => lastProps.id === nextProps.id,
      );

      render(<Child id={1} label="first" />, _container);
      render(<Child id={1} label="skipped" />, _container);

      expect(_container.innerHTML).toBe('<span>first</span>');
      expect(childRenders).toBe(1);

      render(<Child id={2} label="second" />, _container);

      expect(_container.innerHTML).toBe('<span>second</span>');
      expect(childRenders).toBe(2);
    });

    it('should update memoized components from their own hook state', () => {
      let setChildValue: ((value: number) => void) | null = null;
      let childRenders = 0;

      const Child = memo(function Child() {
        const [value, setValue] = useState(1);
        setChildValue = setValue;
        childRenders++;

        return <span>{value}</span>;
      });

      render(<Child />, _container);
      expect(_container.innerHTML).toBe('<span>1</span>');
      expect(childRenders).toBe(1);

      setChildValue!(2);
      rerender();

      expect(_container.innerHTML).toBe('<span>2</span>');
      expect(childRenders).toBe(2);
    });

    it('should update memoized components when context changes', () => {
      let childRenders = 0;

      const Child = memo(function Child(
        props: { label: string },
        context: { theme: string },
      ) {
        childRenders++;

        return (
          <span>
            {props.label}:{context.theme}
          </span>
        );
      });

      class Provider extends Component<{ theme: string }, unknown> {
        public getChildContext() {
          return {
            theme: this.props.theme,
          };
        }

        public render() {
          return <Child label="stable" />;
        }
      }

      render(<Provider theme="dark" />, _container);
      render(<Provider theme="light" />, _container);

      expect(_container.innerHTML).toBe('<span>stable:light</span>');
      expect(childRenders).toBe(2);
    });

    it('should run layout effects synchronously and passive effects asynchronously', (done) => {
      const calls: string[] = [];

      function EffectComponent(props: { value: number }) {
        useLayoutEffect(() => {
          calls.push('layout:' + props.value);

          return () => {
            calls.push('layout-cleanup:' + props.value);
          };
        }, [props.value]);
        useEffect(() => {
          calls.push('effect:' + props.value);

          return () => {
            calls.push('effect-cleanup:' + props.value);
          };
        }, [props.value]);

        return <div>{props.value}</div>;
      }

      render(<EffectComponent value={1} />, _container);
      expect(calls).toEqual(['layout:1']);

      setTimeout(() => {
        expect(calls).toEqual(['layout:1', 'effect:1']);

        render(<EffectComponent value={2} />, _container);
        expect(calls).toEqual([
          'layout:1',
          'effect:1',
          'layout-cleanup:1',
          'layout:2',
        ]);

        setTimeout(() => {
          expect(calls).toEqual([
            'layout:1',
            'effect:1',
            'layout-cleanup:1',
            'layout:2',
            'effect-cleanup:1',
            'effect:2',
          ]);

          render(null, _container);
          expect(calls).toEqual([
            'layout:1',
            'effect:1',
            'layout-cleanup:1',
            'layout:2',
            'effect-cleanup:1',
            'effect:2',
            'layout-cleanup:2',
            'effect-cleanup:2',
          ]);
          done();
        }, 0);
      }, 0);
    });

    it('should expose imperative handles', () => {
      const ref = createRef<{ getValue(): number }>();

      function ImperativeComponent(props: {
        value: number;
        ref?: RefObject<{ getValue(): number }>;
      }) {
        useImperativeHandle(
          props.ref,
          () => ({
            getValue() {
              return props.value;
            },
          }),
          [props.value],
        );

        return <div>{props.value}</div>;
      }

      render(<ImperativeComponent ref={ref} value={1} />, _container);
      expect(ref.current!.getValue()).toBe(1);

      render(<ImperativeComponent ref={ref} value={2} />, _container);
      expect(ref.current!.getValue()).toBe(2);

      render(null, _container);
      expect(ref.current).toBe(null);
    });
  });

  describe('ref hook', () => {
    const fakeObj = {
      previousSiblingCallback() {},
      innerCallback() {},
      innerSecondCallback() {},
    };

    const RefTester = ({ inner, innersecond }) => {
      let content = null;
      if (inner) {
        let contentTwo = null;
        if (innersecond) {
          contentTwo = <span ref={fakeObj.innerSecondCallback}>dfg</span>;
        }
        content = <div ref={fakeObj.innerCallback}>{contentTwo}</div>;
      }

      return (
        <div>
          <span ref={fakeObj.previousSiblingCallback}>abc</span>
          {content}
        </div>
      );
    };

    let orderOfCalls: string[] = [];
    let spyPreviousSibling = null as unknown as Spy;
    let spyInner = null as unknown as Spy;
    let spyInnerSecond = null as unknown as Spy;

    beforeEach(function () {
      orderOfCalls = [];
      spyPreviousSibling = spyOn(
        fakeObj,
        'previousSiblingCallback',
      ).and.callFake(function () {
        orderOfCalls.push('spyPreviousSibling');
      });
      spyInner = spyOn(fakeObj, 'innerCallback').and.callFake(function () {
        orderOfCalls.push('inner');
      });
      spyInnerSecond = spyOn(fakeObj, 'innerSecondCallback').and.callFake(
        function () {
          orderOfCalls.push('innerSecond');
        },
      );
    });

    it('Should call function when node is attached', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      render(<RefTester inner={false} innersecond={false} />, container);

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={false} />, container);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual('<div></div>');
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );
    });

    it('Should call ref functions in order: child to parent', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);
    });

    it('Should call ref when node is re-attached and re-unmounted', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      render(<RefTester inner={false} innersecond={true} />, container);

      // Verify divs are removed from DOM
      expect(container.innerHTML).toEqual('<div><span>abc</span></div>');

      // Verify ref callbacks
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0]).toEqual(null);
      expect(spyInnerSecond.calls.argsFor(0)[0]).toEqual(null);

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      render(<RefTester inner={true} innersecond={true} />, container);

      // Verify divs are attached
      expect(container.innerHTML).toEqual(
        '<div><span>abc</span><div><span>dfg</span></div></div>',
      );

      // Verify ref callbacks
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();
    });

    it('Should have width defined when html node is attached', () => {
      if (global.usingJSDOM) {
        // JSDOM mocks the ref node width to 0. Skip test
        return;
      }

      let node: HTMLDivElement | null = null;

      class Hello extends Component {
        constructor(props) {
          super(props);
        }

        public componentDidMount() {
          expect(node!.offsetWidth).not.toEqual(0);
        }

        public ref(n) {
          if (n) {
            expect(n.offsetWidth).not.toEqual(0);
            node = n;
          }
        }

        public render() {
          return <div ref={this.ref}>Hello World</div>;
        }
      }

      render(<Hello />, container);
    });
  });

  describe('ref hook complex', () => {
    const fakeObj = {
      previousSiblingCallback() {},
      innerCallback() {},
      innerSecondCallback() {},
    };

    const RefTester = ({ inner, innersecond }) => {
      let content = null;
      if (inner) {
        let contentTwo = null;
        if (innersecond) {
          contentTwo = <span ref={fakeObj.innerSecondCallback}>dfg</span>;
        }
        content = <div ref={fakeObj.innerCallback}>{contentTwo}</div>;
      }

      return (
        <div>
          <span ref={fakeObj.previousSiblingCallback}>abc</span>
          {content}
        </div>
      );
    };

    const PlainDiv = () => <div>plaindiv</div>;

    const RefParent = ({ bool, inner, innersecond }) => {
      return (
        <div>
          {bool ? (
            <RefTester inner={inner} innersecond={innersecond} />
          ) : (
            <PlainDiv />
          )}
        </div>
      );
    };

    let orderOfCalls: string[] = [];
    let spyPreviousSibling = null as unknown as Spy;
    let spyInner = null as unknown as Spy;
    let spyInnerSecond = null as unknown as Spy;

    beforeEach(function () {
      orderOfCalls = [];
      spyPreviousSibling = spyOn(
        fakeObj,
        'previousSiblingCallback',
      ).and.callFake(function () {
        orderOfCalls.push('spyPreviousSibling');
      });
      spyInner = spyOn(fakeObj, 'innerCallback').and.callFake(function () {
        orderOfCalls.push('inner');
      });
      spyInnerSecond = spyOn(fakeObj, 'innerSecondCallback').and.callFake(
        function () {
          orderOfCalls.push('innerSecond');
        },
      );
    });

    afterEach(function () {
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();
    });

    it('Should not call ref unmount when node is not mounted', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      render(
        <RefParent bool={true} inner={false} innersecond={false} />,
        container,
      );

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // RENDER INNER DIVS
      render(
        <RefParent bool={true} inner={true} innersecond={true} />,
        container,
      );
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      // verify order
      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);

      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span><div><span>dfg</span></div></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // UNMOUNT INNER DIVS
      render(
        <RefParent bool={true} inner={false} innersecond={false} />,
        container,
      );
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      // verify order
      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
        'inner',
        'innerSecond',
      ]);

      expect(spyInner.calls.argsFor(0)[0]).toEqual(null);
      expect(spyInnerSecond.calls.argsFor(0)[0]).toEqual(null);

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // Inner and InnerSecond divs are now unmounted
      // and unmounting parent should not cause them to unmounted again

      // REPLACE PARENT
      render(
        <RefParent bool={false} inner={false} innersecond={false} />,
        container,
      );
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      expect(container.innerHTML).toEqual('<div><div>plaindiv</div></div>');
    });
  });

  describe('ref hook #2 with statefull components', () => {
    const fakeObj = {
      previousSiblingCallback() {},
      innerCallback() {},
      innerSecondCallback() {},
    };

    interface RefTesterProps {
      inner?: boolean;
      innersecond?: boolean;
    }

    class RefTester extends Component<RefTesterProps> {
      public render() {
        const inner = this.props.inner;
        const innersecond = this.props.innersecond;

        let content = null;
        if (inner) {
          let contentTwo = null;
          if (innersecond) {
            contentTwo = <span ref={fakeObj.innerSecondCallback}>dfg</span>;
          }
          content = <div ref={fakeObj.innerCallback}>{contentTwo}</div>;
        }

        return (
          <div>
            <span ref={fakeObj.previousSiblingCallback}>abc</span>
            {content}
          </div>
        );
      }
    }

    let orderOfCalls: string[] = [];
    let spyPreviousSibling = null as unknown as Spy;
    let spyInner = null as unknown as Spy;
    let spyInnerSecond = null as unknown as Spy;

    beforeEach(function () {
      orderOfCalls = [];
      spyPreviousSibling = spyOn(
        fakeObj,
        'previousSiblingCallback',
      ).and.callFake(function () {
        orderOfCalls.push('spyPreviousSibling');
      });
      spyInner = spyOn(fakeObj, 'innerCallback').and.callFake(function () {
        orderOfCalls.push('inner');
      });
      spyInnerSecond = spyOn(fakeObj, 'innerSecondCallback').and.callFake(
        function () {
          orderOfCalls.push('innerSecond');
        },
      );
    });

    it('Should call function when node is attached #2', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      render(<RefTester inner={false} innersecond={false} />, container);

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={false} />, container);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual('<div></div>');
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );
    });

    it('Should call ref functions in order: child to parent #2', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);

      expect(spyPreviousSibling);
      expect(spyInner);
      expect(spyInnerSecond);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);
    });

    it('Should call ref when node is re-attached and re-unmounted', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      render(<RefTester inner={true} innersecond={true} />, container);

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      render(<RefTester inner={false} innersecond={true} />, container);

      // Verify divs are removed from DOM
      expect(container.innerHTML).toEqual('<div><span>abc</span></div>');

      // Verify ref callbacks
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0]).toEqual(null);
      expect(spyInnerSecond.calls.argsFor(0)[0]).toEqual(null);

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      render(<RefTester inner={true} innersecond={true} />, container);

      // Verify divs are attached
      expect(container.innerHTML).toEqual(
        '<div><span>abc</span><div><span>dfg</span></div></div>',
      );

      // Verify ref callbacks
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      // reset
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();
    });
  });

  describe('ref hook complex #2 statefull components', () => {
    const fakeObj = {
      previousSiblingCallback() {},
      innerCallback() {},
      innerSecondCallback() {},
    };

    interface RefTesterProps {
      bool?: boolean;
      inner?: boolean;
      innersecond?: boolean;
    }

    class RefTester extends Component<RefTesterProps> {
      public render() {
        const inner = this.props.inner;
        const innersecond = this.props.innersecond;

        let content = null;
        if (inner) {
          let contentTwo = null;
          if (innersecond) {
            contentTwo = <span ref={fakeObj.innerSecondCallback}>dfg</span>;
          }
          content = <div ref={fakeObj.innerCallback}>{contentTwo}</div>;
        }

        return (
          <div>
            <span ref={fakeObj.previousSiblingCallback}>abc</span>
            {content}
          </div>
        );
      }
    }

    class PlainDiv extends Component {
      public render() {
        return <div>plaindiv</div>;
      }
    }

    interface RefParentProps {
      bool?: boolean;
      inner?: boolean;
      innersecond?: boolean;
    }

    class RefParent extends Component<RefParentProps> {
      public render() {
        const { bool, inner, innersecond } = this.props;

        return (
          <div>
            {bool ? (
              <RefTester inner={inner} innersecond={innersecond} />
            ) : (
              <PlainDiv />
            )}
          </div>
        );
      }
    }

    let orderOfCalls: string[] = [];
    let spyPreviousSibling = null as unknown as Spy;
    let spyInner = null as unknown as Spy;
    let spyInnerSecond = null as unknown as Spy;

    beforeEach(function () {
      orderOfCalls = [];
      spyPreviousSibling = spyOn(
        fakeObj,
        'previousSiblingCallback',
      ).and.callFake(function () {
        orderOfCalls.push('spyPreviousSibling');
      });
      spyInner = spyOn(fakeObj, 'innerCallback').and.callFake(function () {
        orderOfCalls.push('inner');
      });
      spyInnerSecond = spyOn(fakeObj, 'innerSecondCallback').and.callFake(
        function () {
          orderOfCalls.push('innerSecond');
        },
      );
    });

    afterEach(function () {
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();
    });

    it('Should not call ref unmount when node is not mounted #2', () => {
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      render(
        <RefParent bool={true} inner={false} innersecond={false} />,
        container,
      );

      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyPreviousSibling.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>abc</span>',
      );
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // RENDER INNER DIVS
      render(
        <RefParent bool={true} inner={true} innersecond={true} />,
        container,
      );
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      // verify order
      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
      ]);

      expect(spyInner.calls.argsFor(0)[0].outerHTML).toEqual(
        '<div><span>dfg</span></div>',
      );
      expect(spyInnerSecond.calls.argsFor(0)[0].outerHTML).toEqual(
        '<span>dfg</span>',
      );

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span><div><span>dfg</span></div></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // UNMOUNT INNER DIVS
      render(
        <RefParent bool={true} inner={false} innersecond={false} />,
        container,
      );
      expect(spyPreviousSibling).not.toHaveBeenCalled();
      expect(spyInner).toHaveBeenCalledTimes(1);
      expect(spyInnerSecond).toHaveBeenCalledTimes(1);
      // verify order
      expect(orderOfCalls).toEqual([
        'spyPreviousSibling',
        'innerSecond',
        'inner',
        'inner',
        'innerSecond',
      ]);

      expect(spyInner.calls.argsFor(0)[0]).toEqual(null);
      expect(spyInnerSecond.calls.argsFor(0)[0]).toEqual(null);

      expect(container.innerHTML).toEqual(
        '<div><div><span>abc</span></div></div>',
      );
      spyPreviousSibling.calls.reset();
      spyInner.calls.reset();
      spyInnerSecond.calls.reset();

      // Inner and InnerSecond divs are now unmounted
      // and unmounting parent should not cause them to unmounted again

      // REPLACE PARENT
      render(
        <RefParent bool={false} inner={false} innersecond={false} />,
        container,
      );
      expect(spyPreviousSibling).toHaveBeenCalledTimes(1);
      expect(spyInner).not.toHaveBeenCalled();
      expect(spyInnerSecond).not.toHaveBeenCalled();
      expect(container.innerHTML).toEqual('<div><div>plaindiv</div></div>');
    });
  });

  describe('ES6 Component within functional component', () => {
    it('Should trigger lifecycle events when functional component change', () => {
      let unmounted = false;

      function A() {
        return (
          <div>
            <Com />
          </div>
        );
      }

      function B() {
        return (
          <div>
            <Com />
          </div>
        );
      }

      class Com extends Component {
        public componentWillUnmount() {
          unmounted = true;
        }

        public render() {
          return <div>C</div>;
        }
      }

      render(<A />, container);
      expect(container.innerHTML).toEqual('<div><div>C</div></div>');
      expect(unmounted).toEqual(false);
      render(<B />, container);
      expect(unmounted).toEqual(true);
      expect(container.innerHTML).toEqual('<div><div>C</div></div>');
    });

    it('Should trigger lifecycle events when functional component dont change', () => {
      let unmounted = false;

      function A() {
        return (
          <div>
            <Com />
          </div>
        );
      }

      class Com extends Component {
        public componentWillUnmount() {
          unmounted = true;
        }

        public render() {
          return <div>C</div>;
        }
      }

      render(<A />, container);
      expect(container.innerHTML).toEqual('<div><div>C</div></div>');
      expect(unmounted).toEqual(false);
      render(<A />, container);
      expect(unmounted).toEqual(false);
      expect(container.innerHTML).toEqual('<div><div>C</div></div>');
    });
  });

  describe('context with hooks', () => {
    it('Should trigger componentWillMount before getting child context', () => {
      interface AState {
        foobar: string | null;
      }

      class A extends Component<unknown, AState> {
        public state: AState;
        constructor(props) {
          super(props);

          this.state = {
            foobar: null,
          };
        }

        public getChildContext() {
          return {
            foobar: this.state.foobar,
          };
        }

        public componentWillMount() {
          this.setState({
            foobar: 'hey',
          });
        }

        public render() {
          return (
            <div>
              <Child />
            </div>
          );
        }
      }

      class Child extends Component {
        constructor(props) {
          super(props);
        }

        public render() {
          return <span>{this.context.foobar}</span>;
        }
      }

      render(<A />, container);

      expect(container.innerHTML).toEqual('<div><span>hey</span></div>');
    });
  });

  describe('ref', () => {
    it('Should trigger lifecycle hooks when parent changes', () => {
      const spy1 = jasmine.createSpy('spy');
      const spy2 = jasmine.createSpy('spy');
      const spy3 = jasmine.createSpy('spy');
      const spy4 = jasmine.createSpy('spy');
      const spy5 = jasmine.createSpy('spy');

      class A extends Component {
        public render() {
          return (
            <div>
              <div ref={spy5}>
                <span>1</span>
                <span>1</span>
              </div>
            </div>
          );
        }
      }

      class B extends Component {
        public componentWillMount() {
          this.setState({
            foo: 'bar',
          });
        }

        public render() {
          return (
            <div>
              <div ref={spy1} />
              <Child />
              <div />
              <div ref={spy2} />
              <div />
              <Child ref={spy3} />
            </div>
          );
        }
      }

      class Child extends Component {
        public componentWillMount() {
          this.setState({
            foo: '1',
          });
        }

        public render() {
          return <div ref={spy4}>5</div>;
        }
      }

      render(<A />, container);
      expect(spy5.calls.count()).toBe(1);

      render(<B />, container);

      expect(spy5.calls.count()).toBe(2); // mount + unmount

      expect(spy1.calls.count()).toBe(1);
      expect(spy2.calls.count()).toBe(1);
      expect(spy3.calls.count()).toBe(1);
      expect(spy4.calls.count()).toBe(2); // 2 refs
    });
  });
});
