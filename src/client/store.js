/**
 * Redux store for client.
 *
 * @module client/store
 * @flow
 */

import * as React from 'react';
import * as Redux from 'redux';
import uuid from 'uuid/v1';
import {getFromApi, putToApi} from './util/api';
import type {Renderer} from './renderer/util';
import {ComponentPhysics} from './physics/physics';
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
import type {Vector2} from '../server/store/math';
import {getTransformTranslation, boundsValid} from '../server/store/math';
import {setsEqual} from '../server/store/util';

type StoreAction = {type: string, [string]: any};

export type TransferError = {retryAction: ?ResourceAction};

export type EditorTab = 'entity' | 'page';

export type PageState = {
  x?: number,
  y?: number,
  size?: number,
};

export const DEFAULT_PAGE_SIZE = 30.0;

export type ToolType =
  | 'selectPan'
  | 'rectSelect'
  | 'contiguousSelect'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'erase'
  | 'point'
  | 'line'
  | 'lineGroup'
  | 'polygon'
  | 'rectangle'
  | 'arc'
  | 'curve'
  | 'stamp';

export type HoverState = any;

export type TooltipData = {
  entityId: string,
  label: React.Element<any>,
  position: Vector2,
  secondaryLabel: ?React.Element<any>,
  secondaryPosition: ?Vector2,
};

type PlayState = 'stopped' | 'playing' | 'paused';

type Snapshot = {frame: number, resource: Resource};

type StoreState = {
  resource: ?Resource,
  savedEditNumber: number,
  transferAction: ?StoreAction,
  transferError: ?TransferError,
  undoStack: ResourceAction[],
  redoStack: ResourceAction[],
  editorTab: EditorTab,
  editorEntities: Entity[],
  page: string,
  pageStates: Map<string, PageState>,
  draggingPage: ?string,
  tool: ToolType,
  tempTool: ?ToolType,
  expanded: Set<string>,
  selection: Set<string>,
  hoverStates: Map<string, HoverState>,
  tooltip: ?TooltipData,
  draggingSelection: boolean,
  draggingComponent: ?string,
  clipboard: Map<string, Object>,
  prePlayState: ?StoreState,
  playState: PlayState,
  snapshots: Snapshot[],
  frame: number,
  snapshotIndex: number,
  frameIntervalId: ?IntervalID,
  activeEntityIds: Set<string>,
};

const initialState = {
  resource: null,
  savedEditNumber: 0,
  transferAction: null,
  transferError: null,
  undoStack: [],
  redoStack: [],
  editorTab: 'entity',
  editorEntities: [],
  page: '',
  pageStates: new Map(),
  draggingPage: null,
  tool: 'selectPan',
  tempTool: null,
  expanded: new Set(),
  selection: new Set(),
  hoverStates: new Map(),
  tooltip: null,
  draggingSelection: false,
  draggingComponent: null,
  clipboard: new Map(),
  prePlayState: null,
  playState: 'stopped',
  snapshots: [],
  frame: 0,
  snapshotIndex: 0,
  frameIntervalId: null,
  activeEntityIds: new Set(),
};

function reducer(state: StoreState, action: StoreAction): StoreState {
  // make sure we have a valid state
  if (!state) {
    state = initialState;
  }
  // remember page/expansion/selection before action
  const oldState = state;
  const oldPage = state.page;
  const oldExpanded = state.expanded;
  const oldSelection = state.selection;

  // give edited entities a chance to modify the edit
  action = invokeEditCallbacks(state, action);

  // first try the store actions
  const handler = StoreActions[action.type];
  if (handler) {
    const newState = handler.reduce(state, action);
    if (state.resource !== newState.resource) {
      newState.resource && newState.resource.ref();
      state.resource && state.resource.deref();
    }
    if (state.prePlayState !== newState.prePlayState) {
      newState.prePlayState &&
        newState.prePlayState.resource &&
        newState.prePlayState.resource.ref();
      state.prePlayState &&
        state.prePlayState.resource &&
        state.prePlayState.resource.deref();
    }
    state = newState;
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
    if (resource !== state.resource) {
      resource && resource.ref();
      state.resource && state.resource.deref();
    }
    state = Object.assign({}, state, {resource, undoStack, redoStack});
  }
  // update derived state
  if (state !== oldState) {
    state.editorEntities = reduceEditorEntities(state);
  }
  return state;
}

function invokeEditCallbacks(
  state: StoreState,
  action: StoreAction,
): StoreAction {
  const resource = state.resource;
  if (!(action.type === 'editEntities' && resource instanceof Scene)) {
    return action;
  }
  let newMap = action.map;
  for (const id in action.map) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    const state = action.map[id];
    if (state === null) {
      for (const key in entity.state) {
        const callbacks = ComponentEditCallbacks[key];
        if (callbacks) {
          newMap = callbacks.onDelete(resource, entity, newMap);
        }
      }
    } else {
      for (const key in entity.state) {
        const callbacks = ComponentEditCallbacks[key];
        if (callbacks) {
          newMap = callbacks.onEdit(resource, entity, newMap);
        }
      }
    }
  }
  return newMap === action.map
    ? action
    : SceneActions.editEntities.create(newMap);
}

type EditCallbackData = {
  onDelete: (Scene, Entity, Object) => Object,
  onEdit: (Scene, Entity, Object) => Object,
};

/** Callbacks for component types. */
export const ComponentEditCallbacks: {[string]: EditCallbackData} = {};

const FRAME_RATE = 60;
const FRAME_DELAY = 1000 / FRAME_RATE;
const STEP_DURATION = 1.0 / FRAME_RATE;

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
        expanded: undoAction.expanded,
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
        activeEntityIds: reduceActiveEntityIds(state, action),
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
  setHoverStates: {
    create: (hoverStates: Map<string, mixed>) => ({
      type: 'setHoverStates',
      hoverStates,
    }),
    reduce: (state: StoreState, action: StoreAction) => {
      const hoverStates: Map<string, HoverState> = action.hoverStates;
      let tooltip = state.tooltip;
      if (state.tooltip && !hoverStates.has(state.tooltip.entityId)) {
        tooltip = null;
      }
      return Object.assign({}, state, {hoverStates, tooltip});
    },
  },
  setTooltip: {
    create: (tooltip: ?TooltipData) => ({type: 'setTooltip', tooltip}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {tooltip: action.tooltip});
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
          node.applyToEntityIds(id => {
            const entity = resource.getEntity(id);
            entity && clipboard.set(id, entity.state);
            map[id] = null;
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
          node.applyToEntityIds(id => {
            const entity = resource.getEntity(id);
            entity && clipboard.set(id, entity.state);
          });
      }
      return Object.assign({}, state, {clipboard});
    },
  },
  paste: {
    create: (asChildren: boolean = false) => ({type: 'paste', asChildren}),
    reduce: (state: StoreState, action: StoreAction) => {
      const pasteAction = createPasteAction(
        state.clipboard,
        state,
        action.asChildren,
      );
      return pasteAction ? reducer(state, pasteAction) : state;
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
        page = resource.entityHierarchy.children[0].id || '';
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
  setDraggingComponent: {
    create: (key: ?string) => ({type: 'setDraggingComponent', key}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {draggingComponent: action.key});
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
  setPagePosition: {
    create: (x: number, y: number) => ({type: 'setPagePosition', x, y}),
    reduce: (state: StoreState, action: StoreAction) => {
      const pageStates: Map<string, PageState> = new Map(state.pageStates);
      pageStates.set(
        state.page,
        Object.assign({}, pageStates.get(state.page), {
          x: action.x,
          y: action.y,
        }),
      );
      return Object.assign({}, state, {pageStates});
    },
  },
  setPageSize: {
    create: (size: number) => ({type: 'setPageSize', size}),
    reduce: (state: StoreState, action: StoreAction) => {
      const pageStates: Map<string, PageState> = new Map(state.pageStates);
      pageStates.set(
        state.page,
        Object.assign({}, pageStates.get(state.page), {size: action.size}),
      );
      return Object.assign({}, state, {pageStates});
    },
  },
  setTool: {
    create: (tool: ToolType) => ({type: 'setTool', tool}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {tool: action.tool});
    },
  },
  setTempTool: {
    create: (tool: ?ToolType) => ({type: 'setTempTool', tool}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {tempTool: action.tool});
    },
  },
  play: {
    create: () => ({type: 'play'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const resource = state.resource;
      if (!(resource instanceof Scene)) {
        return state;
      }
      const activeEntityIds: Set<string> = new Set();
      resource.idTree.applyToEntities(entity => {
        for (const key in entity.state) {
          const physics = ComponentPhysics[key];
          if (physics && physics.isActive(entity.state[key])) {
            activeEntityIds.add(entity.id);
          }
        }
      });
      return Object.assign({}, state, {
        selection: (new Set(): Set<string>),
        prePlayState: state,
        playState: 'playing',
        snapshots: [{frame: 0, resource}],
        frameIntervalId: setInterval(dispatchFrame, FRAME_DELAY),
        activeEntityIds,
      });
    },
  },
  pause: {
    create: () => ({type: 'pause'}),
    reduce: (state: StoreState, action: StoreAction) => {
      state.frameIntervalId && clearInterval(state.frameIntervalId);
      return Object.assign({}, state, {
        playState: 'paused',
        frameIntervalId: null,
      });
    },
  },
  resume: {
    create: () => ({type: 'resume'}),
    reduce: (state: StoreState, action: StoreAction) => {
      return Object.assign({}, state, {
        playState: 'playing',
        frameIntervalId: setInterval(dispatchFrame, FRAME_DELAY),
      });
    },
  },
  stop: {
    create: () => ({type: 'stop'}),
    reduce: (state: StoreState, action: StoreAction) => {
      state.frameIntervalId && clearInterval(state.frameIntervalId);
      return state.prePlayState;
    },
  },
  back: {
    create: () => ({type: 'back'}),
    reduce: (state: StoreState, action: StoreAction) => {
      let newSnapshotIndex = state.snapshotIndex;
      const REWIND_FRAMES = 60;
      if (
        newSnapshotIndex > 0 &&
        state.frame < state.snapshots[newSnapshotIndex].frame + REWIND_FRAMES
      ) {
        newSnapshotIndex--;
      }
      const snapshot = state.snapshots[newSnapshotIndex];
      return Object.assign({}, state, {
        resource: snapshot.resource,
        frame: snapshot.frame,
        snapshotIndex: newSnapshotIndex,
      });
    },
  },
  forward: {
    create: () => ({type: 'forward'}),
    reduce: (state: StoreState, action: StoreAction) => {
      const newSnapshotIndex = state.snapshotIndex + 1;
      const snapshot = state.snapshots[newSnapshotIndex];
      if (!snapshot) {
        return state;
      }
      return Object.assign({}, state, {
        resource: snapshot.resource,
        frame: snapshot.frame,
        snapshotIndex: newSnapshotIndex,
      });
    },
  },
  frame: {
    create: () => ({type: 'frame'}),
    reduce: (state: StoreState, action: StoreAction) => {
      let resource = state.resource;
      if (!(resource instanceof Scene) || state.playState !== 'playing') {
        return state;
      }
      let activeEntityIds: Set<string> = state.activeEntityIds;
      const map = {};
      entityLoop: for (const id of activeEntityIds) {
        const entity = resource.getEntity(id);
        if (entity) {
          for (const key in entity.state) {
            const physics = ComponentPhysics[key];
            if (
              physics &&
              physics.advance(resource, entity, STEP_DURATION, map)
            ) {
              continue entityLoop;
            }
          }
        }
        if (activeEntityIds === state.activeEntityIds) {
          activeEntityIds = new Set(activeEntityIds);
        }
        activeEntityIds.delete(id);
      }
      return Object.assign({}, state, {
        resource: resource.applyEdit(map),
        frame: state.frame + 1,
        activeEntityIds,
      });
    },
  },
  setResource: {
    create: ResourceActions.setResource.create,
    reduce: (state: StoreState, action: ResourceAction) => {
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
        pageStates: (new Map(): Map<string, PageState>),
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
        activeEntityIds: reduceActiveEntityIds(state, action),
      });
    },
  },
};

function dispatchFrame() {
  store.dispatch(StoreActions.frame.create());
}

/**
 * Creates an action to paste a set of entities.
 *
 * @param entities the map from entity id to entity state.
 * @param state the store state.
 * @param [asChildren=false] whether to paste the entities as children of the
 * (first) currently selected entity.
 * @return the paste action, if successful.
 */
export function createPasteAction(
  entities: Map<string, Object>,
  state: StoreState,
  asChildren: boolean = false,
): ?StoreAction {
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const parentId =
    state.selection.size > 0 && asChildren
      ? (state.selection.values().next().value: any)
      : state.page;
  const parentNode = resource.getEntityHierarchyNode(parentId);
  if (!parentNode) {
    return;
  }
  let map = {};
  const ids: Map<string, string> = new Map();
  for (const [id, json] of entities) {
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
  return SceneActions.editEntities.create(map);
}

function updateRefs(
  map: Object,
  ids: Map<string, string>,
  defaultParentId: string,
): Object {
  const newMap = {};
  for (const key in map) {
    if (key.charAt(0) === '_') {
      continue; // omit derived property
    }
    const value = map[key];
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
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

function reduceActiveEntityIds(
  state: StoreState,
  action: ResourceAction,
): Set<string> {
  const resource = state.resource;
  if (
    !(
      resource instanceof Scene &&
      action.type === 'editEntities' &&
      state.playState !== 'stopped'
    )
  ) {
    return state.activeEntityIds;
  }
  const activeEntityIds = new Set(state.activeEntityIds);
  for (const id in action.map) {
    const state = action.map[id];
    if (state === null) {
      activeEntityIds.delete(id);
    } else {
      // just add it for now; it'll be removed immediately if inactive
      activeEntityIds.add(id);
    }
  }
  return activeEntityIds;
}

function reduceSelection(
  state: StoreState,
  action: ResourceAction,
): Set<string> {
  const resource = state.resource;
  if (!(resource instanceof Scene && action.type === 'editEntities')) {
    return state.selection;
  }
  let selection = state.selection;
  let adding = false;
  for (const id in action.map) {
    const value = action.map[id];
    if (value === null) {
      if (selection === state.selection) {
        selection = new Set(state.selection);
      }
      selection.delete(id);
    } else {
      const entity = resource.getEntity(id);
      if (!entity && getParent(value, null)) {
        if (!adding) {
          selection = new Set();
          adding = true;
        }
        selection.add(id);
      }
    }
  }
  return selection;
}

function reduceEditorEntities(state: StoreState): Entity[] {
  const resource = state.resource;
  const pageTab = state.editorTab === 'page';
  const oldEntities = state.editorEntities;
  if (!(resource instanceof Scene && (pageTab || state.selection.size > 0))) {
    return oldEntities.length === 0 ? oldEntities : [];
  }
  if (pageTab) {
    const entity = resource.getEntity(state.page);
    if (!entity) {
      return oldEntities.length === 0 ? oldEntities : [];
    }
    return oldEntities.length === 1 && oldEntities[0] === entity
      ? oldEntities
      : [entity];
  }
  const newEntities: Entity[] = [];
  let index = 0;
  let matches = true;
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (entity) {
      newEntities.push(entity);
      if (oldEntities[index++] !== entity) {
        matches = false;
      }
    }
  }
  return matches && index === oldEntities.length ? oldEntities : newEntities;
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
document.addEventListener('keydown', (event: KeyboardEvent) => {
  event.repeat || advanceEditNumber();
});
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

export function centerPageOnSelection(renderer: Renderer) {
  const state = store.getState();
  const resource = state.resource;
  if (!(state.selection.size > 0 && resource instanceof Scene)) {
    return;
  }
  for (const id of state.selection) {
    const transform = resource.getWorldTransform(id);
    const translation = getTransformTranslation(transform);
    store.dispatch(
      StoreActions.setPagePosition.create(translation.x, translation.y),
    );
    const bounds = resource.getWorldBounds(id);
    if (boundsValid(bounds)) {
      const minHeight =
        2 *
        Math.max(bounds.max.y - translation.y, translation.y - bounds.min.y);
      const minWidth =
        2 *
        Math.max(bounds.max.x - translation.x, translation.x - bounds.min.x);
      const minSize = Math.max(minHeight, minWidth / renderer.camera.aspect);
      const pageState = state.pageStates.get(state.page) || {};
      const currentSize = pageState.size || DEFAULT_PAGE_SIZE;
      if (minSize > currentSize) {
        store.dispatch(StoreActions.setPageSize.create(minSize));
      }
    }
    return;
  }
}
