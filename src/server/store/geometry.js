/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Entity} from './resource';
import type {Transform, Bounds} from './math';
import {vec2, getTransformMaxScaleMagnitude, addToBoundsEquals} from './math';
import {getValue} from './util';
import {Path, Shape, ShapeList} from './shape';
import type {CollisionGeometry} from './collision';

type GeometryData = {
  addToBounds: (Bounds, Object) => number,
  createShapeList: Object => ShapeList,
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
  return entity.getCachedValue(
    'collisionGeometry',
    createCollisionGeometry,
    entity,
  );
}

function createCollisionGeometry(entity: Entity): ?CollisionGeometry {
  const shapeList = getShapeList(entity);
  if (!shapeList) {
    return null;
  }
  const transform: Transform = entity.getLastCachedValue('worldTransform');
  const magnitude = getTransformMaxScaleMagnitude(transform);
  const tessellation = magnitude * 4.0;
  return shapeList.createCollisionGeometry(tessellation);
}

/**
 * Gets the shape list for the specified entity through the cache.
 *
 * @param entity the entity whose shape list is desired.
 * @return the shape list, if any.
 */
export function getShapeList(entity: Entity): ?ShapeList {
  return entity.getCachedValue('shapeList', createShapeList, entity);
}

function createShapeList(entity: Entity): ?ShapeList {
  let currentShapeList: ?ShapeList;
  for (const key in entity.state) {
    const data = ComponentGeometry[key];
    if (data) {
      if (currentShapeList) {
        currentShapeList.add(data.createShapeList(entity.state[key]));
      } else {
        currentShapeList = data.createShapeList(entity.state[key]);
      }
    }
  }
  return currentShapeList;
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
      const path = new Path(loop);
      const attributes = {thickness};
      path.moveTo(vertices[0], 0, attributes);
      for (let ii = 1; ii < vertices.length; ii++) {
        path.lineTo(vertices[ii], 0, attributes);
      }
      loop && path.lineTo(vertices[0], 0, attributes);
      return new ShapeList([], [path]);
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
      const path = new Path(true);
      const attributes = {thickness};
      path.moveTo(vertices[0], 0, attributes);
      for (let ii = 1; ii < vertices.length; ii++) {
        path.lineTo(vertices[ii], 0, attributes);
      }
      path.lineTo(vertices[0], 0, attributes);
      return fill
        ? new ShapeList([new Shape(path)])
        : new ShapeList([], [path]);
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
  },
};
