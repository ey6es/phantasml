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

  reduceUndoStack(
    undoStack: ResourceAction[],
    action: ResourceAction,
  ): ResourceAction[] {
    const handler = EnvironmentActions[action.type];
    return handler && handler.reduceUndoStack
      ? handler.reduceUndoStack(this, undoStack, action)
      : undoStack;
  }

  /**
   * Given an edit represented by the specified map, returns the reverse edit.
   *
   * @param map the map containing the edit.
   * @return the reversed edit.
   */
  createReverseEdit(map: Object): Object {
    return {};
  }

  /**
   * Applies an edit represented by a map.
   *
   * @param map the edit to apply.
   * @return the new, edited environment.
   */
  applyEdit(map: Object): Environment {
    return this;
  }
}

// used to determine which edits to merge
let editNumber = 0;

/**
 * Advances the current edit number, ensuring that future edits will not be
 * merged with previous ones.
 */
export function advanceEditNumber() {
  editNumber++;
}

/**
 * Merges two entity edits into one.
 *
 * @param first the first edit to merge.
 * @param second the second edit to merge.
 * @return the merged edit.
 */
function mergeEntityEdits(first: Object, second: Object): Object {
  return {};
}

/**
 * The actions that apply to environments.
 */
export const EnvironmentActions = {
  setEnvironment: {
    create: (json: ?Object) => ({type: 'setEnvironment', json}),
    reduce: (state: ?Resource, action: ResourceAction) => {
      return new Environment(action.json);
    },
  },
  editEntities: {
    create: (map: Object) => ({type: 'editEntities', editNumber, map}),
    reduce: (state: Environment, action: ResourceAction) => {
      return state.applyEdit(action.map);
    },
    reduceUndoStack: (
      state: Environment,
      undoStack: ResourceAction[],
      action: ResourceAction,
    ) => {
      const reverseEdit = state.createReverseEdit(action.map);
      const undoIndex = undoStack.length - 1;
      if (undoIndex >= 0) {
        const lastUndo = undoStack[undoIndex];
        if (
          lastUndo.type === 'editEntities' &&
          lastUndo.editNumber === action.editNumber
        ) {
          // merge into existing edit
          return (undoStack
            .slice(0, undoIndex)
            .concat([
              mergeEntityEdits(lastUndo.map, reverseEdit),
            ]): ResourceAction[]);
        }
      }
      return (undoStack.concat([
        EnvironmentActions.editEntities.create(reverseEdit),
      ]): ResourceAction[]);
    },
  },
};

// creator actions need to be in the resource action list
addResourceActionHandler((EnvironmentActions: Object), 'setEnvironment');
