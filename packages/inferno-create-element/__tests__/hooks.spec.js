import {
  memo,
  render,
  rerender,
  useEffect,
  useState,
  useSyncExternalStore,
  useSyncExternalStoreWithSelector,
} from 'inferno';
import { createElement } from 'inferno-create-element';

describe('functional hooks with createElement', () => {
  let container;

  beforeEach(function () {
    container = document.createElement('div');
  });

  afterEach(function () {
    rerender();
    render(null, container);
  });

  it('should support useState in functional components', () => {
    let setValue;

    function Counter() {
      const [value, updateValue] = useState(1);
      setValue = updateValue;

      return createElement('div', null, value);
    }

    render(createElement(Counter), container);
    expect(container.innerHTML).toBe('<div>1</div>');

    setValue(2);
    rerender();

    expect(container.innerHTML).toBe('<div>2</div>');
  });

  it('should support useEffect cleanup in functional components', (done) => {
    const calls = [];

    function EffectComponent(props) {
      useEffect(() => {
        calls.push('effect:' + props.value);

        return () => {
          calls.push('cleanup:' + props.value);
        };
      }, [props.value]);

      return createElement('div', null, props.value);
    }

    render(createElement(EffectComponent, { value: 1 }), container);

    setTimeout(() => {
      expect(calls).toEqual(['effect:1']);

      render(createElement(EffectComponent, { value: 2 }), container);

      setTimeout(() => {
        expect(calls).toEqual(['effect:1', 'cleanup:1', 'effect:2']);

        render(null, container);
        expect(calls).toEqual([
          'effect:1',
          'cleanup:1',
          'effect:2',
          'cleanup:2',
        ]);
        done();
      }, 0);
    }, 0);
  });

  it('should support memoized functional components', () => {
    let renders = 0;

    const Child = memo(function Child(props) {
      renders++;

      return createElement('span', null, props.value);
    });

    function Parent(props) {
      return createElement('div', null, createElement(Child, props));
    }

    render(createElement(Parent, { value: 'stable' }), container);
    render(createElement(Parent, { value: 'stable' }), container);

    expect(container.innerHTML).toBe('<div><span>stable</span></div>');
    expect(renders).toBe(1);

    render(createElement(Parent, { value: 'changed' }), container);

    expect(container.innerHTML).toBe('<div><span>changed</span></div>');
    expect(renders).toBe(2);
  });

  it('should support useSyncExternalStore in functional components', () => {
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
      return createElement(
        'div',
        null,
        useSyncExternalStore(subscribe, getSnapshot),
      );
    }

    render(createElement(StoreReader), container);
    expect(container.innerHTML).toBe('<div>1</div>');

    value = 2;
    listeners.slice().forEach((listener) => listener());
    rerender();

    expect(container.innerHTML).toBe('<div>2</div>');
  });

  it('should support useSyncExternalStoreWithSelector in functional components', () => {
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

      return createElement(
        'div',
        null,
        useSyncExternalStoreWithSelector(
          subscribe,
          getSnapshot,
          undefined,
          (value) => value.first,
        ),
      );
    }

    render(createElement(StoreReader), container);
    expect(container.innerHTML).toBe('<div>1</div>');
    expect(renders).toBe(1);

    snapshot = { first: 1, second: 2 };
    listeners.slice().forEach((listener) => listener());
    rerender();

    expect(container.innerHTML).toBe('<div>1</div>');
    expect(renders).toBe(1);

    snapshot = { first: 2, second: 2 };
    listeners.slice().forEach((listener) => listener());
    rerender();

    expect(container.innerHTML).toBe('<div>2</div>');
    expect(renders).toBe(2);
  });

  it('should not treat lifecycle-looking props as functional lifecycle hooks', () => {
    const spy = jasmine.createSpy();

    function ComponentWithProp(props) {
      return createElement('div', null, typeof props.onComponentDidMount);
    }

    render(
      createElement(ComponentWithProp, {
        onComponentDidMount: spy,
      }),
      container,
    );

    expect(container.innerHTML).toBe('<div>function</div>');
    expect(spy).not.toHaveBeenCalled();
  });
});
