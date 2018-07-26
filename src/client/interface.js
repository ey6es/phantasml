/**
 * Principal interface components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import type {UserStatusResponse} from '../server/api';

/**
 * The main app interface.
 */
export class Interface extends React.Component<
  {userStatus: UserStatusResponse},
  {},
> {
  render() {
    return <div />;
  }
}
