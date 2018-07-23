// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {getFromApi} from './util/api';
import type {UserStatusResponse} from '../server/api';

function App(props: {}) {
  return <div>Testing...</div>;
}

// contact api to determine session information
(async function() {
  let errorMessage: ?string;
  try {
    const response: UserStatusResponse = await getFromApi('/user/status');
  } catch (error) {
    errorMessage = error.message;
  }

  ReactDOM.render(
    <IntlProvider locale={navigator.language}>
      <App />
    </IntlProvider>,
    (document.getElementById('app'): any),
  );
})();
