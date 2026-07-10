import {
  Component,
  createRef,
  memo,
  type Props,
  type RefObject,
  render,
} from 'inferno';

describe('Direct ref props', () => {
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

  it('forwards an object ref through a function component', () => {
    function FancyButton(props: Props<HTMLButtonElement>) {
      return (
        <button ref={props.ref} className="FancyButton">
          {props.children}
        </button>
      );
    }

    class Hello extends Component {
      private readonly btn: RefObject<HTMLButtonElement> = createRef();

      public componentDidMount() {
        expect(this.btn.current).toBe(container.querySelector('button'));
      }

      public render() {
        return <FancyButton ref={this.btn}>Click me!</FancyButton>;
      }
    }

    render(<Hello />, container);
    expect(container.innerHTML).toBe(
      '<button class="FancyButton">Click me!</button>',
    );
  });

  it('forwards and patches callback refs', () => {
    function FancyButton(props: Props<HTMLButtonElement>) {
      return (
        <button ref={props.ref} className="FancyButton">
          {props.children}
        </button>
      );
    }

    let firstVal: HTMLButtonElement | null = null;
    render(
      <FancyButton ref={(button) => (firstVal = button)}>
        Click me!
      </FancyButton>,
      container,
    );
    expect(firstVal).not.toBe(null);

    let secondVal: HTMLButtonElement | null = null;
    render(
      <FancyButton ref={(button) => (secondVal = button)}>
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

  it('treats ref as a normal memoized prop', () => {
    let renders = 0;
    const firstRef = createRef<HTMLButtonElement>();
    const secondRef = createRef<HTMLButtonElement>();
    const FancyButton = memo(function FancyButton(
      props: Props<HTMLButtonElement> & { label: string },
    ) {
      renders++;
      return (
        <button ref={props.ref} className="FancyButton">
          {props.label}
        </button>
      );
    });

    render(<FancyButton ref={firstRef} label="Click me!" />, container);
    render(<FancyButton ref={firstRef} label="Click me!" />, container);
    expect(renders).toBe(1);

    render(<FancyButton ref={secondRef} label="Click me!" />, container);
    expect(firstRef.current).toBe(null);
    expect(secondRef.current).toBe(container.querySelector('button'));
    expect(renders).toBe(2);
  });

  it('supports defaultProps on components with direct refs', () => {
    function FancyButton(
      props: Props<HTMLSpanElement> & { className: string; foo?: string },
    ) {
      return (
        <div className={props.className}>
          <span ref={props.ref}>{props.children}</span>
          {props.foo}
        </div>
      );
    }

    FancyButton.defaultProps = { foo: 'bar' };
    const ref = createRef<HTMLSpanElement>();

    render(
      <FancyButton className="okay" ref={ref}>
        <a>1</a>
      </FancyButton>,
      container,
    );

    expect(ref.current).toBe(container.querySelector('span'));
    expect(container.innerHTML).toBe(
      '<div class="okay"><span><a>1</a></span>bar</div>',
    );
  });
});
