import '../libs/setup.js';
import {
  denseImplementations,
  implementations as defaultImplementations,
  makeRows,
  registry,
  rerender,
  setStableDeps,
  unmountTree,
} from './dist/bundle.js';

/*
 * Hooks vs class components. See app.js for what the tree looks like.
 *
 * Build first, from the repo root:
 *
 *   pnpm run build                  # needs packages/inferno/dist/index.mjs
 *   node scripts/fakedom/build.js   # bundles this benchmark against it
 *
 * Then:
 *
 *   node --expose-gc scripts/fakedom/hooks-vs-classes/start.js
 *
 * The bundle is built with NODE_ENV=production, so none of Inferno's
 * development checks are in the numbers.
 *
 * Options, all environment variables:
 *
 *   ROWS=1000          rows in the table (x5 components each)
 *   UPDATES=20         prop driven re-renders in the update phase
 *   STATE_PASSES=20    local state toggles over every row
 *   REPEATS=15         measured runs per implementation
 *   WARMUP=4           unmeasured runs per implementation first
 *   DENSE=1            every component owns state and an effect
 *   STABLE_DEPS=1      effect deps never change, so no effect re-runs
 *   JSON=1             also print a machine readable line
 *   MODE=memory        measure retained heap instead of time
 *   ONLY=<impl>        which implementation to measure in memory mode
 *   TREES=6            live trees to hold in memory mode
 *
 * A note on the memory mode: a single before/after heap delta is swamped by
 * GC slack - it does not even scale with ROWS. Holding N trees live at once
 * and taking the slope removes whatever constant error the baseline carries,
 * and reproduces to within a fraction of a percent.
 */

const ROWS = Number(process.env.ROWS || 1000);
const UPDATES = Number(process.env.UPDATES || 20);
const STATE_PASSES = Number(process.env.STATE_PASSES || 20);
const REPEATS = Number(process.env.REPEATS || 15);
const WARMUP = Number(process.env.WARMUP || 4);
const TREES = Number(process.env.TREES || 6);
const DENSE = process.env.DENSE === '1';
const STABLE_DEPS = process.env.STABLE_DEPS === '1';

const implementations = DENSE ? denseImplementations : defaultImplementations;
const keys = DENSE
  ? ['class', 'hooksPassive']
  : ['class', 'hooksPassive', 'hooksLayout'];
const phases = ['mount', 'propUpdate', 'stateUpdate', 'unmount'];

setStableDeps(STABLE_DEPS);

// Passive effects land on a microtask, so every phase has to settle before
// the clock stops or the hooks numbers would be missing their effect work.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function newContainer() {
  const element = document.createElement('div');

  document.body.appendChild(element);

  return element;
}

async function runOnce(impl) {
  const container = newContainer();
  const { renderTree, setLocalState } = impl;
  const generations = [];

  for (let g = 0; g <= UPDATES; g++) {
    generations.push(makeRows(ROWS, g));
  }

  registry.reset();

  let t = performance.now();
  renderTree(container, generations[0], 0);
  await settle();
  const mount = performance.now() - t;

  const html = container.innerHTML;

  t = performance.now();
  for (let g = 1; g <= UPDATES; g++) {
    renderTree(container, generations[g], g);
  }
  await settle();
  const propUpdate = performance.now() - t;

  t = performance.now();
  for (let pass = 0; pass < STATE_PASSES; pass++) {
    for (let i = 0; i < ROWS; i++) {
      setLocalState(i, pass % 2 === 0);
    }
    rerender();
  }
  await settle();
  const stateUpdate = performance.now() - t;

  t = performance.now();
  unmountTree(container);
  await settle();
  const unmount = performance.now() - t;

  container.remove();

  return {
    mount,
    propUpdate,
    stateUpdate,
    unmount,
    html,
    subscribes: registry.subscribes,
    cleanups: registry.cleanups,
    live: registry.live,
  };
}

async function measureRetainedHeap(impl) {
  const held = [];
  const samples = [];

  for (let i = 0; i < TREES; i++) {
    const container = newContainer();

    impl.renderTree(container, makeRows(ROWS, 0), 0);
    await settle();
    held.push(container);

    global.gc();
    global.gc();
    global.gc();
    samples.push(process.memoryUsage().heapUsed);
  }

  // Least squares slope, dropping the first tree because it also pays for
  // one-off allocations that no later tree repeats.
  const xs = samples.map((_, i) => i).slice(1);
  const ys = samples.slice(1);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let covariance = 0;
  let variance = 0;

  for (let i = 0; i < xs.length; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    variance += (xs[i] - meanX) ** 2;
  }

  if (held.some((container) => container.innerHTML.length === 0)) {
    throw new Error('a held tree rendered nothing');
  }

  return covariance / variance;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function interquartileSpread(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

  return (quantile(0.75) - quantile(0.25)) / median(values);
}

const pad = (value, width) => String(value).padEnd(width);

if (process.env.MODE === 'memory') {
  if (!global.gc) {
    throw new Error('memory mode needs node --expose-gc');
  }

  const only = process.env.ONLY;

  if (!implementations[only]) {
    throw new Error(
      `ONLY must be one of ${Object.keys(implementations).join(', ')}`,
    );
  }

  const perTree = await measureRetainedHeap(implementations[only]);

  console.log(
    JSON.stringify({
      impl: only,
      rows: ROWS,
      perTreeKB: +(perTree / 1024).toFixed(1),
      perComponentBytes: +(perTree / (ROWS * 5)).toFixed(1),
    }),
  );
} else {
  const results = {};
  const htmls = {};
  const bookkeeping = {};

  // Warm every implementation before measuring any of them, so none of them
  // pays for the others' JIT tiering.
  for (let i = 0; i < WARMUP; i++) {
    for (const key of keys) {
      await runOnce(implementations[key]);
    }
  }

  for (const key of keys) {
    results[key] = { mount: [], propUpdate: [], stateUpdate: [], unmount: [] };
  }

  for (let i = 0; i < REPEATS; i++) {
    for (const key of keys) {
      const run = await runOnce(implementations[key]);

      for (const phase of phases) {
        results[key][phase].push(run[phase]);
      }

      htmls[key] = run.html;
      bookkeeping[key] = {
        subscribes: run.subscribes,
        cleanups: run.cleanups,
        live: run.live,
      };
    }
  }

  /*
   * The comparison only means something if the implementations did the same
   * work, so check that before printing a single number.
   */
  const sameDOM = keys.every((key) => htmls[key] === htmls.class);
  const sameEffects = keys.every(
    (key) =>
      bookkeeping[key].subscribes === bookkeeping.class.subscribes &&
      bookkeeping[key].cleanups === bookkeeping.class.cleanups &&
      bookkeeping[key].live === 0,
  );

  console.log(
    'rows=%d  updates=%d  state passes=%d  repeats=%d  dense=%s  stableDeps=%s',
    ROWS,
    UPDATES,
    STATE_PASSES,
    REPEATS,
    DENSE,
    STABLE_DEPS,
  );
  console.log(
    'identical DOM: %s (%d chars)   identical effects: %s (%d subscribes)\n',
    sameDOM,
    htmls.class.length,
    sameEffects,
    bookkeeping.class.subscribes,
  );

  if (!sameDOM || !sameEffects) {
    throw new Error(
      'implementations diverged, the timings below would be meaningless',
    );
  }

  console.log(
    pad('phase', 14) + keys.map((k) => pad(implementations[k].name, 26)).join(''),
  );
  console.log('-'.repeat(14 + keys.length * 26));

  for (const phase of phases) {
    let line = pad(phase, 14);

    for (const key of keys) {
      const value = median(results[key][phase]);
      const spread = (interquartileSpread(results[key][phase]) * 100).toFixed(0);
      const ratio =
        key === 'class'
          ? ''
          : ` (${(value / median(results.class[phase])).toFixed(2)}x)`;

      line += pad(`${value.toFixed(2).padStart(8)}ms ±${spread}%${ratio}`, 26);
    }

    console.log(line);
  }

  console.log(
    '\n(median of %d runs, ± = interquartile spread, x = vs class)',
    REPEATS,
  );

  if (process.env.JSON === '1') {
    const out = { rows: ROWS, dense: DENSE, stableDeps: STABLE_DEPS };

    for (const key of keys) {
      out[key] = {};

      for (const phase of phases) {
        out[key][phase] = median(results[key][phase]);
      }
    }

    console.log('JSON ' + JSON.stringify(out));
  }
}
