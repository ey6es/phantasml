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
  DEFAULT_START_THICKNESS,
  DEFAULT_END_THICKNESS,
  DEFAULT_RECTANGLE_WIDTH,
  DEFAULT_RECTANGLE_HEIGHT,
  DEFAULT_ARC_RADIUS,
  DEFAULT_CURVE_SPAN,
  DEFAULT_CURVE_C1,
  DEFAULT_CURVE_C2,
  SIGIL_RADIUS,
  getShapeList,
} from './geometry';
import {getValue} from './util';

type BoundsData = {
  addToBounds: (IdTreeNode, Entity, Bounds) => number,
};

/**
 * Base bounds object.
 */
export const BaseBounds: BoundsData = {
  addToBounds: (idTree, entity, bounds) => {
    const shapeList = getShapeList(idTree, entity);
    return shapeList ? shapeList.addToBounds(bounds) : 0.0;
  },
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
  wedge: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.wedge;
      const startThickness = getValue(
        data.startThickness,
        DEFAULT_START_THICKNESS,
      );
      const endThickness = getValue(data.endThickness, DEFAULT_END_THICKNESS);
      const halfLength = getValue(data.length, DEFAULT_LINE_LENGTH) * 0.5;
      addToBoundsEquals(bounds, -halfLength, 0.0);
      addToBoundsEquals(bounds, halfLength, 0.0);
      return Math.max(startThickness, endThickness);
    },
  },
  lineGroup: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(idTree, entity, bounds, 'lineGroup');
    },
  },
  polygon: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(idTree, entity, bounds, 'polygon');
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
  sigil: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      const data = entity.state.sigil;
      const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
      addToBoundsEquals(bounds, -SIGIL_RADIUS, -SIGIL_RADIUS);
      addToBoundsEquals(bounds, SIGIL_RADIUS, SIGIL_RADIUS);
      return thickness;
    },
  },
  path: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(idTree, entity, bounds, 'path');
    },
  },
  shape: {
    addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
      return addShapeListToBounds(idTree, entity, bounds, 'shape');
    },
  },
  shapeList: BaseBounds,
};

function addShapeListToBounds(
  idTree: IdTreeNode,
  entity: Entity,
  bounds: Bounds,
  key: string,
): number {
  const data = entity.state[key];
  const thickness = getValue(data.thickness, DEFAULT_THICKNESS);
  const shapeList = getShapeList(idTree, entity);
  shapeList && shapeList.addToBounds(bounds);
  return thickness;
}
