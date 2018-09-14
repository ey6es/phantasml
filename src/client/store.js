/**
 * Redux store for client.
 *
 * @module client/store
 * @flow
 */

import * as Redux from 'redux';
import uuid from 'uuid/v1';
import {getFromApi, putToApi} from './util/api';
import type {ResourceType} from '../server/api';
import type {Resource, ResourceAction, Entity} from '../server/store/resource';
import {
  ResourceActions,
  reducer as resourceReducer,
  undoStackReducer,
} from '../server/store/resource';
import {Scene, SceneActions, advanceEditNumber} from '../server/store/scene';

type StoreAction = {type: string, [string]: any};

export type TransferError = {retryAction: ?ResourceAction};

export type EditorTab = 'entity' | 'page';

type StoreState = {
  resource: ?Resource,
  resourceDirty: boolean,
  transferAction: ?StoreAction,
  transferError: ?TransferError,
  undoStack: ResourceAction[],
  redoStack: ResourceAction[],
  editorTab: EditorTab,
  page: string,
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
  editorTab: 'entity',
  page: '',
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
        resourceDirty: true,
        undoStack: state.undoStack.slice(0, undoIndex),
        redoStack,
        page: reducePage(state, undoAction),
        selection: reduceSelection(state, undoAction),
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
        resourceDirty: true,
        undoStack,
        redoStack: state.redoStack.slice(0, redoIndex),
        page: reducePage(state, redoAction),
        selection: reduceSelection(state, redoAction),
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
      const clipboard: Entity[] = [];
      const map = {};
      for (const id of state.selection) {
        const entity = state.resource.getEntity(id);
        if (entity) {
          clipboard.push(entity);
          map[id] = null;
        }
      }
      store.dispatch(SceneActions.editEntities.create(map));
      return Object.assign({}, state, {clipboard});
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
      const selection: Set<string> = new Set();
      const map = {};
      for (const entity of state.clipboard) {
        // TODO: regenerate ids and fix references
        selection.add(entity.id);
        map[entity.id] = entity.toJSON();
      }
      store.dispatch(SceneActions.editEntities.create(map));
      return Object.assign({}, state, {selection});
    },
  },
  delete: {
    create: () => ({type: 'delete'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const map = {};
      for (const id of state.selection) {
        map[id] = null;
      }
      store.dispatch(SceneActions.editEntities.create(map));
      return state;
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
          await putToApi(`/resource/${action.id}/content`, json, false);
          store.dispatch(StoreActions.finishTransfer.create(action));
        } catch (error) {
          console.warn(error);
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
          setStoreResource(type, json);
          store.dispatch(StoreActions.finishTransfer.create(action));
        } catch (error) {
          console.warn(error);
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
  setEditorTab: {
    create: (tab: EditorTab) => ({type: 'setEditorTab', tab}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {editorTab: action.tab});
    },
  },
  setPage: {
    create: (page: string = '') => ({type: 'setPage', page}),
    reduce: (state: StoreState, action: StoreAction) => {
      const resource = state.resource;
      if (!(resource instanceof Scene)) {
        return state;
      }
      let page = action.page;
      if (!resource.getEntity(page)) {
        if (resource.getEntity(state.page)) {
          return state; // continue to use the current page
        }
        const firstPage = resource.entityHierarchy.children[0].entity;
        page = firstPage ? firstPage.id : '';
      }
      return Object.assign({}, state, {page});
    },
  },
  setResource: {
    create: ResourceActions.setResource.create,
    reduce: (state: ?Resource, action: ResourceAction) => {
      return Object.assign({}, state, {
        resourceDirty: false,
        undoStack: [],
        redoStack: [],
        selection: (new Set(): Set<string>),
      });
    },
  },
  clearResource: {
    create: ResourceActions.clearResource.create,
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {
        undoStack: [],
        redoStack: [],
        page: '',
        selection: (new Set(): Set<string>),
      });
    },
  },
  editEntities: {
    create: SceneActions.editEntities.create,
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {
        page: reducePage(state, action),
        selection: reduceSelection(state, action),
      });
    },
  },
};

function reducePage(state: StoreState, action: ResourceAction): string {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.page;
  }
  let page = state.page;
  for (const id in action.map) {
    const state = action.map[id];
    if (state !== null) {
      const entity = resource.getEntity(id);
      if (!(state.parent || (entity && entity.getParent()))) {
        page = id; // switch to any added/edited page
      }
    } else if (page === id) {
      for (const child of resource.entityHierarchy.children) {
        if (child.id === id) {
          break;
        } else if (child.id && action.map[child.id] !== null) {
          page = child.id; // switch away from deleted page
        }
      }
    }
  }
  return page;
}

function reduceSelection(
  state: StoreState,
  action: ResourceAction,
): Set<string> {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.selection;
  }
  const selection: Set<string> = new Set(state.selection);
  for (const id in action.map) {
    if (action.map[id] === null) {
      selection.delete(id);
    }
  }
  return selection;
}

/** The global Redux store. */
export const store = Redux.createStore(reducer, initialState);

/**
 * Dispatches the necessary actions to set the store resource to one loaded
 * from JSON.
 *
 * @param type the resource type.
 * @param json the resource's JSON representation.
 */
export function setStoreResource(type: ResourceType, json: Object) {
  store.dispatch(StoreActions.setResource.create(type, json));
  store.dispatch(StoreActions.setPage.create());
}

/**
 * Creates and returns a UUID of the format we like.
 *
 * @return the newly generated UUID.
 */
export function createUuid(): string {
  // only 22 characters will be valid; the final two will be ==
  return btoa(String.fromCharCode(...uuid({}, [], 0)))
    .substring(0, 22)
    .replace(/[+/]/g, char => (char === '+' ? '-' : '_'));
}

// split edits when we press a key or mouse button
document.addEventListener('keydown', advanceEditNumber);
document.addEventListener('mousedown', advanceEditNumber);
