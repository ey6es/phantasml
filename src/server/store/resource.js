/**
 * Resource state model.
 *
 * @module server/store/resource
 * @flow
 */

/**
 * Applies actions to the resource, returning a new resource.
 *
 * @param state the existing resource state.
 * @param action the action to apply.
 * @return the mutated resource instance.
 */
export default function reducer(state: ?Resource, action: Object): ?Resource {
  if (action instanceof ResourceAction) {
    return action.mutate(state);
  }
  return state === undefined ? null : state;
}

/**
 * Base class for all resources.
 */
class Resource {}

/**
 * Base class for all resource actions.
 */
class ResourceAction {
  /**
   * Mutates the state according to this action.
   *
   * @param state the state to mutate.
   * @return the new state.
   */
  mutate(state: ?Resource): ?Resource {
    throw new Error('Not implemented.');
  }
}

/**
 * Clears the entire resource.
 */
export class ClearResource {
  mutate(state: ?Resource): ?Resource {
    return null;
  }
}
(ClearResource.prototype: Object).type = ClearResource.name;
