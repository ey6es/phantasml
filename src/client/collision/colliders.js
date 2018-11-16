/**
 * Collision component implementations.
 *
 * @module client/collision/colliders
 * @flow
 */

import type {Entity} from '../../server/store/resource';
import type {Scene} from '../../server/store/scene';
import {getCollisionGeometry} from '../../server/store/geometry';

type ColliderData = {
  collide: (Scene, Entity, Object) => void,
};

/**
 * Collider component functions mapped by component name.
 */
export const ComponentColliders: {[string]: ColliderData} = {
  shapeCollider: {
    collide: (scene: Scene, entity: Entity, map: Object) => {
      const collisionGeometry = getCollisionGeometry(entity);
      if (!collisionGeometry) {
        return;
      }
    },
  },
  pointCollider: {
    collide: (scene: Scene, entity: Entity, map: Object) => {},
  },
};
