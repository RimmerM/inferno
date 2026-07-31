import {
  Component,
  render,
  rerender,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'inferno';

/*
 * Hooks vs class components.
 *
 * The same component tree is built three ways - class components, hooks with
 * useEffect, and hooks with useLayoutEffect - and every run asserts the three
 * produce identical DOM and identical effect bookkeeping. Without that check
 * the timings would only be comparing whichever tree happened to do less work.
 *
 * Two tree shapes are available:
 *
 *   default  App > Row > Cell > Badge, where only Row owns state and an
 *            effect and the leaves are pure. This is what an idiomatic hooks
 *            codebase looks like, and it is the shape to quote for "should we
 *            use hooks".
 *   dense    every component owns state and an effect, which removes the
 *            dilution from pure leaves and measures the per component cost of
 *            hooks against the per component cost of a class.
 *
 * See start.js for how to run it.
 */

// A tiny external "store" for the effects to subscribe to, so that effect
// bodies do real work and can be counted for the equivalence check.
export const registry = {
  subscribes: 0,
  cleanups: 0,
  live: 0,
  subscribe(id) {
    this.subscribes++;
    this.live++;

    return () => {
      this.cleanups++;
      this.live--;
    };
  },
  reset() {
    this.subscribes = 0;
    this.cleanups = 0;
    this.live = 0;
  },
};

/*
 * Class rows record their instance so local state can be driven the same way
 * the hooks version drives its setters. Both implementations do exactly one
 * property store per render for this, so neither is handed an advantage.
 */
const classInstances = {};

let stableDeps = false;

/**
 * When enabled every effect keys off the row id, which never changes, so no
 * effect re-runs on a prop update. Comparing the two modes separates the cost
 * of per render hook bookkeeping from the cost of effect churn.
 */
export function setStableDeps(value) {
  stableDeps = value;
}

// Both implementations derive their effect key through this one function, so
// neither pays more than the other for the switch.
function effectKey(row, changing) {
  return stableDeps ? row.id : changing;
}

function formatLabel(row, generation) {
  return row.label + '#' + row.value + '/' + generation;
}

export function makeRows(count, generation) {
  const rows = new Array(count);

  for (let i = 0; i < count; i++) {
    rows[i] = {
      id: i,
      label: 'row-' + i,
      detail: 'detail-' + (i % 17),
      value: i * 3 + generation,
    };
  }

  return rows;
}

// ----------------------------------------------------------- class, default

class ClassBadge extends Component {
  render(props) {
    return <span className={'badge badge-' + props.tone}>{props.text}</span>;
  }
}

class ClassCell extends Component {
  render(props) {
    return (
      <td className="cell">
        <ClassBadge tone={props.tone} text={props.text} />
        <em>{props.detail}</em>
      </td>
    );
  }
}

class ClassRow extends Component {
  constructor(props) {
    super(props);
    this.state = { expanded: false };
    this.unsubscribe = null;
  }

  componentDidMount() {
    this.unsubscribe = registry.subscribe(this.props.row.id);
  }

  componentDidUpdate(prevProps) {
    if (
      effectKey(prevProps.row, prevProps.row.value) !==
      effectKey(this.props.row, this.props.row.value)
    ) {
      this.unsubscribe();
      this.unsubscribe = registry.subscribe(this.props.row.id);
    }
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  render(props, state) {
    classInstances[props.row.id] = this;

    const label = formatLabel(props.row, props.generation);

    return (
      <tr className={state.expanded ? 'row expanded' : 'row'}>
        <ClassCell tone="primary" text={label} detail={props.row.detail} />
        <ClassCell tone="muted" text={String(props.row.value)} detail="v" />
        <td className="cell">{state.expanded ? 'open' : 'closed'}</td>
      </tr>
    );
  }
}

class ClassApp extends Component {
  render(props) {
    return (
      <table className="table">
        <tbody>
          {props.rows.map((row) => (
            <ClassRow key={row.id} row={row} generation={props.generation} />
          ))}
        </tbody>
      </table>
    );
  }
}

// ----------------------------------------------------------- hooks, default

function HooksBadge(props) {
  return <span className={'badge badge-' + props.tone}>{props.text}</span>;
}

function HooksCell(props) {
  return (
    <td className="cell">
      <HooksBadge tone={props.tone} text={props.text} />
      <em>{props.detail}</em>
    </td>
  );
}

// The passive and layout variants must be distinct component functions, so
// that one implementation's hook state never leaks into the other's run.
function makeHooksRow(useEffectHook) {
  function HooksRow(props) {
    const [expanded, setExpanded] = useState(false);
    const label = useMemo(
      () => formatLabel(props.row, props.generation),
      [props.row, props.generation],
    );

    HooksRow.setters[props.row.id] = setExpanded;

    useEffectHook(() => registry.subscribe(props.row.id), [
      effectKey(props.row, props.row.value),
    ]);

    return (
      <tr className={expanded ? 'row expanded' : 'row'}>
        <HooksCell tone="primary" text={label} detail={props.row.detail} />
        <HooksCell tone="muted" text={String(props.row.value)} detail="v" />
        <td className="cell">{expanded ? 'open' : 'closed'}</td>
      </tr>
    );
  }

  HooksRow.setters = {};

  return HooksRow;
}

const HooksRowPassive = makeHooksRow(useEffect);
const HooksRowLayout = makeHooksRow(useLayoutEffect);

function HooksAppPassive(props) {
  return (
    <table className="table">
      <tbody>
        {props.rows.map((row) => (
          <HooksRowPassive
            key={row.id}
            row={row}
            generation={props.generation}
          />
        ))}
      </tbody>
    </table>
  );
}

function HooksAppLayout(props) {
  return (
    <table className="table">
      <tbody>
        {props.rows.map((row) => (
          <HooksRowLayout key={row.id} row={row} generation={props.generation} />
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------- class, dense

class DenseClassBadge extends Component {
  constructor(props) {
    super(props);
    this.state = { seen: 0 };
    this.unsubscribe = null;
  }

  componentDidMount() {
    this.unsubscribe = registry.subscribe(this.props.text);
  }

  componentDidUpdate(prevProps) {
    if (
      effectKey(prevProps.row, prevProps.text) !==
      effectKey(this.props.row, this.props.text)
    ) {
      this.unsubscribe();
      this.unsubscribe = registry.subscribe(this.props.text);
    }
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  render(props, state) {
    return (
      <span className={'badge badge-' + props.tone}>
        {props.text}
        {state.seen}
      </span>
    );
  }
}

class DenseClassCell extends Component {
  constructor(props) {
    super(props);
    this.state = { hovered: false };
    this.unsubscribe = null;
  }

  componentDidMount() {
    this.unsubscribe = registry.subscribe(this.props.detail);
  }

  componentDidUpdate(prevProps) {
    if (
      effectKey(prevProps.row, prevProps.detail) !==
      effectKey(this.props.row, this.props.detail)
    ) {
      this.unsubscribe();
      this.unsubscribe = registry.subscribe(this.props.detail);
    }
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  render(props, state) {
    return (
      <td className={state.hovered ? 'cell hovered' : 'cell'}>
        <DenseClassBadge row={props.row} tone={props.tone} text={props.text} />
        <em>{props.detail}</em>
      </td>
    );
  }
}

class DenseClassRow extends ClassRow {
  render(props, state) {
    classInstances[props.row.id] = this;

    const label = formatLabel(props.row, props.generation);

    return (
      <tr className={state.expanded ? 'row expanded' : 'row'}>
        <DenseClassCell
          row={props.row}
          tone="primary"
          text={label}
          detail={props.row.detail}
        />
        <DenseClassCell
          row={props.row}
          tone="muted"
          text={String(props.row.value)}
          detail="v"
        />
        <td className="cell">{state.expanded ? 'open' : 'closed'}</td>
      </tr>
    );
  }
}

class DenseClassApp extends Component {
  render(props) {
    return (
      <table className="table">
        <tbody>
          {props.rows.map((row) => (
            <DenseClassRow
              key={row.id}
              row={row}
              generation={props.generation}
            />
          ))}
        </tbody>
      </table>
    );
  }
}

// ------------------------------------------------------------- hooks, dense

function DenseHooksBadge(props) {
  const [seen] = useState(0);

  useEffect(() => registry.subscribe(props.text), [
    effectKey(props.row, props.text),
  ]);

  return (
    <span className={'badge badge-' + props.tone}>
      {props.text}
      {seen}
    </span>
  );
}

function DenseHooksCell(props) {
  const [hovered] = useState(false);

  useEffect(() => registry.subscribe(props.detail), [
    effectKey(props.row, props.detail),
  ]);

  return (
    <td className={hovered ? 'cell hovered' : 'cell'}>
      <DenseHooksBadge row={props.row} tone={props.tone} text={props.text} />
      <em>{props.detail}</em>
    </td>
  );
}

function DenseHooksRow(props) {
  const [expanded, setExpanded] = useState(false);
  const label = useMemo(
    () => formatLabel(props.row, props.generation),
    [props.row, props.generation],
  );

  DenseHooksRow.setters[props.row.id] = setExpanded;

  useEffect(() => registry.subscribe(props.row.id), [
    effectKey(props.row, props.row.value),
  ]);

  return (
    <tr className={expanded ? 'row expanded' : 'row'}>
      <DenseHooksCell
        row={props.row}
        tone="primary"
        text={label}
        detail={props.row.detail}
      />
      <DenseHooksCell
        row={props.row}
        tone="muted"
        text={String(props.row.value)}
        detail="v"
      />
      <td className="cell">{expanded ? 'open' : 'closed'}</td>
    </tr>
  );
}

DenseHooksRow.setters = {};

function DenseHooksApp(props) {
  return (
    <table className="table">
      <tbody>
        {props.rows.map((row) => (
          <DenseHooksRow key={row.id} row={row} generation={props.generation} />
        ))}
      </tbody>
    </table>
  );
}

// -------------------------------------------------------------------- exports

export const implementations = {
  class: {
    name: 'class components',
    renderTree(container, rows, generation) {
      render(<ClassApp rows={rows} generation={generation} />, container);
    },
    setLocalState(id, value) {
      classInstances[id].setState({ expanded: value });
    },
  },
  hooksPassive: {
    name: 'hooks (useEffect)',
    renderTree(container, rows, generation) {
      render(<HooksAppPassive rows={rows} generation={generation} />, container);
    },
    setLocalState(id, value) {
      HooksRowPassive.setters[id](value);
    },
  },
  hooksLayout: {
    name: 'hooks (useLayoutEffect)',
    renderTree(container, rows, generation) {
      render(<HooksAppLayout rows={rows} generation={generation} />, container);
    },
    setLocalState(id, value) {
      HooksRowLayout.setters[id](value);
    },
  },
};

export const denseImplementations = {
  class: {
    name: 'class components',
    renderTree(container, rows, generation) {
      render(<DenseClassApp rows={rows} generation={generation} />, container);
    },
    setLocalState(id, value) {
      classInstances[id].setState({ expanded: value });
    },
  },
  hooksPassive: {
    name: 'hooks (useEffect)',
    renderTree(container, rows, generation) {
      render(<DenseHooksApp rows={rows} generation={generation} />, container);
    },
    setLocalState(id, value) {
      DenseHooksRow.setters[id](value);
    },
  },
};

export function unmountTree(container) {
  render(null, container);
}

export { rerender };
