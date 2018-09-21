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
import type {
  Resource,
  ResourceAction,
  Entity,
  EntityReference,
} from '../server/store/resource';
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
  savedEditNumber: number,
  transferAction: ?StoreAction,
  transferError: ?TransferError,
  undoStack: ResourceAction[],
  redoStack: ResourceAction[],
  editorTab: EditorTab,
  page: string,
  draggingPage: ?string,
  expanded: Set<string>,
  selection: Set<string>,
  draggingSelection: boolean,
  clipboard: Map<string, Object>,
};

const initialState = {
  resource: null,
  savedEditNumber: 0,
  transferAction: null,
  transferError: null,
  undoStack: [],
  redoStack: [],
  editorTab: 'entity',
  page: '',
  draggingPage: null,
  expanded: new Set(),
  selection: new Set(),
  draggingSelection: false,
  clipboard: new Map(),
};

function reducer(state: StoreState, action: StoreAction): StoreState {
  // make sure we have a valid state
  if (!state) {
    state = initialState;
  }
  // remember page/expansion/selection before action
  const oldPage = state.page;
  const oldExpanded = state.expanded;
  const oldSelection = state.selection;

  // first try the store actions
  const handler = StoreActions[action.type];
  if (handler) {
    state = handler.reduce(state, action);
  }
  // then the resource actions
  const undoStack = undoStackReducer(state.resource, state.undoStack, action);
  const resource = resourceReducer(state.resource, action);
  if (resource !== state.resource || undoStack !== state.undoStack) {
    let redoStack = state.redoStack;
    if (undoStack !== state.undoStack) {
      // it's a new action, so clear the redo stack and save selection
      redoStack = [];
      let action = undoStack[undoStack.length - 1];
      if (action.page === undefined) {
        action.page = oldPage;
        action.expanded = oldExpanded;
        action.selection = oldSelection;
      }
    }
    state = Object.assign({}, state, {resource, undoStack, redoStack});
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
        page: undoAction.page,
        selection: undoAction.selection,
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
      const undoAction = undoStack[undoStack.length - 1];
      undoAction.page = state.page;
      undoAction.expanded = state.expanded;
      undoAction.selection = state.selection;
      return (Object.assign({}, state, {
        resource: resourceReducer(state.resource, redoAction),
        undoStack,
        redoStack: state.redoStack.slice(0, redoIndex),
        page: reducePage(state, redoAction),
        expanded: reduceExpanded(state, redoAction),
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
      const resource = state.resource;
      if (!(resource instanceof Scene)) {
        return state;
      }
      const clipboard: Map<string, Object> = new Map();
      const map = {};
      for (const id of state.selection) {
        const node = resource.getEntityHierarchyNode(id);
        node &&
          node.applyToEntities(entity => {
            clipboard.set(entity.id, entity.state);
            map[entity.id] = null;
          });
      }
      return reducer(
        Object.assign({}, state, {clipboard}),
        SceneActions.editEntities.create(map),
      );
    },
  },
  copy: {
    create: () => ({type: 'copy'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const resource = state.resource;
      if (!(resource instanceof Scene)) {
        return state;
      }
      const clipboard: Map<string, Object> = new Map();
      for (const id of state.selection) {
        const node = resource.getEntityHierarchyNode(id);
        node &&
          node.applyToEntities(entity => {
            clipboard.set(entity.id, entity.state);
          });
      }
      return Object.assign({}, state, {clipboard});
    },
  },
  paste: {
    create: () => ({type: 'paste'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const resource = state.resource;
      if (!(resource instanceof Scene)) {
        return state;
      }
      const parentId =
        state.selection.size === 1
          ? (state.selection.values().next().value: any)
          : state.page;
      const parentNode = resource.getEntityHierarchyNode(parentId);
      if (!parentNode) {
        return state;
      }
      let map = {};
      const ids: Map<string, string> = new Map();
      for (const [id, json] of state.clipboard) {
        const newId = createUuid();
        ids.set(id, newId);
        map[newId] = json;
      }
      map = updateRefs(map, ids, parentId);
      let lastOrder = parentNode.highestChildOrder;
      for (const id in map) {
        const entity = map[id];
        if (entity.parent && entity.parent.ref === parentId) {
          entity.order = ++lastOrder;
        }
      }
      return reducer(state, SceneActions.editEntities.create(map));
    },
  },
  delete: {
    create: () => ({type: 'delete'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const map = {};
      for (const id of state.selection) {
        map[id] = null;
      }
      return reducer(state, SceneActions.editEntities.create(map));
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
      const lastAction = state.undoStack[state.undoStack.length - 1];
      return Object.assign({}, state, {
        savedEditNumber: lastAction ? lastAction.editNumber : 0,
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
      const selection: Set<string> = new Set();
      return Object.assign({}, state, {page, selection});
    },
  },
  setDraggingPage: {
    create: (page: ?string) => ({type: 'setDraggingPage', page}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {draggingPage: action.page});
    },
  },
  setDraggingSelection: {
    create: (value: boolean) => ({type: 'setDraggingSelection', value}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {draggingSelection: action.value});
    },
  },
  setExpanded: {
    create: (map: Object) => ({type: 'setExpanded', map}),
    reduce: (state: StoreState, action: StoreAction) => {
      const expanded: Set<string> = new Set(state.expanded);
      for (const id in action.map) {
        if (action.map[id]) {
          expanded.add(id);
        } else {
          expanded.delete(id);
        }
      }
      return Object.assign({}, state, {expanded});
    },
  },
  setResource: {
    create: ResourceActions.setResource.create,
    reduce: (state: ?Resource, action: ResourceAction) => {
      return Object.assign({}, state, {
        savedEditNumber: 0,
        undoStack: [],
        redoStack: [],
        expanded: (new Set(): Set<string>),
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
        expanded: (new Set(): Set<string>),
        selection: (new Set(): Set<string>),
      });
    },
  },
  editEntities: {
    create: SceneActions.editEntities.create,
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {
        page: reducePage(state, action),
        expanded: reduceExpanded(state, action),
        selection: reduceSelection(state, action),
      });
    },
  },
};

function updateRefs(
  map: Object,
  ids: Map<string, string>,
  defaultParentId: string,
): Object {
  const newMap = {};
  for (const key in map) {
    const value = map[key];
    if (typeof value === 'object' && value !== null) {
      const ref = value.ref;
      if (ref !== undefined) {
        const newId = ids.get(ref);
        if (newId !== undefined) {
          newMap[key] = {ref: newId};
        } else if (key === 'parent') {
          newMap[key] = {ref: defaultParentId};
        }
      } else {
        newMap[key] = updateRefs(value, ids, defaultParentId);
      }
    } else {
      newMap[key] = value;
    }
  }
  return newMap;
}

function reducePage(state: StoreState, action: ResourceAction): string {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.page;
  }
  let page = state.page;
  for (let id in action.map) {
    const state = action.map[id];
    let parent = getParent(state, resource.getEntity(id));
    if (!parent) {
      if (state !== null) {
        page = id; // switch to any added/edited page
      } else if (page === id) {
        for (const child of resource.entityHierarchy.children) {
          if (child.id === id) {
            break;
          } else if (child.id && action.map[child.id] !== null) {
            page = child.id; // switch away from deleted page
          }
        }
      }
      continue;
    }
    do {
      id = parent.ref;
      parent = getParent(action.map[id], resource.getEntity(id));
    } while (parent);
    page = id; // switch to page with added/removed/edited entity
  }
  return page;
}

function reduceExpanded(
  state: StoreState,
  action: ResourceAction,
): Set<string> {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.selection;
  }
  const expanded = new Set(state.expanded);
  for (const id in action.map) {
    const state = action.map[id];
    if (state === null) {
      expanded.delete(id);
    } else if (state.parent) {
      const newParentEntity = resource.getEntity(state.parent.ref);
      if (!newParentEntity || newParentEntity.getParent()) {
        expanded.add(state.parent.ref);
      }
    }
    const oldEntity = resource.getEntity(id);
    if (oldEntity) {
      const oldParent = oldEntity.getParent();
      if (oldParent) {
        const oldParentEntity = resource.getEntity(oldParent.ref);
        if (!oldParentEntity || oldParentEntity.getParent()) {
          expanded.add(oldParent.ref);
        }
      }
    }
  }
  return expanded;
}

function reduceSelection(
  state: StoreState,
  action: ResourceAction,
): Set<string> {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.selection;
  }
  const selection: Set<string> = new Set();
  for (const id in action.map) {
    const state = action.map[id];
    if (state !== null) {
      if (getParent(state, resource.getEntity(id))) {
        selection.add(id); // add added/edited entity to selection
      }
    }
  }
  return selection;
}

function getParent(state: ?Object, entity: ?Entity): ?EntityReference {
  if (state && state.parent !== undefined) {
    return state.parent;
  }
  return entity && entity.getParent();
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

/**
 * Checks whether the state is "dirty": whether there have been any edits since
 * we last saved.
 *
 * @param state the state to examine.
 * @return whether or not the state is dirty.
 */
export function isResourceDirty(state: StoreState): boolean {
  const lastAction = state.undoStack[state.undoStack.length - 1];
  return state.savedEditNumber !== (lastAction ? lastAction.editNumber : 0);
}
