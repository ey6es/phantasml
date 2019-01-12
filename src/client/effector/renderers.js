/**
 * Effector renderers.
 *
 * @module client/effector/renderers
 * @flow
 */

import {ComponentEffectors} from './effectors';
import {ComponentEditCallbacks} from '../store';
import {
  ComponentRenderers,
  BaseRenderer,
  createShapeListRenderFn,
  renderShapeList,
} from '../renderer/renderers';
import {TransferableValue} from '../../server/store/resource';
import {mergeEntityEdits} from '../../server/store/scene';
import {ComponentBounds, BaseBounds} from '../../server/store/bounds';
import {
  ComponentGeometry,
  BaseGeometry,
  getShapeList,
} from '../../server/store/geometry';
import {ShapeList} from '../../server/store/shape';
import {extend} from '../../server/store/util';

ComponentBounds.effectorRenderer = BaseBounds;

ComponentGeometry.effectorRenderer = extend(BaseGeometry, {
  createShapeList: (idTree, entity) => {
    for (const key in entity.state) {
      const effector = ComponentEffectors[key];
      if (effector) {
        const data = entity.state[key];
        return new TransferableValue(
          effector.createShapeList(data),
          newEntity => newEntity.state[key] === data,
        );
      }
    }
    return new ShapeList();
  },
});

ComponentRenderers.effectorRenderer = extend(BaseRenderer, {
  createRenderFn: (idTree, entity) => {
    const shapeList = getShapeList(idTree, entity);
    if (!shapeList) {
      return () => {};
    }
    return createShapeListRenderFn(
      entity,
      shapeList,
      renderShapeList,
      '#ffffff',
      '#ffffff',
    );
  },
});

ComponentEditCallbacks.effectorRenderer = {
  onCreate: (scene, id, map) => {
    // add id to output bus list
    return mergeEntityEdits(map, {
      outputBus: {outputBus: {effectors: {[id]: true}}},
    });
  },
  onDelete: (scene, entity, map) => {
    // remove id from output bus list
    return mergeEntityEdits(map, {
      outputBus: {outputBus: {effectors: {[entity.id]: null}}},
    });
  },
  onEdit: (scene, entity, map) => {
    // touch output bus in case the effector inputs changed
    return map.outputBus ? map : mergeEntityEdits(map, {outputBus: {}});
  },
};
