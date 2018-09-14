/**
 * Components related to tools.
 *
 * @module client/tool
 * @flow
 */

import * as React from 'react';

/**
 * The set of tools available.
 */
export class Toolset extends React.Component<{}, {}> {
  render() {
    return (
      <div className="pt-1 bg-black border-bottom border-secondary toolset" />
    );
  }
}
