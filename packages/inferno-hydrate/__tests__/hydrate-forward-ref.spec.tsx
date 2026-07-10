import {
  Component,
  createRef,
  type Props,
  type RefObject,
  render,
} from 'inferno';
import { hydrate } from 'inferno-hydrate';

describe('Hydrate - direct ref props', () => {
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

  it('Should be possible to forward createRef', () => {
    const FancyButton = (props: Props<HTMLButtonElement>) => (
      <button ref={props.ref} className="FancyButton">
        {props.children}
      </button>
    );

    class Hello extends Component {
      private readonly btn: RefObject<HTMLButtonElement>;

      constructor(props) {
        super(props);

        // You can now get a ref directly to the DOM button:
        this.btn = createRef();
      }

      componentDidMount() {
        expect(this.btn.current).toBe(container.querySelector('button'));
      }

      render() {
        return <FancyButton ref={this.btn}>Click me!</FancyButton>;
      }
    }

    container.innerHTML = '<button class="FancyButton">Click me!</button>';

    hydrate(<Hello />, container);

    expect(container.innerHTML).toBe(
      '<button class="FancyButton">Click me!</button>',
    );
  });

  it('Should be possible to forward callback ref', () => {
    const FancyButton = (props: Props<HTMLButtonElement>) => (
      <button ref={props.ref} className="FancyButton">
        {props.children}
      </button>
    );

    class Hello extends Component {
      render() {
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

    container.innerHTML = '<button class="FancyButton">Click me!</button>';

    hydrate(<Hello />, container);

    expect(container.innerHTML).toBe(
      '<button class="FancyButton">Click me!</button>',
    );

    render(null, container);

    expect(container.innerHTML).toBe('');
  });

  it('Should be possible to patch a component with a ref prop', () => {
    const FancyButton = (props: Props<HTMLButtonElement>) => {
      return (
        <button ref={props.ref} className="FancyButton">
          {props.children}
        </button>
      );
    };

    let firstVal: HTMLButtonElement | null = null;

    container.innerHTML = '<button class="FancyButton">Click me!</button>';

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

    let secondVal: HTMLButtonElement | null = null;

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
