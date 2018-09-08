/**
 * Redux store for client.
 *
 * @module client/store
 * @flow
 */

import * as Redux from 'redux';
import {getFromApi, putToApi} from './util/api';
import type {ResourceType} from '../server/api';
import type {Resource, ResourceAction, Entity} from '../server/store/resource';
import {
  reducer as resourceReducer,
  undoStackReducer,
} from '../server/store/resource';
import {Environment} from '../server/store/environment';

type StoreAction = {type: string, [string]: any};

export type TransferError = {retryAction: ?ResourceAction};

type StoreState = {
  resource: ?Resource,
  resourceDirty: boolean,
  transferAction: ?StoreAction,
  transferError: ?TransferError,
  undoStack: ResourceAction[],
  redoStack: ResourceAction[],
  selection: Set<string>,
  clipboard: Entity[],
};

const initialState = {
  resource: null,
  resourceDirty: false,
  transferAction: null,
  transferError: null,
  undoStack: [],
  redoStack: [],
  selection: new Set(),
  clipboard: [],
};

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
    state = Object.assign({}, state, {
      resource,
      resourceDirty: state.resourceDirty || undoStack !== state.undoStack,
      undoStack,
    });
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
  select: {
    create: (map: {[string]: boolean}, additive: boolean = false) => ({
      type: 'select',
      map,
      additive,
    }),
    reduce: (state: StoreState, action: StoreAction) => {
      const selection: Set<string> = new Set(
        action.additive ? state.selection : undefined,
      );
      for (const key in action.map) {
        action.map[key] ? selection.add(key) : selection.delete(key);
      }
      return Object.assign({}, state, {selection});
    },
  },
  cut: {
    create: () => ({type: 'cut'}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      let resource = state.resource;
      const selection: Set<string> = new Set();
      const clipboard: Entity[] = [];
      for (const id of state.selection) {
        const entity = resource.getEntity(id);
        if (entity) {
          clipboard.push(entity);
          resource = resource.removeEntity(id);
        }
      }
      return Object.assign({}, state, {resource, selection, clipboard});
    },
  },
  copy: {
    create: () => ({type: 'copy'}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      const clipboard: Entity[] = [];
      for (const id of state.selection) {
        const entity = state.resource.getEntity(id);
        entity && clipboard.push(entity);
      }
      return Object.assign({}, state, {clipboard});
    },
  },
  paste: {
    create: () => ({type: 'paste'}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      let resource = state.resource;
      const selection: Set<string> = new Set();
      for (const entity of state.clipboard) {
        resource = resource.addEntity(entity);
        selection.add(entity.id);
      }
      return Object.assign({}, state, {resource, selection});
    },
  },
  delete: {
    create: () => ({type: 'delete'}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      let resource = state.resource;
      for (const id of state.selection) {
        resource = resource.removeEntity(id);
      }
      const selection: Set<string> = new Set();
      return Object.assign({}, state, {resource, selection});
    },
  },
  saveResource: {
    create: (id: string, json?: Object) => ({type: 'saveResource', id, json}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      const json = action.json || state.resource.toJSON();
      (async () => {
        try {
          await putToApi(`/resource/${action.id}/content`, json);
          store.dispatch(StoreActions.finishTransfer.create(action));
        } catch (error) {
          store.dispatch(
            StoreActions.finishTransfer.create(action, {
              retryAction: StoreActions.saveResource.create(action.id, json),
            }),
          );
        }
      })();
      return Object.assign({}, state, {
        resourceDirty: false,
        transferAction: action,
      });
    },
  },
  loadResource: {
    create: (id: string) => ({type: 'loadResource', id}),
    reduce: (state: StoreState, action: StoreAction) => {
      if (!state.resource) {
        return state;
      }
      const type = state.resource.getType();
      (async () => {
        try {
          const json = await getFromApi(`/resource/${action.id}/content`);
          store.dispatch(StoreActions.setResource.create(type, json));
          store.dispatch(StoreActions.finishTransfer.create(action));
        } catch (error) {
          store.dispatch(
            StoreActions.finishTransfer.create(action, {
              retryAction: action,
            }),
          );
        }
      })();
      return Object.assign({}, state, {
        transferAction: action,
      });
    },
  },
  finishTransfer: {
    create: (transferAction: StoreAction, error?: TransferError) => ({
      type: 'finishTransfer',
      transferAction,
      error,
    }),
    reduce: (state: StoreState, action: StoreAction) => {
      if (state.transferAction !== action.transferAction) {
        return state;
      }
      return Object.assign({}, state, {
        transferAction: null,
        transferError: action.error,
      });
    },
  },
  clearTransferError: {
    create: () => ({type: 'clearTransferError'}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {transferError: null});
    },
  },
  setResource: {
    create: (resourceType: ResourceType, json: Object) => ({
      type: 'setResource',
      resourceType,
      json,
    }),
    reduce: (state: ?Resource, action: ResourceAction) => {
      return Object.assign({}, state, {
        undoStack: [],
        redoStack: [],
        selection: (new Set(): Set<string>),
      });
    },
  },
  clearResource: {
    create: () => ({type: 'clearResource'}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {
        undoStack: [],
        redoStack: [],
        selection: (new Set(): Set<string>),
      });
    },
  },
};

/** The global Redux store. */
export const store = Redux.createStore(reducer, initialState);
