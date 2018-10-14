/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import type {Renderer} from './util';
import type {Entity} from '../../server/store/resource';

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (Object, Entity) => Renderer => void,
};

export const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      return (renderer: Renderer) => {};
    },
  },
};
