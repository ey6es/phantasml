/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Entity} from './resource';
import {TransferableValue} from './resource';
import type {Vector2, Transform, Bounds} from './math';
import {
  vec2,
  equals,
  rotateEquals,
  plus,
  plusEquals,
  minus,
  minusEquals,
  times,
  timesEquals,
  distance,
  length,
  getTransformMaxScaleMagnitude,
  simplifyTransform,
  composeTransforms,
  invertTransform,
  getTransformMatrix,
  getTransformInverseMatrix,
  getTransformTranslation,
  getTransformRotation,
  transformPoint,
  transformPointEquals,
  addToBoundsEquals,
} from './math';
import {getValue} from './util';
import {Path, Shape, ShapeList} from './shape';
import type {CollisionGeometry} from './collision';

export type ControlPoint = {
  position: Vector2,
  thickness: number,
};

type GeometryData = {
  addToBounds: (Bounds, Object) => number,
  createShapeList: Object => ShapeList,
  getControlPoints: Object => ControlPoint[],
  createControlPointEdit: (Entity, number, Vector2) => Object,
};

export const DEFAULT_THICKNESS = 0.2;
export const DEFAULT_LINE_LENGTH = 5;
export const DEFAULT_VERTICES = [vec2(-2.5, -1.5), vec2(2.5, -1.5), vec2(0, 3)];
export const DEFAULT_LINE_GROUP_LOOP = false;
export const DEFAULT_FILL = false;
export const DEFAULT_RECTANGLE_WIDTH = 5;
export const DEFAULT_RECTANGLE_HEIGHT = 5;
export const DEFAULT_ARC_RADIUS = 2.5;
export const DEFAULT_ARC_ANGLE = 2 * Math.PI;
export const DEFAULT_CURVE_SPAN = 5;
export const DEFAULT_CURVE_C1 = vec2(-0.833, 2);
export const DEFAULT_CURVE_C2 = vec2(0.833, -2);

/**
 * Gets the collision geometry for the specified entity through the cache.
 *
 * @param entity the entity whose collision geometry is desired.
 * @return the collision geometry, if any.
 */
export function getCollisionGeometry(entity: Entity): ?CollisionGeometry {
  return (entity.getCachedValue(
    'collisionGeometry',
    createCollisionGeometry,
    entity,
  ): any);
}

function createCollisionGeometry(
  entity: Entity,
): ?TransferableValue<CollisionGeometry> {
  const shapeList = getShapeList(entity);
  if (!shapeList) {
    return null;
  }
  const transform: Transform = entity.getLastCachedValue('worldTransform');
  const magnitude = getTransformMaxScaleMagnitude(transform);
  const tessellation = magnitude * 4.0;
  return new TransferableValue(
    shapeList.createCollisionGeometry(tessellation),
    newEntity => {
      // if we don't have the same shape list, we can't transfer
      if (newEntity.getLastCachedValue('shapeList') !== shapeList) {
        return false;
      }
      // if we don't need tessellation, we can use it
      if (!shapeList.requiresTessellation()) {
        return true;
      }
      // otherwise, it depends on the transform
      const newTransform = newEntity.getLastCachedValue('worldTransform');
      if (newTransform === undefined) {
        return;
      }
      return getTransformMaxScaleMagnitude(newTransform) === magnitude;
    },
  );
}

/**
 * Gets the shape list for the specified entity through the cache.
 *
 * @param entity the entity whose shape list is desired.
 * @return the shape list, if any.
 */
export function getShapeList(entity: Entity): ?ShapeList {
  return (entity.getCachedValue('shapeList', createShapeList, entity): any);
}

function createShapeList(entity: Entity): ?TransferableValue<ShapeList> {
  let currentShapeList: ?ShapeList;
  const components: GeometryData[] = [];
  for (const key in entity.state) {
    const data = ComponentGeometry[key];
    if (data) {
      const component = entity.state[key];
      components.push(component);
      if (currentShapeList) {
        currentShapeList.add(data.createShapeList(component));
      } else {
        currentShapeList = data.createShapeList(component);
      }
    }
  }
  if (!currentShapeList) {
    return null;
  }
  return new TransferableValue(currentShapeList, newEntity => {
    // we can transfer if we have the same geometry components
    // (by reference) in the same order
    let index = 0;
    for (const key in newEntity.state) {
      if (
        ComponentGeometry[key] &&
        newEntity.state[key] !== components[index++]
      ) {
        return false;
      }
    }
    return index === components.length;
  });
}

/**
 * Geometry component functions mapped by component name.
 */
export const ComponentGeometry: {[string]: GeometryData} = {
  point: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      addToBoundsEquals(bounds, 0.0, 0.0);
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      return new ShapeList().penDown(false, {thickness});
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      return [{position: vec2(), thickness}];
    },
    createControlPointEdit: (entity, index, position) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {
              translation: equals(position),
            }),
          ),
        ),
      };
    },
  },
  line: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      addToBoundsEquals(bounds, -halfLength, 0.0);
      addToBoundsEquals(bounds, halfLength, 0.0);
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const length = getValue(data.length, DEFAULT_LINE_LENGTH);
      return new ShapeList()
        .move(length * -0.5, 0)
        .penDown(false, {thickness})
        .advance(length);
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      return [
        {position: vec2(-halfLength, 0.0), thickness},
        {position: vec2(halfLength, 0.0), thickness},
      ];
    },
    createControlPointEdit: (entity, index, position) => {
      const data = entity.state.line;
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const worldMatrix = getTransformMatrix(worldTransform);
      const start = transformPoint(vec2(-halfLength, 0.0), worldMatrix);
      const end = transformPoint(vec2(halfLength, 0.0), worldMatrix);
      equals(position, [start, end][index]);
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {
              translation: timesEquals(plus(start, end), 0.5),
              rotation: Math.atan2(end.y - start.y, end.x - start.x),
            }),
          ),
        ),
        line: {length: distance(start, end)},
      };
    },
  },
  lineGroup: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      for (const vertex of vertices) {
        addToBoundsEquals(bounds, vertex.x, vertex.y);
      }
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      const loop = getValue(data.loop, DEFAULT_LINE_GROUP_LOOP);
      if (vertices.length === 0) {
        return new ShapeList();
      }
      const path = new Path(loop && vertices.length > 2);
      const attributes = {thickness};
      path.moveTo(vertices[0], 0, attributes);
      for (let ii = 1; ii < vertices.length; ii++) {
        path.lineTo(vertices[ii], 0, attributes);
      }
      loop && path.lineTo(vertices[0], 0, attributes);
      return new ShapeList([], [path]);
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      return vertices.map(vertex => ({position: equals(vertex), thickness}));
    },
    createControlPointEdit: (entity, index, position) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const data = entity.state.lineGroup;
      const oldVertices = getValue(data.vertices, DEFAULT_VERTICES);
      const worldMatrix = getTransformMatrix(worldTransform);
      const vertices = oldVertices.map(vertex =>
        transformPoint(vertex, worldMatrix),
      );
      equals(position, vertices[index]);
      const translation = equals(vertices[0]);
      vertices.forEach(vertex => minusEquals(vertex, translation));
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {translation}),
          ),
        ),
        lineGroup: {vertices},
      };
    },
  },
  polygon: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      for (const vertex of vertices) {
        addToBoundsEquals(bounds, vertex.x, vertex.y);
      }
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      const fill = getValue(data.fill, DEFAULT_FILL);
      if (vertices.length === 0) {
        return new ShapeList();
      }
      const path = new Path(vertices.length > 2);
      const attributes = {thickness};
      path.moveTo(vertices[0], 0, attributes);
      for (let ii = 1; ii < vertices.length; ii++) {
        path.lineTo(vertices[ii], 0, attributes);
      }
      path.lineTo(vertices[0], 0, attributes);
      return fill && vertices.length > 2
        ? new ShapeList([new Shape(path)])
        : new ShapeList([], [path]);
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_VERTICES);
      return vertices.map(vertex => ({position: equals(vertex), thickness}));
    },
    createControlPointEdit: (entity, index, position) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const data = entity.state.polygon;
      const oldVertices = getValue(data.vertices, DEFAULT_VERTICES);
      const worldMatrix = getTransformMatrix(worldTransform);
      const vertices = oldVertices.map(vertex =>
        transformPoint(vertex, worldMatrix),
      );
      equals(position, vertices[index]);
      const translation = equals(vertices[0]);
      vertices.forEach(vertex => minusEquals(vertex, translation));
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {translation}),
          ),
        ),
        polygon: {vertices},
      };
    },
  },
  rectangle: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfWidth = getValue(data.width, DEFAULT_RECTANGLE_WIDTH) * 0.5;
      const halfHeight = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT) * 0.5;
      addToBoundsEquals(bounds, -halfWidth, -halfHeight);
      addToBoundsEquals(bounds, halfWidth, halfHeight);
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const width = getValue(data.width, DEFAULT_RECTANGLE_WIDTH);
      const height = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT);
      const fill = getValue(data.fill, DEFAULT_FILL);
      return new ShapeList()
        .move(width * -0.5, height * -0.5)
        .penDown(fill, {thickness})
        .advance(width)
        .pivot(90)
        .advance(height)
        .pivot(90)
        .advance(width)
        .pivot(90)
        .advance(height);
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfWidth = getValue(data.width, DEFAULT_RECTANGLE_WIDTH) * 0.5;
      const halfHeight = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT) * 0.5;
      return [
        {position: vec2(-halfWidth, -halfHeight), thickness},
        {position: vec2(halfWidth, -halfHeight), thickness},
        {position: vec2(halfWidth, halfHeight), thickness},
        {position: vec2(-halfWidth, halfHeight), thickness},
        {position: vec2(0.0, -halfHeight), thickness},
        {position: vec2(halfWidth, 0.0), thickness},
        {position: vec2(0.0, halfHeight), thickness},
        {position: vec2(-halfWidth, 0.0), thickness},
      ];
    },
    createControlPointEdit: (entity, index, position) => {
      const data = entity.state.rectangle;
      let width = getValue(data.width, DEFAULT_RECTANGLE_WIDTH);
      const halfWidth = width * 0.5;
      let height = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT);
      const halfHeight = height * 0.5;
      const vertices = [
        vec2(-halfWidth, -halfHeight),
        vec2(halfWidth, -halfHeight),
        vec2(halfWidth, halfHeight),
        vec2(-halfWidth, halfHeight),
        vec2(0.0, -halfHeight),
        vec2(halfWidth, 0.0),
        vec2(0.0, halfHeight),
        vec2(-halfWidth, 0.0),
      ];
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const rotation = getTransformRotation(worldTransform);
      const worldMatrix = getTransformMatrix(worldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, worldMatrix));
      const center = vec2();
      const oldWidth = width;
      const oldHeight = height;
      if (index < 4) {
        // corner
        const previous = vertices[(index + 3) % 4];
        const next = vertices[(index + 1) % 4];
        if ((index & 1) === 0) {
          // 0/2
          width = distance(position, next);
          height = distance(position, previous);
        } else {
          // 1/3
          width = distance(position, previous);
          height = distance(position, next);
        }
        const opposite = vertices[(index + 2) % 4];
        const vector = rotateEquals(
          timesEquals(minus(vertices[index], opposite), 0.5),
          -rotation,
        );
        vector.x *= width / oldWidth;
        vector.y *= height / oldHeight;
        plus(opposite, rotateEquals(vector, rotation), center);
      } else {
        // side
        const opposite = vertices[4 + ((index - 2) % 4)];
        const vector = rotateEquals(
          timesEquals(minus(vertices[index], opposite), 0.5),
          -rotation,
        );
        if ((index & 1) === 0) {
          // top/bottom
          height = distance(position, opposite);
          vector.y *= height / oldHeight;
        } else {
          // left/right
          width = distance(position, opposite);
          vector.x *= width / oldWidth;
        }
        plus(opposite, rotateEquals(vector, rotation), center);
      }
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {
              translation: center,
              rotation,
            }),
          ),
        ),
        rectangle: {width, height},
      };
    },
  },
  arc: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      addToBoundsEquals(bounds, -radius, -radius);
      addToBoundsEquals(bounds, radius, radius);
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      const angle = getValue(data.angle, DEFAULT_ARC_ANGLE);
      const fill = getValue(data.fill, DEFAULT_FILL);
      let startAngle = 0.0;
      let endAngle = angle;
      if (angle < 0) {
        startAngle = 2 * Math.PI + angle;
        endAngle = -angle;
      }
      const shapeList = new ShapeList()
        .move(radius, 0, 90, {thickness})
        .arc(startAngle, radius)
        .pushState()
        .penDown(fill)
        .arc(endAngle, radius);
      if (fill && endAngle < 2 * Math.PI) {
        shapeList.move(0, 0).popState();
      }
      return shapeList;
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      const angle = getValue(data.angle, DEFAULT_ARC_ANGLE);
      return [
        {position: vec2(radius, 0.0), thickness},
        {position: rotateEquals(vec2(radius, 0.0), angle), thickness},
        {position: rotateEquals(vec2(radius, 0.0), angle * 0.5), thickness},
      ];
    },
    createControlPointEdit: (entity, index, position) => {
      const data = entity.state.arc;
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      const angle = getValue(data.angle, DEFAULT_ARC_ANGLE);
      const oldWorldTransform = entity.getLastCachedValue('worldTransform');
      const center = getTransformTranslation(oldWorldTransform);
      if (index === 2) {
        return {arc: {radius: distance(center, position)}};
      }
      const start = vec2(radius, 0.0);
      const end = rotateEquals(vec2(radius, 0.0), angle);
      const vertices = [start, end];
      const oldWorldMatrix = getTransformMatrix(oldWorldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, oldWorldMatrix));
      equals(position, vertices[index]);
      const rotation = Math.atan2(start.y - center.y, start.x - center.x);
      const rotatedEnd = rotateEquals(minus(end, center), -rotation);
      let newAngle = Math.atan2(rotatedEnd.y, rotatedEnd.x);
      if (angle > 0 && newAngle < 0) {
        newAngle += Math.PI * 2;
      } else if (angle < 0 && newAngle > 0) {
        newAngle -= Math.PI * 2;
      }
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(oldWorldTransform), {
              translation: center,
              rotation,
            }),
          ),
        ),
        arc: {angle: newAngle},
      };
    },
  },
  curve: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      addToBoundsEquals(bounds, -halfSpan, 0.0);
      addToBoundsEquals(bounds, halfSpan, 0.0);
      addToBoundsEquals(bounds, c1.x, c1.y);
      addToBoundsEquals(bounds, c2.x, c2.y);
      return thickness;
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      const attributes = {thickness};
      const path = new Path()
        .moveTo(vec2(-halfSpan, 0), 0, attributes)
        .curveTo(vec2(halfSpan, 0), c1, c2, 0, attributes);
      return new ShapeList([], [path]);
    },
    getControlPoints: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      return [
        {position: vec2(-halfSpan, 0.0), thickness},
        {position: equals(c1), thickness},
        {position: equals(c2), thickness},
        {position: vec2(halfSpan, 0.0), thickness},
      ];
    },
    createControlPointEdit: (entity, index, position) => {
      const data = entity.state.curve;
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      const oldWorldTransform = entity.getLastCachedValue('worldTransform');
      const start = vec2(-halfSpan, 0.0);
      const end = vec2(halfSpan, 0.0);
      const vertices = [start, equals(c1), equals(c2), end];
      const oldWorldMatrix = getTransformMatrix(oldWorldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, oldWorldMatrix));
      equals(position, vertices[index]);
      const newWorldTransform = {
        translation: timesEquals(plus(start, end), 0.5),
        rotation: Math.atan2(end.y - start.y, end.x - start.x),
      };
      const inverseWorldMatrix = getTransformInverseMatrix(newWorldTransform);
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(
              invertTransform(oldWorldTransform),
              newWorldTransform,
            ),
          ),
        ),
        curve: {
          span: distance(start, end),
          c1: transformPointEquals(vertices[1], inverseWorldMatrix),
          c2: transformPointEquals(vertices[2], inverseWorldMatrix),
        },
      };
    },
  },
  shape: {
    addToBounds: (bounds, data) => {
      return 0.0;
    },
    createShapeList: data => {
      return new ShapeList();
    },
    getControlPoints: data => {
      return [];
    },
    createControlPointEdit: (entity, index, position) => {
      return {};
    },
  },
  shapeList: {
    addToBounds: (bounds, data) => {
      return 0.0;
    },
    createShapeList: data => {
      return new ShapeList();
    },
    getControlPoints: data => {
      return [];
    },
    createControlPointEdit: (entity, index, position) => {
      return {};
    },
  },
};
