/**
 * Collision component implementations.
 *
 * @module client/collision/colliders
 * @flow
 */

import {FlagsProperty, MaskProperty} from './components';
import type {Entity} from '../../server/store/resource';
import type {Scene, IdTreeNode} from '../../server/store/scene';
import {ComponentBounds} from '../../server/store/bounds';
import {
  DEFAULT_THICKNESS,
  getCollisionGeometry,
  getShapeList,
} from '../../server/store/geometry';
import type {CollisionGeometry} from '../../server/store/collision';
import {getPointPointPenetration} from '../../server/store/collision';
import type {Transform, Vector2, Bounds} from '../../server/store/math';
import {
  ZERO_VECTOR,
  getTransformTranslation,
  composeTransforms,
  invertTransform,
  getTransformMatrix,
  getTransformInverseMatrix,
  vec2,
  plusEquals,
  minusEquals,
  negativeEquals,
  transformPoint,
  transformVectorEquals,
  length,
  emptyBounds,
  addToBoundsEquals,
  transformBoundsEquals,
  expandBoundsEquals,
} from '../../server/store/math';
import {getValue} from '../../server/store/util';

type ColliderData = {
  collide: (Scene, Entity, Object) => void,
  getShapePenetration: (Entity, CollisionGeometry, Transform, Vector2) => void,
  getPointPenetration: (Entity, Vector2, number, Vector2) => void,
};

const bounds = {min: vec2(), max: vec2()};

const penetration = vec2();
const vertex = vec2();
const separation = vec2();

/**
 * Collider component functions mapped by component name.
 */
export const ComponentColliders: {[string]: ColliderData} = {
  shapeCollider: {
    collide: (scene: Scene, entity: Entity, map: Object) => {
      const data = entity.state.shapeCollider;
      const mask = getValue(data.mask, MaskProperty.mask.defaultValue);
      const shapeList = getShapeList(entity);
      const collisionGeometry = getCollisionGeometry(entity);
      if (!(shapeList && collisionGeometry && mask !== 0)) {
        return;
      }
      const lineage = scene.getEntityLineage(entity);
      const parentTransform = lineage[lineage.length - 2].getLastCachedValue(
        'worldTransform',
      );
      const newTransform = map[entity.id].transform;
      const worldTransform = composeTransforms(parentTransform, newTransform);
      emptyBounds(bounds);
      const thickness = shapeList.addToBounds(bounds);
      transformBoundsEquals(bounds, worldTransform);
      expandBoundsEquals(bounds, thickness);
      vec2(0.0, 0.0, separation);
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
          const flags = getValue(
            otherData.flags,
            FlagsProperty.flags.defaultValue,
          );
          if (!(flags & mask)) {
            continue;
          }
          const entityTransform = otherEntity.getLastCachedValue(
            'worldTransform',
          );
          const localTransform = composeTransforms(
            invertTransform(worldTransform),
            entityTransform,
          );
          collider.getShapePenetration(
            otherEntity,
            collisionGeometry,
            localTransform,
            penetration,
          );
          if (length(penetration) > 0.0) {
            transformVectorEquals(
              transformVectorEquals(
                penetration,
                getTransformMatrix(worldTransform),
              ),
              getTransformInverseMatrix(parentTransform),
            );
            minusEquals(separation, penetration);
          }
        }
      });
      plusEquals(newTransform.translation, separation);
    },
    getShapePenetration: (
      entity: Entity,
      geometry: CollisionGeometry,
      transform: Transform,
      result: Vector2,
    ) => {
      const collisionGeometry = getCollisionGeometry(entity);
      if (collisionGeometry) {
        collisionGeometry.getPenetration(geometry, transform, 0.0, result);
      } else {
        vec2(0.0, 0.0, result);
      }
    },
    getPointPenetration: (
      entity: Entity,
      vertex: Vector2,
      vertexThickness: number,
      result: Vector2,
    ) => {
      const collisionGeometry = getCollisionGeometry(entity);
      if (collisionGeometry) {
        collisionGeometry.getPointPenetration(vertex, vertexThickness, result);
      } else {
        vec2(0.0, 0.0, result);
      }
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
      const newTransform = map[entity.id].transform;
      const worldTransform = composeTransforms(parentTransform, newTransform);
      const center = getTransformTranslation(worldTransform);
      bounds.min.x = center.x - thickness;
      bounds.min.y = center.y - thickness;
      bounds.max.x = center.x + thickness;
      bounds.max.y = center.y + thickness;
      vec2(0.0, 0.0, separation);
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
          const flags = getValue(
            otherData.flags,
            FlagsProperty.flags.defaultValue,
          );
          if (!(flags & mask)) {
            continue;
          }
          const entityTransform = otherEntity.getLastCachedValue(
            'worldTransform',
          );
          const localTransform = composeTransforms(
            invertTransform(entityTransform),
            worldTransform,
          );
          collider.getPointPenetration(
            otherEntity,
            getTransformTranslation(localTransform),
            thickness,
            penetration,
          );
          if (length(penetration) > 0.0) {
            transformVectorEquals(
              transformVectorEquals(
                penetration,
                getTransformMatrix(entityTransform),
              ),
              getTransformInverseMatrix(parentTransform),
            );
            minusEquals(separation, penetration);
          }
        }
      });
      plusEquals(newTransform.translation, separation);
    },
    getShapePenetration: (
      entity: Entity,
      geometry: CollisionGeometry,
      transform: Transform,
      result: Vector2,
    ) => {
      const data = entity.state.pointCollider;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      transformPoint(ZERO_VECTOR, getTransformInverseMatrix(transform), vertex);
      geometry.getPointPenetration(vertex, thickness, result);
      if (length(result) > 0.0) {
        transformVectorEquals(result, getTransformMatrix(transform));
      }
    },
    getPointPenetration: (
      entity: Entity,
      vertex: Vector2,
      vertexThickness: number,
      result: Vector2,
    ) => {
      const data = entity.state.pointCollider;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      getPointPointPenetration(
        ZERO_VECTOR,
        thickness,
        vertex,
        vertexThickness,
        result,
      );
    },
  },
};

ComponentBounds.pointCollider = {
  addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
    const data = entity.state.pointCollider;
    const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
    addToBoundsEquals(bounds, 0.0, 0.0);
    return thickness;
  },
};
