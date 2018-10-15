/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Bounds} from './math';
import {vec2, addToBoundsEquals} from './math';
import {getValue} from './util';
import {Path, Shape, ShapeList} from './shape';

type GeometryData = {
  addToBounds: (Bounds, Object) => void,
  createShapeList: Object => ShapeList,
};

export const DEFAULT_THICKNESS = 0.2;
export const DEFAULT_LINE_LENGTH = 5;
export const DEFAULT_LINE_GROUP_VERTICES = [vec2(5, 0), vec2(0, 2.5)];
export const DEFAULT_LINE_GROUP_LOOP = false;
export const DEFAULT_POLYGON_VERTICES = [vec2(5, 0), vec2(0, 2.5)];
export const DEFAULT_POLYGON_FILL = false;
export const DEFAULT_RECTANGLE_WIDTH = 5;
export const DEFAULT_RECTANGLE_HEIGHT = 5;
export const DEFAULT_RECTANGLE_FILL = false;
export const DEFAULT_ARC_RADIUS = 2.5;
export const DEFAULT_ARC_START_ANGLE = -Math.PI;
export const DEFAULT_ARC_END_ANGLE = Math.PI;
export const DEFAULT_ARC_FILL = false;
export const DEFAULT_CURVE_SPAN = 5;
export const DEFAULT_CURVE_C1 = vec2(-0.833, 2);
export const DEFAULT_CURVE_C2 = vec2(0.833, -2);

export const ComponentGeometry: {[string]: GeometryData} = {
  point: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      addToBoundsEquals(bounds, -thickness, -thickness);
      addToBoundsEquals(bounds, thickness, thickness);
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
      addToBoundsEquals(bounds, -halfLength - thickness, -thickness);
      addToBoundsEquals(bounds, halfLength + thickness, thickness);
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
      const vertices = getValue(data.vertices, DEFAULT_LINE_GROUP_VERTICES);
      for (const vertex of vertices) {
        addToBoundsEquals(bounds, vertex.x - thickness, vertex.y - thickness);
        addToBoundsEquals(bounds, vertex.x + thickness, vertex.y + thickness);
      }
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_LINE_GROUP_VERTICES);
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
      return new ShapeList([], [path]);
    },
  },
  polygon: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_POLYGON_VERTICES);
      for (const vertex of vertices) {
        addToBoundsEquals(bounds, vertex.x - thickness, vertex.y - thickness);
        addToBoundsEquals(bounds, vertex.x + thickness, vertex.y + thickness);
      }
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const vertices = getValue(data.vertices, DEFAULT_POLYGON_VERTICES);
      const fill = getValue(data.fill, DEFAULT_POLYGON_FILL);
      if (vertices.length === 0) {
        return new ShapeList();
      }
      const path = new Path(true);
      const attributes = {thickness};
      path.moveTo(vertices[0], 0, attributes);
      for (let ii = 1; ii < vertices.length; ii++) {
        path.lineTo(vertices[ii], 0, attributes);
      }
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
      addToBoundsEquals(
        bounds,
        -halfWidth - thickness,
        -halfHeight - thickness,
      );
      addToBoundsEquals(bounds, halfWidth + thickness, halfHeight + thickness);
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const width = getValue(data.width, DEFAULT_RECTANGLE_WIDTH);
      const height = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT);
      const fill = getValue(data.fill, DEFAULT_RECTANGLE_FILL);
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
      const startAngle = getValue(data.startAngle, DEFAULT_ARC_START_ANGLE);
      const endAngle = getValue(data.endAngle, DEFAULT_ARC_END_ANGLE);
      addToBoundsEquals(bounds, -radius - thickness, -radius - thickness);
      addToBoundsEquals(bounds, radius + thickness, radius + thickness);
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      const startAngle = getValue(data.startAngle, DEFAULT_ARC_START_ANGLE);
      const endAngle = getValue(data.endAngle, DEFAULT_ARC_END_ANGLE);
      const fill = getValue(data.fill, DEFAULT_ARC_FILL);
      return new ShapeList()
        .move(radius, 0, 90)
        .arc(startAngle, radius)
        .penDown(fill)
        .arc(endAngle - startAngle, radius, {thickness});
    },
  },
  curve: {
    addToBounds: (bounds, data) => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      addToBoundsEquals(bounds, -halfSpan - thickness, -thickness);
      addToBoundsEquals(bounds, halfSpan + thickness, thickness);

      addToBoundsEquals(bounds, c1.x - thickness, c1.y - thickness);
      addToBoundsEquals(bounds, c1.x + thickness, c1.y + thickness);

      addToBoundsEquals(bounds, c2.x - thickness, c2.y - thickness);
      addToBoundsEquals(bounds, c2.x + thickness, c2.y + thickness);
    },
    createShapeList: data => {
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const span = getValue(data.span, DEFAULT_CURVE_SPAN);
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      const attributes = {thickness};
      const path = new Path();
      path.curveTo(vec2(span, 0), c1, c2, 0, {thickness});
      return new ShapeList([], [path]);
    },
  },
};
