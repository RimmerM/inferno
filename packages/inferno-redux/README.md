# inferno-redux

Inferno Redux is a [redux](https://github.com/reactjs/redux) library for [Inferno](https://github.com/infernojs/inferno).

Inferno Redux passes the store through Inferno's indexed context internally.
Application components normally access it through `connect`.

## Install

```
npm install inferno-redux
```

## Contents

- Provider
- connect

## Usage

Usage of `inferno-redux` is similar to that of [react-redux](https://github.com/reactjs/react-redux).
Inspiration was taken from `react-redux` to provide Inferno with a similar API.

```js
import { Component, render } from 'inferno';
import { Router, Route, browserHistory } from 'inferno-router';
import { connect, Provider } from 'inferno-redux';
import { createStore } from 'redux';

const store = createStore(function (state, action) {
  switch (action.type) {
    case 'CHANGE_NAME':
      return {
        name: action.name,
      };
    default:
      return {
        name: 'TOM',
      };
  }
});

class App extends Component {
  render() {
    return <div>{this.props.children}</div>;
  }
}

class BasicComponent1View extends Component {
  render() {
    const onClick = (e) => {
      e.preventDefault();
      this.props.dispatch({
        type: 'CHANGE_NAME',
        name: 'Jerry',
      });
    };

    return (
      <div className="basic">
        <a id="dispatch" onClick={onClick}>
          <span>Hello {this.props.name || 'Tom'}</span>
        </a>
      </div>
    );
  }
}

const BasicComponent1 = connect((state) => ({ name: state.name }))(
  BasicComponent1View,
);

class BasicComponent2View extends Component {
  render() {
    return (
      <div className="basic2">
        {this.props.name === 'Jerry' ? "You're a mouse!" : "You're a cat!"}
      </div>
    );
  }
}

const BasicComponent2 = connect((state) => ({ name: state.name }))(
  BasicComponent2View,
);

render(
  <Provider store={store}>
    <Router history={browserHistory} component={App}>
      <Route path="/next" component={BasicComponent2} />
      <Route path="/" component={BasicComponent1} />
    </Router>
  </Provider>,
  container,
);
```
