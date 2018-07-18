// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {getFromApi} from './util/api';
import type {UserStatusResponse} from '../server/api';

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
  try {
    const response: UserStatusResponse = await getFromApi('/user/status', {
      test: 1,
    });
    console.log(response);
  } catch (error) {
    console.warn(error);
  }
})();
