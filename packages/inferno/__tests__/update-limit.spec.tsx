import { Component, render, rerender, useState } from 'inferno';

/*
 * These live in their own file because hitting the update limit deliberately
 * leaves work queued, and the scheduler is global state shared by every spec
 * in a file.
 */
describe('Update limit', () => {
  let container;

  beforeEach(function () {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(function () {
    render(null, container);
    document.body.removeChild(container);
  });

  it('should throw rather than loop forever when a functional component updates state while rendering', () => {
    function RunawayComponent() {
      const [value, setValue] = useState(0);

      setValue(value + 1);

      return <div>{value}</div>;
    }

    render(<RunawayComponent />, container);

    expect(() => {
      rerender();
    }).toThrow(
      new Error(
        'Inferno Error: too many re-renders. A component is updating state while rendering, which leaves the update loop unable to settle.',
      ),
    );
  });

  it('should leave the scheduler usable after the limit is hit', () => {
    function RunawayComponent() {
      const [value, setValue] = useState(0);

      setValue(value + 1);

      return <div>{value}</div>;
    }

    render(<RunawayComponent />, container);
    expect(() => {
      rerender();
    }).toThrow();

    render(null, container);

    // A component that settles must still render and update normally.
    let bump;

    function Healthy() {
      const [value, setValue] = useState(0);

      bump = setValue;

      return <span>{value}</span>;
    }

    render(<Healthy />, container);
    expect(container.innerHTML).toBe('<span>0</span>');

    bump(1);
    rerender();
    expect(container.innerHTML).toBe('<span>1</span>');
  });

  it('should not mistake many queued components for a runaway loop', () => {
    const setters: Array<(value: number) => void> = [];

    function Row(props: { index: number }) {
      const [value, setValue] = useState(0);

      setters[props.index] = setValue;

      return <li>{value}</li>;
    }

    const rows: any[] = [];

    for (let i = 0; i < 200; i++) {
      rows.push(<Row key={i} index={i} />);
    }

    render(<ul>{rows}</ul>, container);

    for (let i = 0; i < setters.length; i++) {
      setters[i](i);
    }

    rerender();

    expect(container.querySelectorAll('li').length).toBe(200);
    expect(container.querySelectorAll('li')[199].textContent).toBe('199');
  });

  it('should throw rather than loop forever when a class component updates state while rendering', () => {
    class RunawayClass extends Component<unknown, { n: number }> {
      public state = { n: 0 };

      public render() {
        this.setState({ n: this.state.n + 1 });

        return <div>{this.state.n}</div>;
      }
    }

    expect(() => {
      render(<RunawayClass />, container);
      rerender();
    }).toThrow(
      new Error(
        'Inferno Error: too many re-renders. A component is updating state while rendering, which leaves the update loop unable to settle.',
      ),
    );
  });
});
