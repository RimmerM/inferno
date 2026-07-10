import {
  Component,
  createRef,
  type Props,
  type RefObject,
  render,
} from 'inferno';
import {
  renderToString,
  streamAsString,
  streamQueueAsString,
} from 'inferno-server';
import { hydrate } from 'inferno-hydrate';
import { isString } from 'inferno-shared';
import concatStream from 'concat-stream';

describe('SSR -> Hydrate - direct ref props', () => {
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

  function SSRtoString(method, vNode, callback) {
    const val = method(vNode);

    if (isString(val)) {
      callback(val);
    } else {
      val.pipe(
        concatStream(function (buffer) {
          callback(buffer.toString('utf-8'));
        }),
      );
    }
  }

  for (const method of [renderToString, streamAsString, streamQueueAsString]) {
    it('Should be possible to forward createRef', (done) => {
      const FancyButton = (props: Props<HTMLButtonElement>) => (
        <button ref={props.ref} className="FancyButton">
          {props.children}
        </button>
      );

      class Hello extends Component<any, any> {
        private readonly btn: RefObject<any>;

        constructor(props) {
          super(props);

          // You can now get a ref directly to the DOM button:
          this.btn = createRef();
        }

        public componentDidMount() {
          expect(this.btn.current).toBe(container.querySelector('button'));
        }

        public render() {
          return <FancyButton ref={this.btn}>Click me!</FancyButton>;
        }
      }

      SSRtoString(method, <Hello />, function (htmlString) {
        expect(htmlString).toBe(
          '<button class="FancyButton">Click me!</button>',
        );

        container.innerHTML = htmlString;

        renderToString(<Hello />);

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me!</button>',
        );

        hydrate(<Hello />, container);

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me!</button>',
        );

        done();
      });
    });

    it('Should be possible to forward callback ref', (done) => {
      const FancyButton = (props: Props<HTMLButtonElement>) => (
        <button ref={props.ref} className="FancyButton">
          {props.children}
        </button>
      );

      class Hello extends Component {
        public render() {
          return (
            <FancyButton
              ref={(btn) => {
                if (btn) {
                  expect(btn).toBe(container.querySelector('button'));
                }
              }}
            >
              Click me!
            </FancyButton>
          );
        }
      }

      SSRtoString(method, <Hello />, function (htmlString) {
        container.innerHTML = htmlString;

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me!</button>',
        );

        hydrate(<Hello />, container);

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me!</button>',
        );

        render(null, container);

        expect(container.innerHTML).toBe('');

        done();
      });
    });

    it('Should be possible to patch a component with a ref prop', () => {
      const FancyButton = (props: Props<HTMLButtonElement>) => {
        return (
          <button ref={props.ref} className="FancyButton">
            {props.children}
          </button>
        );
      };

      SSRtoString(method, <FancyButton />, function (htmlString) {
        let firstVal: Element | null = null;

        container.innerHTML = htmlString;

        hydrate(
          <FancyButton
            ref={(btn) => {
              firstVal = btn;
            }}
          >
            Click me!
          </FancyButton>,
          container,
        );

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me!</button>',
        );
        expect(firstVal).not.toBe(null);

        let secondVal: Element | null = null;

        render(
          <FancyButton
            ref={(btn) => {
              secondVal = btn;
            }}
          >
            Click me! 222
          </FancyButton>,
          container,
        );

        expect(firstVal).toBe(null);
        expect(secondVal).not.toBe(null);

        expect(container.innerHTML).toBe(
          '<button class="FancyButton">Click me! 222</button>',
        );
      });
    });
  }
});
