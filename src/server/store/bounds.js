/**
 * Bounds definitions.
 *
 * @module server/store/bounds
 * @flow
 */

import type {Entity} from './resource';
import type {IdTreeNode} from './scene';
import type {Bounds} from './math';
import {addToBoundsEquals} from './math';
import {
  DEFAULT_THICKNESS,
  DEFAULT_LINE_LENGTH,
  DEFAULT_RECTANGLE_WIDTH,
  DEFAULT_RECTANGLE_HEIGHT,
  DEFAULT_ARC_RADIUS,
  DEFAULT_CURVE_SPAN,
  DEFAULT_CURVE_C1,
  DEFAULT_CURVE_C2,
  getShapeList,
} from './geometry';
import {getValue} from './util';

type BoundsData = {
  addToBounds: (IdTreeNode, Entity, Bounds) => number,
};

/**
 * Bounds component functions mapped by component name.
 */
export const ComponentBounds: {[string]: BoundsData} = {
  point: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.point;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      addToBoundsEquals(bounds, 0.0, 0.0);
      return thickness;
    },
  },
  line: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.line;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      addToBoundsEquals(bounds, -halfLength, 0.0);
      addToBoundsEquals(bounds, halfLength, 0.0);
      return thickness;
    },
  },
  lineGroup: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(entity, bounds, 'lineGroup');
    },
  },
  polygon: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(entity, bounds, 'polygon');
    },
  },
  rectangle: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.rectangle;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const halfWidth = getValue(data.width, DEFAULT_RECTANGLE_WIDTH) * 0.5;
      const halfHeight = getValue(data.height, DEFAULT_RECTANGLE_HEIGHT) * 0.5;
      addToBoundsEquals(bounds, -halfWidth, -halfHeight);
      addToBoundsEquals(bounds, halfWidth, halfHeight);
      return thickness;
    },
  },
  arc: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.arc;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      const radius = getValue(data.radius, DEFAULT_ARC_RADIUS);
      addToBoundsEquals(bounds, -radius, -radius);
      addToBoundsEquals(bounds, radius, radius);
      return thickness;
    },
  },
  curve: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.curve;
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
  },
  path: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(entity, bounds, 'path');
    },
  },
  shape: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(entity, bounds, 'shape');
    },
  },
  shapeList: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const shapeList = getShapeList(entity);
      return shapeList ? shapeList.addToBounds(bounds) : 0.0;
    },
  },
};

function addShapeListToBounds(
  entity: Entity,
  bounds: Bounds,
  key: string,
): number {
  const data = entity.state[key];
  const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
  const shapeList = getShapeList(entity);
  shapeList && shapeList.addToBounds(bounds);
  return thickness;
}
