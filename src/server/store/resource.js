/**
 * Resource state model.
 *
 * @module server/store/resource
 * @flow
 */

export type ResourceAction = {type: string};

/**
 * Applies actions to the resource, returning a new resource.
 *
 * @param state the existing resource state.
 * @param action the action to apply.
 * @return the new resource instance.
 */
export function reducer(state: ?Resource, action: ResourceAction): ?Resource {
  // first check the list of actions that apply to all resources
  const handler = ResourceActions[action.type];
  if (handler) {
    return handler.reduce(state, action);
  }
  // then try state-specific actions
  if (state) {
    return state.reduce(action);
  }
  // finally, return null rather than undefined to initialize
  return null;
}

/**
 * Base class for all resources.
 */
export class Resource {
  /**
   * Applies the specified action to this resource, returning a new resource.
   *
   * @param action the action to apply.
   * @return the new resource instance.
   */
  reduce(action: ResourceAction): ?Resource {
    return this;
  }
}

/**
 * The map containing all the resource actions.
 */
export const ResourceActions = {
  clearResource: {
    create: () => ({type: 'clearResource'}),
    reduce: (state: ?Resource, action: ResourceAction) => null,
  },
};

type ResourceActionHandler = {
  create: (...args: any[]) => ResourceAction,
  reduce: (state: ?Resource, action: ResourceAction) => ?Resource,
};

/**
 * Adds a handler for resource actions.
 *
 * @param type the type of action to be handled.
 * @param handler the handler object.
 */
export function addResourceActionHandler(
  handlers: {[string]: ResourceActionHandler},
  type: string,
) {
  (ResourceActions: Object)[type] = handlers[type];
}
