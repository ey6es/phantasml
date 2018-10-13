/**
 * Geometry definitions.
 *
 * @module server/store/geometry
 * @flow
 */

import type {Bounds} from './math';
import {addToBoundsEquals} from './math';

type GeometryData = {
  addToBounds: (Bounds, Object) => void,
};

export const Geometry: {[string]: GeometryData} = {
  point: {
    addToBounds: (bounds, data) => {
      const thickness: number = data.thickness;
      addToBoundsEquals(bounds, -thickness, -thickness);
      addToBoundsEquals(bounds, thickness, thickness);
    },
  },
  line: {
    addToBounds: (bounds, data) => {},
  },
  lineGroup: {
    addToBounds: (bounds, data) => {},
  },
  polygon: {
    addToBounds: (bounds, data) => {},
  },
  rectangle: {
    addToBounds: (bounds, data) => {},
  },
  arc: {
    addToBounds: (bounds, data) => {},
  },
  curve: {
    addToBounds: (bounds, data) => {},
  },
};
