/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Entity} from './resource';
import {TransferableValue} from './resource';
import type {IdTreeNode} from './scene';
import type {Vector2, Transform, Bounds} from './math';
import {
  vec2,
  equals,
  rotateEquals,
  radians,
  plus,
  plusEquals,
  minus,
  minusEquals,
  times,
  timesEquals,
  negativeEquals,
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
  emptyBounds,
  addToBoundsEquals,
  getMean,
  getCentroid,
  clamp,
  roundToPrecision,
} from './math';
import {getValue, getColorArray, extend} from './util';
import {Path, Shape, ShapeList} from './shape';
import type {CollisionGeometry} from './collision';

export type ControlPoint = {
  position: Vector2,
  thickness: number,
  part?: ?number,
};

type GeometryData = {
  createShapeList: (
    IdTreeNode,
    Entity,
  ) => ShapeList | TransferableValue<ShapeList>,
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
export const SIGIL_RADIUS = 8.5;

/**
 * Gets the collision geometry for the specified entity through the cache.
 *
 * @param idTree the id tree to use to look up entities.
 * @param entity the entity whose collision geometry is desired.
 * @return the collision geometry, if any.
 */
export function getCollisionGeometry(
  idTree: IdTreeNode,
  entity: Entity,
): ?CollisionGeometry {
  return (entity.getCachedValue(
    'collisionGeometry',
    createCollisionGeometry,
    idTree,
    entity,
  ): any);
}

function createCollisionGeometry(
  idTree: IdTreeNode,
  entity: Entity,
): ?TransferableValue<CollisionGeometry> {
  const shapeList = getShapeList(idTree, entity);
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
 * @param idTree the id tree to use to look up entities.
 * @param entity the entity whose shape list is desired.
 * @return the shape list, if any.
 */
export function getShapeList(idTree: IdTreeNode, entity: Entity): ?ShapeList {
  return (entity.getCachedValue(
    'shapeList',
    createShapeList,
    idTree,
    entity,
  ): any);
}

function createShapeList(
  idTree: IdTreeNode,
  entity: Entity,
): ?TransferableValue<ShapeList> {
  let currentShapeList: ?ShapeList;
  const components: GeometryData[] = [];
  for (const key in entity.state) {
    const data = ComponentGeometry[key];
    if (data) {
      const component = entity.state[key];
      const shapeList = data.createShapeList(idTree, entity);
      if (shapeList instanceof TransferableValue) {
        return shapeList;
      }
      components.push(component);
      if (currentShapeList) {
        currentShapeList.add(shapeList);
      } else {
        currentShapeList = shapeList;
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
 * Base geometry object.
 */
export const BaseGeometry: GeometryData = {
  createShapeList: (idTree, entity) => new ShapeList(),
  getControlPoints: data => [],
  createControlPointEdit: (entity, indexPositions, mirrored) => ({}),
};

/**
 * Geometry component functions mapped by component name.
 */
export const ComponentGeometry: {[string]: GeometryData} = {
  point: {
    createShapeList: (idTree, entity) => {
      const data = entity.state.point;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.line;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.lineGroup;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.polygon;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.rectangle;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.arc;
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
    createShapeList: (idTree, entity) => {
      const data = entity.state.curve;
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
  sigil: extend(BaseGeometry, {
    createShapeList: (idTree, entity) => {
      const data = entity.state.sigil;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const PUPIL_HEIGHT = 5.0;
      const PUPIL_WIDTH = 2.0;
      const PUPIL_FLATNESS = 1.0;
      const LOBE_MIDDLE = 4.75;
      const LOBE_TOP_WIDTH = 0.75;
      const LOBE_BOTTOM_WIDTH = 1.0;
      const LOBE_HEIGHT = 1.0;
      const attributes = {thickness};
      const pupil = new Path()
        .moveTo(vec2(0.0, PUPIL_HEIGHT * -0.5), 0, attributes)
        .curveTo(
          vec2(0.0, PUPIL_HEIGHT * 0.5),
          vec2(PUPIL_WIDTH * 0.5, PUPIL_FLATNESS * -0.5),
          vec2(PUPIL_WIDTH * 0.5, PUPIL_FLATNESS * 0.5),
          0,
          attributes,
        )
        .curveTo(
          vec2(0.0, PUPIL_HEIGHT * -0.5),
          vec2(PUPIL_WIDTH * -0.5, PUPIL_FLATNESS * 0.5),
          vec2(PUPIL_WIDTH * -0.5, PUPIL_FLATNESS * -0.5),
          0,
          attributes,
        );
      const start = rotateEquals(vec2(0.0, PUPIL_HEIGHT * 0.5), radians(60));
      const end = vec2(-start.x, start.y);
      const topLobe = new Path()
        .moveTo(start, 0, attributes)
        .arcTo(end, PUPIL_HEIGHT * -0.5, 0, attributes)
        .curveTo(
          vec2(0.0, SIGIL_RADIUS),
          vec2(LOBE_BOTTOM_WIDTH * 0.5, LOBE_MIDDLE - LOBE_HEIGHT * 0.5),
          vec2(LOBE_TOP_WIDTH * 0.5, LOBE_MIDDLE + LOBE_HEIGHT * 0.5),
          0,
          attributes,
        )
        .curveTo(
          start,
          vec2(LOBE_TOP_WIDTH * -0.5, LOBE_MIDDLE + LOBE_HEIGHT * 0.5),
          vec2(LOBE_BOTTOM_WIDTH * -0.5, LOBE_MIDDLE - LOBE_HEIGHT * 0.5),
          0,
          attributes,
        );
      return new ShapeList([
        new Shape(pupil),
        new Shape(topLobe),
        new Shape(topLobe.createTransformed({rotation: radians(120)})),
        new Shape(topLobe.createTransformed({rotation: radians(-120)})),
      ])
        .move(0.0, -SIGIL_RADIUS, 0, attributes)
        .penDown()
        .turn(360, SIGIL_RADIUS);
    },
  }),
  path: {
    createShapeList: (idTree, entity) => {
      const data = entity.state.path;
      return createShapeOrPathShapeList(data, false);
    },
    getControlPoints: data => {
      return getShapeOrPathControlPoints(data, false);
    },
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      return createShapeOrPathControlPointEdit(
        entity,
        indexPositions,
        mirrored,
        false,
      );
    },
  },
  shape: {
    createShapeList: (idTree, entity) => {
      const data = entity.state.shape;
      return createShapeOrPathShapeList(data, true);
    },
    getControlPoints: data => {
      return getShapeOrPathControlPoints(data, true);
    },
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      return createShapeOrPathControlPointEdit(
        entity,
        indexPositions,
        mirrored,
        true,
      );
    },
  },
  shapeList: {
    createShapeList: (idTree, entity) => {
      const data = entity.state.shapeList;
      const list = data.list || '';
      const shapeList = new ShapeList();
      const createVisitor = (path, fillColor, pathColor, thickness) => {
        const attributes: Object = {
          thickness,
          pathColor: getColorArray(pathColor),
        };
        if (fillColor) {
          attributes.fillColor = getColorArray(fillColor);
        }
        return {
          moveTo: position => path.moveTo(equals(position), 0, attributes),
          lineTo: position => path.lineTo(equals(position), 0, attributes),
          arcTo: (position, radius) =>
            path.arcTo(equals(position), radius, 0, attributes),
          curveTo: (position, c1, c2) =>
            path.curveTo(
              equals(position),
              equals(c1),
              equals(c2),
              0,
              attributes,
            ),
        };
      };
      parseShapeList(list, {
        createShapeVisitor: (fillColor, pathColor, thickness) => {
          const exterior = new Path(true);
          shapeList.shapes.push(new Shape(exterior));
          return createVisitor(exterior, fillColor, pathColor, thickness);
        },
        createHoleVisitor: (pathColor, thickness) => {
          const hole = new Path(true);
          const shape = shapeList.shapes[shapeList.shapes.length - 1];
          shape.holes.push(hole);
          return createVisitor(hole, null, pathColor, thickness);
        },
        createPathVisitor: (loop, pathColor, thickness) => {
          const path = new Path(loop);
          shapeList.paths.push(path);
          return createVisitor(path, null, pathColor, thickness);
        },
      });
      return shapeList;
    },
    getControlPoints: data => {
      // we use negative thickness to indicate "invisible" control points
      // used only for programmatic manipulation
      return [
        {position: vec2(), thickness: -1},
        {position: vec2(1.0, 0.0), thickness: -1},
        {position: vec2(0.0, 1.0), thickness: -1},
      ];
    },
    createControlPointEdit: (entity, indexPositions, mirrored) => {
      const list = entity.state.shapeList.list || '';
      const vertices = [vec2(), vec2(1.0, 0.0), vec2(0.0, 1.0)];
      const worldTransform = entity.getLastCachedValue('worldTransform');
      const worldMatrix = getTransformMatrix(worldTransform);
      vertices.forEach(vertex => transformPointEquals(vertex, worldMatrix));
      for (const [index, position] of indexPositions) {
        equals(position, vertices[index]);
      }
      const translation = vertices[0];
      const axisX = vertices[1];
      const axisY = vertices[2];
      minusEquals(axisX, translation);
      minusEquals(axisY, translation);
      mirrored && negativeEquals(axisX);
      const rotation = Math.atan2(axisX.y, axisX.x);
      const scale = vec2(length(axisX), length(axisY));
      return {
        transform: simplifyTransform(
          composeTransforms(
            entity.state.transform,
            composeTransforms(invertTransform(worldTransform), {
              translation,
              rotation,
              scale,
            }),
          ),
        ),
        shapeList: {
          list: mirrored ? mirrorShapeList(list) : list,
        },
      };
    },
  },
};

function mirrorShapeList(list: string): string {
  const positionToString = (position: Vector2) => {
    return (
      roundToPrecision(-position.x, 6) + ' ' + roundToPrecision(position.y, 6)
    );
  };
  let newList = '';
  const pathVisitor = {
    moveTo: position => {
      newList += ` M ${positionToString(position)}`;
    },
    lineTo: position => {
      newList += ` L ${positionToString(position)}`;
    },
    arcTo: (position, radius) => {
      newList += ` A ${positionToString(position)} ${roundToPrecision(
        -radius,
        6,
      )}`;
    },
    curveTo: (position, c1, c2) => {
      newList +=
        ` C ${positionToString(position)} ` +
        `${positionToString(c1)} ${positionToString(c2)}`;
    },
  };
  parseShapeList(
    list,
    {
      createShapeVisitor: (fillColor, pathColor, thickness) => {
        if (newList.length > 0) {
          newList += ' ';
        }
        newList += `S ${fillColor} ${pathColor} ${roundToPrecision(
          thickness,
          6,
        )}`;
        return pathVisitor;
      },
      createHoleVisitor: (pathColor, thickness) => {
        if (newList.length > 0) {
          newList += ' ';
        }
        newList += `H ${pathColor} ${roundToPrecision(thickness, 6)}`;
        return pathVisitor;
      },
      createPathVisitor: (loop, pathColor, thickness) => {
        if (newList.length > 0) {
          newList += ' ';
        }
        newList += `P ${Number(loop)} ${pathColor} ${roundToPrecision(
          thickness,
          6,
        )}`;
        return pathVisitor;
      },
    },
    true,
  );
  return newList;
}

function createShapeOrPathShapeList(data: Object, shape: boolean): ShapeList {
  const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
  const createPathObject = (path: string) => {
    const pathObject = new Path(shape);
    parsePath(path, {
      moveTo: position => {
        pathObject.moveTo(equals(position), 0, {thickness});
      },
      lineTo: position => {
        pathObject.lineTo(equals(position), 0, {thickness});
      },
      arcTo: (position, radius) => {
        pathObject.arcTo(equals(position), radius, 0, {thickness});
      },
      curveTo: (position, c1, c2) => {
        pathObject.curveTo(equals(position), equals(c1), equals(c2), 0, {
          thickness,
        });
      },
    });
    return pathObject;
  };
  const path = (shape ? data.exterior : data.path) || '';
  const pathObject = createPathObject(path);
  let holeObjects = [];
  if (shape && data.holes) {
    holeObjects = data.holes.map(createPathObject);
  }
  const fill = shape && getValue(data.fill, DEFAULT_FILL);
  if (fill) {
    return new ShapeList([new Shape(pathObject, holeObjects)]);
  } else {
    return new ShapeList([], [pathObject, ...holeObjects]);
  }
}

function getShapeOrPathControlPoints(
  data: Object,
  shape: boolean,
): ControlPoint[] {
  const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
  const controlPoints: ControlPoint[] = [];
  const lastPosition = vec2();
  const vector = vec2();
  const addControlPoints = (path: string, part?: number) => {
    parsePath(path, {
      moveTo: position => {
        if (!shape) {
          controlPoints.push({position: equals(position), thickness, part});
        }
        equals(position, lastPosition);
      },
      lineTo: position => {
        controlPoints.push({position: equals(position), thickness, part});
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
        controlPoints.push({position: equals(lastPosition), thickness, part});
        controlPoints.push({position: equals(position), thickness, part});
        equals(position, lastPosition);
      },
      curveTo: (position, c1, c2) => {
        controlPoints.push({position: equals(c1), thickness, part});
        controlPoints.push({position: equals(c2), thickness, part});
        controlPoints.push({position: equals(position), thickness, part});
        equals(position, lastPosition);
      },
    });
  };
  if (shape) {
    addControlPoints(data.exterior || '');
    if (data.holes) {
      data.holes.forEach(addControlPoints);
    }
  } else {
    addControlPoints(data.path || '');
  }
  return controlPoints;
}

function createShapeOrPathControlPointEdit(
  entity: Entity,
  indexPositions: [number, Vector2][],
  mirrored: boolean,
  shape: boolean,
) {
  const lastPosition = vec2();
  const vector = vec2();
  const elementVertices: Vector2[][] = [];
  const allVertices: Vector2[] = [];
  const createVertices = (path: string) => {
    const vertices: Vector2[] = [];
    parsePath(path, {
      moveTo: position => {
        if (!shape) {
          vertices.push(equals(position));
        }
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
    allVertices.push(...vertices);
    return vertices;
  };
  const path =
    (shape ? entity.state.shape.exterior : entity.state.path.path) || '';
  const pathVertices = createVertices(path);
  const holeVertices =
    shape && entity.state.shape.holes
      ? entity.state.shape.holes.map(hole => createVertices(hole))
      : [];
  const worldTransform = entity.getLastCachedValue('worldTransform');
  const worldMatrix = getTransformMatrix(worldTransform);
  allVertices.forEach(vertex => transformPointEquals(vertex, worldMatrix));
  for (const [index, position] of indexPositions) {
    equals(position, allVertices[index]);
  }
  const translation = shape ? getCentroid(pathVertices) : getMean(pathVertices);
  const positionToString = (position: Vector2) => {
    return (
      roundToPrecision(position.x - translation.x, 6) +
      ' ' +
      roundToPrecision(position.y - translation.y, 6)
    );
  };
  const reversed = shape && mirrored;
  const midpoint = vec2();
  const createNewPath = (path: string, vertices: Vector2[]) => {
    let newPath = '';
    let index = shape ? vertices.length - 1 : 0;
    let increment = reversed ? vertices.length - 1 : 1;
    const reverseIncrement = vertices.length - increment;
    parsePath(
      path,
      {
        moveTo: position => {
          newPath += 'M ' + positionToString(vertices[index]);
          index = (index + increment) % vertices.length;
        },
        lineTo: position => {
          newPath += ' L ' + positionToString(vertices[index]);
          index = (index + increment) % vertices.length;
        },
        arcTo: (position, radius) => {
          const start = vertices[(index + reverseIncrement) % vertices.length];
          const mid = vertices[index];
          index = (index + increment) % vertices.length;
          const end = vertices[index];
          index = (index + increment) % vertices.length;
          const height = 0.5 * distance(start, end);
          orthonormalizeEquals(minus(end, start, vector));
          minusEquals(timesEquals(plus(start, end, midpoint), 0.5), mid);
          const dist = clamp(dot(vector, midpoint), -height, height);
          if (dist !== 0.0) {
            radius = (height * height + dist * dist) / (2.0 * dist);
          }
          newPath +=
            ' A ' + positionToString(end) + ' ' + roundToPrecision(radius, 6);
        },
        curveTo: position => {
          const c1 = vertices[index];
          index = (index + increment) % vertices.length;
          const c2 = vertices[index];
          index = (index + increment) % vertices.length;
          const end = vertices[index];
          index = (index + increment) % vertices.length;

          newPath +=
            ' C ' +
            positionToString(end) +
            ' ' +
            positionToString(c1) +
            ' ' +
            positionToString(c2);
        },
      },
      reversed,
    );
    return newPath;
  };
  const edit: Object = {
    transform: simplifyTransform(
      composeTransforms(
        entity.state.transform,
        composeTransforms(invertTransform(worldTransform), {translation}),
      ),
    ),
  };
  if (shape) {
    edit.shape = {exterior: createNewPath(path, pathVertices)};
    if (entity.state.shape.holes) {
      edit.shape.holes = entity.state.shape.holes.map((hole, index) =>
        createNewPath(hole, holeVertices[index]),
      );
    }
  } else {
    edit.path = {path: createNewPath(path, pathVertices)};
  }
  return edit;
}

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
 * @param [reversed=false] if true, visit the path elements in reverse order.
 * @param [startIndex=0] the index at which to start reading the path.
 * @return the current index within the string.
 */
export function parsePath(
  path: string,
  visitor: PathVisitor,
  reversed: boolean = false,
  startIndex: number = 0,
): number {
  const endFn: ?() => void = (visitor: Object).end;
  if (reversed) {
    const lastPosition = vec2();
    const commands: Object[] = [];
    const position = parsePath(
      path,
      {
        moveTo: position => {
          equals(position, lastPosition);
        },
        lineTo: position => {
          commands.unshift({type: 'line', position: equals(lastPosition)});
          equals(position, lastPosition);
        },
        arcTo: (position, radius) => {
          commands.unshift({
            type: 'arc',
            position: equals(lastPosition),
            radius: -radius,
          });
          equals(position, lastPosition);
        },
        curveTo: (position, c1, c2) => {
          commands.unshift({
            type: 'curve',
            position: equals(lastPosition),
            c1: equals(c2),
            c2: equals(c1),
          });
          equals(position, lastPosition);
        },
      },
      false,
      startIndex,
    );
    visitor.moveTo(lastPosition);
    for (const command of commands) {
      switch (command.type) {
        case 'line':
          visitor.lineTo(command.position);
          break;
        case 'arc':
          visitor.arcTo(command.position, command.radius);
          break;
        case 'curve':
          visitor.curveTo(command.position, command.c1, command.c2);
          break;
      }
    }
    endFn && endFn();
    return position;
  }
  for (let ii = startIndex; ii < path.length; ) {
    const command = path.charAt(ii);
    if ('MLAC'.indexOf(command) === -1) {
      endFn && endFn();
      return ii; // assume it's the next list command
    }
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
    }
  }
  endFn && endFn();
  return path.length;
}

interface ShapeListVisitor {
  createShapeVisitor(
    fillColor: string,
    pathColor: string,
    thickness: number,
  ): PathVisitor;

  createHoleVisitor(pathColor: string, thickness: number): PathVisitor;

  createPathVisitor(
    loop: boolean,
    pathColor: string,
    thickness: number,
  ): PathVisitor;
}

/**
 * Parses an encoded shape list.
 *
 * @param list the list to parse.
 * @param visitor the visitor to apply to the list elements.
 * @param reversed if true, parse the paths in reverse order.
 */
export function parseShapeList(
  list: string,
  visitor: ShapeListVisitor,
  reversed: boolean = false,
) {
  for (let ii = 0; ii < list.length; ) {
    const command = list.charAt(ii);
    ii += 2;

    switch (command) {
      case 'S': {
        let nextSpaceIndex = getNextSpaceIndex(list, ii);
        const fillColor = list.substring(ii, nextSpaceIndex);
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(list, ii);
        const pathColor = list.substring(ii, nextSpaceIndex);
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(list, ii);
        const thickness = parseFloat(list.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        ii = parsePath(
          list,
          visitor.createShapeVisitor(fillColor, pathColor, thickness),
          reversed,
          ii,
        );
        break;
      }
      case 'H': {
        let nextSpaceIndex = getNextSpaceIndex(list, ii);
        const pathColor = list.substring(ii, nextSpaceIndex);
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(list, ii);
        const thickness = parseFloat(list.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        ii = parsePath(
          list,
          visitor.createHoleVisitor(pathColor, thickness),
          reversed,
          ii,
        );
        break;
      }
      case 'P': {
        let nextSpaceIndex = getNextSpaceIndex(list, ii);
        const loop = list.substring(ii, nextSpaceIndex) === '1';
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(list, ii);
        const pathColor = list.substring(ii, nextSpaceIndex);
        ii = nextSpaceIndex + 1;

        nextSpaceIndex = getNextSpaceIndex(list, ii);
        const thickness = parseFloat(list.substring(ii, nextSpaceIndex));
        ii = nextSpaceIndex + 1;

        ii = parsePath(
          list,
          visitor.createPathVisitor(loop, pathColor, thickness),
          reversed,
          ii,
        );
        break;
      }
      default:
        throw new Error('Unrecognized shape list command: ' + command);
    }
  }
}

function getNextSpaceIndex(path: string, index: number): number {
  const nextIndex = path.indexOf(' ', index);
  return nextIndex === -1 ? path.length : nextIndex;
}
