/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import type {Renderer} from './util';
import type {Entity} from '../../server/store/resource';

type RendererData = {
  render: (Renderer, Object, Entity) => void,
};

const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    render: (renderer: Renderer, data: Object, entity: Entity) => {},
  },
};
