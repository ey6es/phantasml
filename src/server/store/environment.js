/**
 * Environment state model.
 *
 * @module server/store/environment
 * @flow
 */

import {Resource, addResourceActionHandler} from './resource';
import type {ResourceAction} from './resource';

/**
 * The state of a virtual environment.
 *
 * @param json the JSON representation of the environment, or null to create
 * an empty environment.
 */
export class Environment extends Resource {
  constructor(json: ?Object) {
    super();
  }

  reduce(action: ResourceAction): ?Resource {
    const handler = EnvironmentActions[action.type];
    return handler ? handler.reduce(this, action) : this;
  }
}

/**
 * The actions that apply to environments.
 */
export const EnvironmentActions = {
  setEnvironment: {
    create: (json: ?Object) => ({type: 'setEnvironment', json}),
    reduce: (state: ?Resource, action: Object) => new Environment(action.json),
  },
};

// creator actions need to be in the resource action list
addResourceActionHandler(EnvironmentActions, 'setEnvironment');
