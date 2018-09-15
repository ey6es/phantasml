/**
 * Components related to tools.
 *
 * @module client/tool
 * @flow
 */

import * as React from 'react';
import {Nav} from 'reactstrap';

/**
 * The set of tools available.
 */
export class Toolset extends React.Component<{}, {}> {
  render() {
    return (
      <div>
        <Nav tabs className="pt-2 bg-black play-controls" />
      </div>
    );
  }
}
