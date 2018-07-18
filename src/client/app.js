// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {postToApi} from './util/api';
import type {SessionRequest, SessionResponse} from '../shared/api';

function App(props: {}) {
  return <div>Testing...</div>;
}

/* ReactDOM.render(
  <IntlProvider locale={navigator.language}>
    <App />
  </IntlProvider>,
  (document.getElementById('app'): any),
); */

// contact api to determine session information
(async function() {
  const request: SessionRequest = {};
  try {
    const response: SessionResponse = await postToApi('/session', request);
    console.log(response);
  } catch (error) {
    console.warn(error);
  }
})();
