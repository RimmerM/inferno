import { readContext, render } from 'inferno';
import { Router, routerContext } from 'inferno-router';
import { createMemoryHistory } from 'history';

describe('A <Router>', () => {
  describe('with exactly one child', () => {
    it('does not throw an error', () => {
      const node = document.createElement('div');
      expect(() => {
        render(
          <Router history={createMemoryHistory()}>
            <p>Bar</p>
          </Router>,
          node,
        );
      }).not.toThrow();
    });
  });

  describe('with no children', () => {
    it('does not throw an error', () => {
      const node = document.createElement('div');
      expect(() => {
        // @ts-expect-error
        render(<Router history={createMemoryHistory()} />, node);
      }).not.toThrow();
    });
  });

  describe('context', () => {
    let rootContext;
    const ContextChecker = (_props, context) => {
      rootContext = readContext(context, routerContext);
      return null;
    };

    afterEach(() => {
      rootContext = undefined;
    });

    it('puts history on context.history', () => {
      const node = document.createElement('div');
      const history = createMemoryHistory();
      render(
        <Router history={history}>
          <ContextChecker />
        </Router>,
        node,
      );

      expect(rootContext.history).toBe(history);
    });

    it('sets context.router.route at the root', () => {
      const node = document.createElement('div');
      const history = createMemoryHistory({
        initialEntries: ['/'],
      });

      render(
        <Router history={history}>
          <ContextChecker />
        </Router>,
        node,
      );

      expect(rootContext.route.match.path).toEqual('/');
      expect(rootContext.route.match.url).toEqual('/');
      expect(rootContext.route.match.params).toEqual({});
      expect(rootContext.route.match.isExact).toEqual(true);
      expect(rootContext.route.location).toEqual(history.location);
    });

    it('updates context.router.route upon navigation', () => {
      const node = document.createElement('div');
      const history = createMemoryHistory({
        initialEntries: ['/'],
      });

      render(
        <Router history={history}>
          <ContextChecker />
        </Router>,
        node,
      );

      expect(rootContext.route.match.isExact).toBe(true);

      const newLocation = { pathname: '/new' };
      history.push(newLocation);

      expect(rootContext.route.match.isExact).toBe(false);
    });

    it('does not contain context.router.staticContext by default', () => {
      const node = document.createElement('div');
      const history = createMemoryHistory({
        initialEntries: ['/'],
      });

      render(
        <Router history={history}>
          <ContextChecker />
        </Router>,
        node,
      );

      expect(rootContext.staticContext).toBe(undefined);
    });
  });
});
