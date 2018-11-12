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
  dot,
  orthonormalizeEquals,
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
  getMean,
  getCentroid,
  clamp,
  roundToPrecision,
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
  createControlPointEdit: (Entity, [number, Vector2][], boolean) => Object,
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const translation = equals(getTransformTranslation(worldTransform));
      for (const [index, position] of indexPositions) {
        index === 0 && equals(position, translation);
      }
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {translation}),
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const data = entity.state.line;
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const worldMatrix = getTransformMatrix(worldTransform);
      const start = transformPoint(vec2(-halfLength, 0.0), worldMatrix);
      const end = transformPoint(vec2(halfLength, 0.0), worldMatrix);
      const vertices = [start, end];
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const data = entity.state.lineGroup;
      const oldVertices = getValue(data.vertices, DEFAULT_VERTICES);
      const worldMatrix = getTransformMatrix(worldTransform);
      const vertices = oldVertices.map(vertex =>
        transformPoint(vertex, worldMatrix),
      );
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
      const translation = getMean(vertices);
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const data = entity.state.polygon;
      const oldVertices = getValue(data.vertices, DEFAULT_VERTICES);
      const worldMatrix = getTransformMatrix(worldTransform);
      const vertices = oldVertices.map(vertex =>
        transformPoint(vertex, worldMatrix),
      );
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
      if (mirrored) {
        const middle = Math.floor((vertices.length - 1) / 2);
        for (let ii = 0; ii < middle; ii++) {
          const index = ii + 1;
          const opposite = vertices.length - index;
          const tmp = vertices[index];
          vertices[index] = vertices[opposite];
          vertices[opposite] = tmp;
        }
      }
      const translation = getCentroid(vertices);
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const data = entity.state.rectangle;
      const width = getValue(data.width, DEFAULT_RECTANGLE_WIDTH);
      const halfWidth = width * 0.5;
      const height = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT);
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
      const worldMatrix = getTransformMatrix(worldTransform);
      const worldRotation = getTransformRotation(worldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, worldMatrix));
      if (indexPositions.length === 8) {
        for (const [index, position] of indexPositions) {
          equals(position, vertices[index]);
        }
        if (mirrored) {
          const tmp = vertices[1];
          vertices[1] = vertices[3];
          vertices[3] = tmp;
        }
      } else {
        const axisX = rotateEquals(vec2(1.0, 0.0), worldRotation);
        const axisY = rotateEquals(vec2(0.0, 1.0), worldRotation);
        for (const [index, position] of indexPositions) {
          const offset = minus(position, vertices[index]);
          const offsetX = times(axisX, dot(offset, axisX));
          const offsetY = times(axisY, dot(offset, axisY));
          equals(position, vertices[index]);
          switch (index) {
            case 0:
              plusEquals(vertices[1], offsetY);
              break;
            case 1:
              plusEquals(vertices[0], offsetY);
              plusEquals(vertices[2], offsetX);
              break;
            case 2:
              plusEquals(vertices[1], offsetX);
              break;
            case 3:
              plusEquals(vertices[0], offsetX);
              plusEquals(vertices[2], offsetY);
              break;
            case 4:
              plusEquals(vertices[0], offsetY);
              plusEquals(vertices[1], offsetY);
              break;
            case 5:
              plusEquals(vertices[1], offsetX);
              plusEquals(vertices[2], offsetX);
              break;
            case 6:
              plusEquals(vertices[2], offsetY);
              break;
            case 7:
              plusEquals(vertices[0], offsetX);
              break;
          }
        }
      }
      const newCenter = timesEquals(plus(vertices[0], vertices[2]), 0.5);
      const direction = minus(vertices[1], vertices[0]);
      const newRotation = Math.atan2(direction.y, direction.x);
      const newWidth = distance(vertices[0], vertices[1]);
      const newHeight = distance(vertices[1], vertices[2]);
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {
              translation: newCenter,
              rotation: newRotation,
            }),
          ),
        ),
        rectangle: {width: newWidth, height: newHeight},
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
        {position: vec2(), thickness},
        {position: vec2(radius, 0.0), thickness},
        {position: rotateEquals(vec2(radius, 0.0), angle * 0.5), thickness},
        {position: rotateEquals(vec2(radius, 0.0), angle), thickness},
      ];
    },
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const data = entity.state.arc;
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      const angle = getValue(data.angle, DEFAULT_ARC_ANGLE);
      const center = vec2();
      const start = vec2(radius, 0.0);
      const middle = rotateEquals(vec2(radius, 0.0), angle * 0.5);
      const end = rotateEquals(vec2(radius, 0.0), angle);
      const vertices = [center, start, middle, end];
      const oldWorldTransform = entity.getLastCachedValue('worldTransform');
      const oldWorldMatrix = getTransformMatrix(oldWorldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, oldWorldMatrix));
      for (const [index, position] of indexPositions) {
        if (index === 0) {
          const offset = minus(position, center);
          vertices.forEach(vertex => plusEquals(vertex, offset));
        } else {
          equals(position, vertices[index]);
        }
      }
      if (mirrored) {
        const tmp = equals(start);
        equals(end, start);
        equals(tmp, end);
      }
      const newRadius = distance(center, middle);
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
        arc: {radius: newRadius, angle: newAngle},
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
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
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
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
      const exterior = data.exterior || '';
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const lastPosition = vec2();
      const vector = vec2();
      const addCommand = (position: Vector2) => {
        addToBoundsEquals(bounds, position.x, position.y);
        equals(position, lastPosition);
      };
      parsePath(exterior, {
        moveTo: addCommand,
        lineTo: addCommand,
        arcTo: (position, radius) => {
          minus(position, lastPosition, vector);
          const height = length(vector) / 2.0;
          const angle = 2.0 * Math.asin(clamp(height / radius, -1.0, 1.0));
          const distanceToCenter = radius * Math.cos(angle * 0.5);
          plusEquals(
            timesEquals(plusEquals(lastPosition, position), 0.5),
            timesEquals(orthonormalizeEquals(vector), distanceToCenter),
          );
          addToBoundsEquals(
            bounds,
            lastPosition.x - radius,
            lastPosition.y - radius,
          );
          addToBoundsEquals(
            bounds,
            lastPosition.x + radius,
            lastPosition.y + radius,
          );
          addCommand(position);
        },
        curveTo: (position, c1, c2) => {
          addToBoundsEquals(bounds, c1.x, c1.y);
          addToBoundsEquals(bounds, c2.x, c2.y);
          addCommand(position);
        },
      });
      return thickness;
    },
    createShapeList: data => {
      const exterior = data.exterior || '';
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const fill = getValue(data.fill, DEFAULT_FILL);
      const path = new Path(true);
      parsePath(exterior, {
        moveTo: position => {
          path.moveTo(equals(position), 0, {thickness});
        },
        lineTo: position => {
          path.lineTo(equals(position), 0, {thickness});
        },
        arcTo: (position, radius) => {
          path.arcTo(equals(position), radius, 0, {thickness});
        },
        curveTo: (position, c1, c2) => {
          path.curveTo(equals(position), equals(c1), equals(c2), 0, {
            thickness,
          });
        },
      });
      if (fill) {
        return new ShapeList([new Shape(path)]);
      } else {
        return new ShapeList([], [path]);
      }
    },
    getControlPoints: data => {
      const exterior = data.exterior || '';
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const controlPoints: ControlPoint[] = [];
      const lastPosition = vec2();
      const vector = vec2();
      parsePath(exterior, {
        moveTo: position => {
          equals(position, lastPosition);
        },
        lineTo: position => {
          controlPoints.push({position: equals(position), thickness});
          equals(position, lastPosition);
        },
        arcTo: (position, radius) => {
          minus(position, lastPosition, vector);
          const height = length(vector) / 2.0;
          const angle = 2.0 * Math.asin(clamp(height / radius, -1.0, 1.0));
          const distanceToMiddle = radius * (Math.cos(angle * 0.5) - 1.0);
          plusEquals(
            timesEquals(plusEquals(lastPosition, position), 0.5),
            timesEquals(orthonormalizeEquals(vector), distanceToMiddle),
          );
          controlPoints.push({position: equals(lastPosition), thickness});
          controlPoints.push({position: equals(position), thickness});
          equals(position, lastPosition);
        },
        curveTo: (position, c1, c2) => {
          controlPoints.push({position: equals(c1), thickness});
          controlPoints.push({position: equals(c2), thickness});
          controlPoints.push({position: equals(position), thickness});
          equals(position, lastPosition);
        },
      });
      return controlPoints;
    },
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const exterior = entity.state.shape.exterior || '';
      const lastPosition = vec2();
      const vector = vec2();
      const midpoint = vec2();
      const vertices: Vector2[] = [];
      parsePath(exterior, {
        moveTo: position => {
          equals(position, lastPosition);
        },
        lineTo: position => {
          vertices.push(equals(position));
          equals(position, lastPosition);
        },
        arcTo: (position, radius) => {
          minus(position, lastPosition, vector);
          const height = length(vector) / 2.0;
          const angle = 2.0 * Math.asin(clamp(height / radius, -1.0, 1.0));
          const distanceToMiddle = radius * (Math.cos(angle * 0.5) - 1.0);
          plusEquals(
            timesEquals(plusEquals(lastPosition, position), 0.5),
            timesEquals(orthonormalizeEquals(vector), distanceToMiddle),
          );
          vertices.push(equals(lastPosition));
          vertices.push(equals(position));
          equals(position, lastPosition);
        },
        curveTo: (position, c1, c2) => {
          vertices.push(equals(c1));
          vertices.push(equals(c2));
          vertices.push(equals(position));
          equals(position, lastPosition);
        },
      });
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const worldMatrix = getTransformMatrix(worldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, worldMatrix));
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
      const translation = getCentroid(vertices);
      let newExterior = '';
      const positionToString = (position: Vector2) => {
        return (
          roundToPrecision(position.x - translation.x, 6) +
          ' ' +
          roundToPrecision(position.y - translation.y, 6)
        );
      };
      let index = vertices.length - 1;
      parsePath(exterior, {
        moveTo: position => {
          newExterior += 'M ' + positionToString(vertices[index]);
          index = (index + 1) % vertices.length;
        },
        lineTo: position => {
          newExterior += ' L ' + positionToString(vertices[index++]);
        },
        arcTo: (position, radius) => {
          const start =
            vertices[(index + vertices.length - 1) % vertices.length];
          const mid = vertices[index++];
          const end = vertices[index++];
          const height = 0.5 * distance(start, end);
          orthonormalizeEquals(minus(end, start, vector));
          minusEquals(timesEquals(plus(start, end, midpoint), 0.5), mid);
          const dist = clamp(dot(vector, midpoint), -height, height);
          if (dist !== 0.0) {
            radius = (height * height + dist * dist) / (2.0 * dist);
          }
          newExterior +=
            ' A ' + positionToString(end) + ' ' + roundToPrecision(radius, 6);
        },
        curveTo: (position, c1, c2) => {
          newExterior +=
            ' C ' +
            positionToString(vertices[index + 2]) +
            ' ' +
            positionToString(vertices[index]) +
            ' ' +
            positionToString(vertices[index + 1]);
          index += 3;
        },
      });
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {translation}),
          ),
        ),
        shape: {exterior: newExterior},
      };
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
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      return {};
    },
  },
};

interface PathVisitor {
  moveTo(position: Vector2): void;
  lineTo(position: Vector2): void;
  arcTo(position: Vector2, radius: number): void;
  curveTo(position: Vector2, c1: Vector2, c2: Vector2): void;
}

const vertex = vec2();
const start = vec2();
const end = vec2();

/**
 * Parses the supplied path string and calls the appropriate visitor functions
 * with the path element parameters.
 *
 * @param path the path to parse.
 * @param visitor the visitor functions to call.
 */
export function parsePath(path: string, visitor: PathVisitor) {
  for (let ii = 0; ii < path.length; ) {
    const command = path.charAt(ii);
    ii += 2;

    let nextSpaceIndex = getNextSpaceIndex(path, ii);
    vertex.x = parseFloat(path.substring(ii, nextSpaceIndex));
    ii = nextSpaceIndex + 1;

    nextSpaceIndex = getNextSpaceIndex(path, ii);
    vertex.y = parseFloat(path.substring(ii, nextSpaceIndex));
    ii = nextSpaceIndex + 1;

    switch (command) {
      case 'M':
        visitor.moveTo(vertex);
        break;

      case 'L':
        visitor.lineTo(vertex);
        break;

      case 'A':
        nextSpaceIndex = getNextSpaceIndex(path, ii);
        const radius = parseFloat(path.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;
        visitor.arcTo(vertex, radius);
        break;

      case 'C':
        nextSpaceIndex = getNextSpaceIndex(path, ii);
        start.x = parseFloat(path.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(path, ii);
        start.y = parseFloat(path.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(path, ii);
        end.x = parseFloat(path.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(path, ii);
        end.y = parseFloat(path.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        visitor.curveTo(vertex, start, end);
        break;

      default:
        throw new Error('Unrecognized path command: ' + command);
    }
  }
}

function getNextSpaceIndex(path: string, index: number): number {
  const nextIndex = path.indexOf(' ', index);
  return nextIndex === -1 ? path.length : nextIndex;
}
