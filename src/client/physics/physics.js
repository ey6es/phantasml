/**
 * Physics component implementations.
 *
 * @module client/physics/physics
 * @flow
 */

import {ComponentColliders} from '../collision/colliders';
import type {Entity} from '../../server/store/resource';
import type {Scene} from '../../server/store/scene';
import {
  ZERO_VECTOR,
  getTransformTranslation,
  getTransformRotation,
  times,
  plusEquals,
  length,
  normalizeAngle,
} from '../../server/store/math';

type PhysicsData = {
  isActive: Object => boolean,
  advance: (Scene, Entity, number, Object) => boolean,
};

/**
 * Physics component functions mapped by component name.
 */
export const ComponentPhysics: {[string]: PhysicsData} = {
  rigidBody: {
    isActive: data => {
      const linearVelocity = data.linearVelocity || ZERO_VECTOR;
      return !!(length(linearVelocity) || data.angularVelocity || data.dynamic);
    },
    advance: (scene: Scene, entity: Entity, duration: number, map: Object) => {
      const data = entity.state.rigidBody;
      if (!data) {
        return false;
      }
      if (!data.dynamic) {
        const linearVelocity = data.linearVelocity || ZERO_VECTOR;
        const angularVelocity = data.angularVelocity || 0.0;
        if (length(linearVelocity) === 0.0 && angularVelocity === 0.0) {
          return false;
        }
        const transform = entity.state.transform;
        map[entity.id] = {
          transform: {
            translation: plusEquals(
              times(linearVelocity, duration),
              getTransformTranslation(transform),
            ),
            rotation: normalizeAngle(
              getTransformRotation(transform) + duration * angularVelocity,
            ),
          },
        };
        for (const key in entity.state) {
          const collider = ComponentColliders[key];
          if (collider) {
            collider.collide(scene, entity, map);
          }
        }
        return true;
      }
      return true;
    },
  },
};
