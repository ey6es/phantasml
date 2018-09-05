/**
 * Redux store for client.
 *
 * @module client/store
 * @flow
 */

import * as Redux from 'redux';
import type {Resource, ResourceAction} from '../server/store/resource';
import {
  reducer as resourceReducer,
  undoStackReducer,
} from '../server/store/resource';

type StoreState = {
  resource: ?Resource,
  undoStack: ResourceAction[],
  redoStack: ResourceAction[],
  selection: Set<string>,
  clipboard: ?Object,
};

const initialState = {
  resource: null,
  undoStack: [],
  redoStack: [],
  selection: new Set(),
  clipboard: null,
};

type StoreAction = {type: string};

function reducer(state: StoreState, action: StoreAction): StoreState {
  // make sure we have a valid state
  if (!state) {
    state = initialState;
  }
  // first try the store actions
  const handler = StoreActions[action.type];
  if (handler) {
    state = handler.reduce(state, action);
  }
  // then the resource actions
  const undoStack = undoStackReducer(state.resource, state.undoStack, action);
  const resource = resourceReducer(state.resource, action);
  if (resource !== state.resource || undoStack !== state.undoStack) {
    state = Object.assign({}, state, {resource, undoStack});
  }
  return state;
}

/**
 * The map containing all the store actions.
 */
export const StoreActions = {
  undo: {
    create: () => ({type: 'undo'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const undoIndex = state.undoStack.length - 1;
      if (undoIndex < 0) {
        throw new Error('No action to undo.');
      }
      const undoAction = state.undoStack[undoIndex];
      const redoStack = undoStackReducer(
        state.resource,
        state.redoStack,
        undoAction,
      );
      return (Object.assign({}, state, {
        resource: resourceReducer(state.resource, undoAction),
        undoStack: state.undoStack.slice(0, undoIndex),
        redoStack,
      }): StoreState);
    },
  },
  redo: {
    create: () => ({type: 'redo'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const redoIndex = state.redoStack.length - 1;
      if (redoIndex < 0) {
        throw new Error('No action to redo.');
      }
      const redoAction = state.redoStack[redoIndex];
      const undoStack = undoStackReducer(
        state.resource,
        state.undoStack,
        redoAction,
      );
      return (Object.assign({}, state, {
        resource: resourceReducer(state.resource, redoAction),
        undoStack,
        redoStack: state.redoStack.slice(0, redoIndex),
      }): StoreState);
    },
  },
  clearResource: {
    create: () => ({type: 'clearResource'}),
    reduce: (state: StoreState, action: StoreAction) => {
      return (Object.assign({}, state, {
        undoStack: [],
        redoStack: [],
        selection: new Set(),
      }): StoreState);
    },
  },
};

const store = Redux.createStore(reducer, initialState);

/** The global Redux store. */
export default store;
