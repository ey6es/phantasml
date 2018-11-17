/**
 * Collision component implementations.
 *
 * @module client/collision/colliders
 * @flow
 */

import {FlagsProperty, MaskProperty} from './components';
import type {Entity} from '../../server/store/resource';
import type {Scene} from '../../server/store/scene';
import {
  DEFAULT_THICKNESS,
  getCollisionGeometry,
} from '../../server/store/geometry';
import {
  getTransformTranslation,
  composeTransforms,
  vec2,
} from '../../server/store/math';
import {getValue} from '../../server/store/util';

type ColliderData = {
  collide: (Scene, Entity, Object) => void,
};

const bounds = {min: vec2(), max: vec2()};

/**
 * Collider component functions mapped by component name.
 */
export const ComponentColliders: {[string]: ColliderData} = {
  shapeCollider: {
    collide: (scene: Scene, entity: Entity, map: Object) => {
      const data = entity.state.shapeCollider;
      const mask = getValue(data.mask, MaskProperty.mask.defaultValue);
      const collisionGeometry = getCollisionGeometry(entity);
      if (!collisionGeometry || mask === 0) {
        return;
      }
      const lineage = scene.getEntityLineage(entity);
      const parentTransform = lineage[lineage.length - 2].getLastCachedValue(
        'worldTransform',
      );
      const worldTransform = composeTransforms(
        parentTransform,
        map[entity.id].transform,
      );
      scene.applyToEntities(lineage[0].id, bounds, entity => {});
    },
  },
  pointCollider: {
    collide: (scene: Scene, entity: Entity, map: Object) => {
      const data = entity.state.pointCollider;
      const mask = getValue(data.mask, MaskProperty.mask.defaultValue);
      if (mask === 0) {
        return;
      }
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const lineage = scene.getEntityLineage(entity);
      const parentTransform = lineage[lineage.length - 2].getLastCachedValue(
        'worldTransform',
      );
      const worldTransform = composeTransforms(
        parentTransform,
        map[entity.id].transform,
      );
      const center = getTransformTranslation(worldTransform);
      bounds.min.x = center.x - thickness;
      bounds.min.y = center.y - thickness;
      bounds.max.x = center.x + thickness;
      bounds.max.y = center.y + thickness;
      scene.applyToEntities(lineage[0].id, bounds, otherEntity => {
        if (otherEntity === entity) {
          return;
        }
        for (const key in otherEntity.state) {
          const collider = ComponentColliders[key];
          if (!collider) {
            continue;
          }
          const otherData = otherEntity.state[key];
          const flags = getValue(otherData, FlagsProperty.flags.defaultValue);
          if (!(flags & mask)) {
            continue;
          }
        }
      });
    },
  },
};
