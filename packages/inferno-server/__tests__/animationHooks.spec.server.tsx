import { renderToStaticMarkup, renderToString } from 'inferno-server';
import { Component, useAnimation } from 'inferno';

/**
 * NOTE! Animation hooks aren't called during SSR because they use different rendering paths
 */

describe('SSR Creation (JSX)', () => {
  it('should not call "componentDidAppear" when component is rendered with renderToStaticMarkup', (done) => {
    const spyer = jasmine.createSpy();
    class App extends Component {
      componentDidAppear(dom) {
        spyer('didAppear');
        expect(dom instanceof HTMLDivElement).toEqual(true);
      }

      render() {
        return <div />;
      }
    }

    const outp = renderToStaticMarkup(<App />);

    // Doing this async to be sure
    setTimeout(() => {
      expect(spyer).toHaveBeenCalledTimes(0);
      expect(outp).toEqual('<div></div>');
      done();
    }, 10);
  });

  it('should not call "componentDidAppear" when component is rendered with renderToString', (done) => {
    const spyer = jasmine.createSpy();
    class App extends Component {
      componentDidAppear(dom) {
        spyer('didAppear');
        expect(dom instanceof HTMLDivElement).toEqual(true);
      }

      render() {
        return <div />;
      }
    }

    const outp = renderToString(<App />);

    // Doing this async to be sure
    setTimeout(() => {
      expect(spyer).toHaveBeenCalledTimes(0);
      expect(outp).toEqual('<div></div>');
      done();
    }, 10);
  });

  it('should not call functional animation hooks when component is rendered with renderToStaticMarkup', (done) => {
    const spyer = jasmine.createSpy();

    const MyComp = () => {
      useAnimation({
        onAppear(dom) {
          spyer('didAppear');
          expect(dom instanceof HTMLDivElement).toEqual(true);
        },
      });

      return <div />;
    };

    class App extends Component {
      render() {
        return <MyComp />;
      }
    }

    const outp = renderToStaticMarkup(<App />);

    // Doing this async to be sure
    setTimeout(() => {
      expect(spyer).toHaveBeenCalledTimes(0);
      expect(outp).toEqual('<div></div>');
      done();
    }, 10);
  });

  it('should not call functional animation hooks when component is rendered with renderToString', (done) => {
    const spyer = jasmine.createSpy();

    const MyComp = () => {
      useAnimation({
        onAppear(dom) {
          spyer('didAppear');
          expect(dom instanceof HTMLDivElement).toEqual(true);
        },
      });

      return <div />;
    };

    class App extends Component {
      render() {
        return <MyComp />;
      }
    }

    const outp = renderToString(<App />);

    // Doing this async to be sure
    setTimeout(() => {
      expect(spyer).toHaveBeenCalledTimes(0);
      expect(outp).toEqual('<div></div>');
      done();
    }, 10);
  });
});
