/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Bounds} from './math';
import {vec2, addToBoundsEquals} from './math';
import {getValue} from './util';
import {ShapeList} from './shape';

type GeometryData = {
  addToBounds: (Bounds, Object) => void,
  createShapeList: Object => ShapeList,
};

export const DEFAULT_THICKNESS = 0.2;
export const DEFAULT_LINE_LENGTH = 5;
export const DEFAULT_LINE_GROUP_VERTICES = [vec2(5, 0), vec2(0, 2.5)];
export const DEFAULT_POLYGON_VERTICES = [vec2(5, 0), vec2(0, 2.5)];
export const DEFAULT_RECTANGLE_WIDTH = 5;
export const DEFAULT_RECTANGLE_HEIGHT = 5;
export const DEFAULT_ARC_RADIUS = 2.5;
export const DEFAULT_ARC_START_ANGLE = -Math.PI;
export const DEFAULT_ARC_END_ANGLE = Math.PI;
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
      return new ShapeList();
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
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      return new ShapeList();
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
      return new ShapeList();
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
      return new ShapeList();
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
      const halfWidth = getValue(data.width, DEFAULT_RECTANGLE_WIDTH) * 0.5;
      const halfHeight = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT) * 0.5;
      return new ShapeList();
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
      return new ShapeList();
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
      const halfSpan = getValue(data.span, DEFAULT_CURVE_SPAN) * 0.5;
      const c1 = getValue(data.c1, DEFAULT_CURVE_C1);
      const c2 = getValue(data.c2, DEFAULT_CURVE_C2);
      return new ShapeList();
    },
  },
};
