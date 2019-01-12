/**
 * Module renderers.
 *
 * @module client/renderer/modules
 * @flow
 */

import * as React from 'react';
import {MODULE_HEIGHT_PER_TERMINAL, ComponentModules} from './modules';
import type {HoverState} from '../store';
import {
  ComponentEditCallbacks,
  BaseEditCallbacks,
  StoreActions,
  store,
} from '../store';
import {
  SELECT_COLOR,
  ComponentRenderers,
  createShapeListRenderFn,
  renderShapeList,
  createVertexShader,
  createFragmentShader,
} from '../renderer/renderers';
import {
  WireArrowBounds,
  WireArrowCollisionGeometry,
  renderWireHelper,
  drawWireArrow,
} from '../renderer/helpers';
import type {Renderer} from '../renderer/util';
import {Geometry} from '../renderer/util';
import {TOOLTIP_DELAY} from '../util/ui';
import type {Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {
  Scene,
  SceneActions,
  getWorldTransform,
  mergeEntityEdits,
} from '../../server/store/scene';
import {ShapeList} from '../../server/store/shape';
import {
  ComponentGeometry,
  BaseGeometry,
  getCollisionGeometry,
  getShapeList,
} from '../../server/store/geometry';
import type {PenetrationResult} from '../../server/store/collision';
import {ComponentBounds, BaseBounds} from '../../server/store/bounds';
import type {Vector2, Transform, Bounds} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformInverseMatrix,
  getTransformTranslation,
  getTransformRotation,
  composeTransforms,
  invertTransform,
  transformPoint,
  transformPointEquals,
  expandBoundsEquals,
  transformBounds,
  vec2,
  equals,
  minus,
  plusEquals,
  distance,
} from '../../server/store/math';
import {extend, getColorArray} from '../../server/store/util';

ComponentRenderers.moduleRenderer = {
  getZOrder: (data: Object) => data.zOrder || 0,
  createRenderFn: (idTree: IdTreeNode, entity: Entity) => {
    const shapeList = getShapeList(idTree, entity);
    for (const key in entity.state) {
      const module = ComponentModules[key];
      if (module && shapeList) {
        const data = entity.state[key];
        const inputCount = Object.keys(module.getInputs(idTree, data)).length;
        const outputCount = Object.keys(module.getOutputs(idTree, data)).length;
        const outputTransform = module.getOutputTransform(data);
        const width = module.getWidth(data);
        return module.createRenderFn(
          idTree,
          entity,
          createShapeListRenderFn(
            entity,
            shapeList,
            (
              renderer: Renderer,
              transform: Transform,
              pathColor: string,
              fillColor: string,
              geometry: Geometry,
              selected: boolean,
              hoverState: HoverState,
            ) => {
              renderModule(
                renderer,
                transform,
                pathColor,
                fillColor,
                geometry,
                selected,
                hoverState,
                inputCount,
                outputCount,
                outputTransform,
                width,
              );
            },
            '#ffffff',
            '#ffffff',
          ),
        );
      }
    }
    return () => {};
  },
  onMove: onModuleMove,
  onFrame: entity => {
    const state = store.getState();
    const oldHoverState = state.hoverStates.get(entity.id);
    const resource = state.resource;
    if (!(resource instanceof Scene)) {
      return oldHoverState;
    }
    if (oldHoverState && oldHoverState.part) {
      const elapsed = Date.now() - oldHoverState.moveTime;
      if (elapsed > TOOLTIP_DELAY && !oldHoverState.dragging) {
        if (!(state.tooltip && state.tooltip.entityId == entity.id)) {
          for (const key in entity.state) {
            const module = ComponentModules[key];
            if (module) {
              const data = entity.state[key];
              const inputs = module.getInputs(resource.idTree, data);
              const inputKeys = Object.keys(inputs);
              const outputs = module.getOutputs(resource.idTree, data);
              const outputKeys = Object.keys(outputs);
              const width = module.getWidth(data);
              let index = oldHoverState.part - 1;
              let label: React.Element<any>;
              const position = vec2();
              let secondaryLabel: ?React.Element<any>;
              let secondaryPosition: ?Vector2;
              if (index < inputKeys.length) {
                label = inputs[inputKeys[index]].label;
                vec2(
                  width * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
                  ((inputKeys.length - 1) * 0.5 - index) *
                    MODULE_HEIGHT_PER_TERMINAL,
                  position,
                );
              } else {
                index -= inputKeys.length;
                const outputKey = outputKeys[index];
                label = outputs[outputKey].label;
                transformPointEquals(
                  vec2(
                    width * 0.5 + MODULE_HEIGHT_PER_TERMINAL * 0.5,
                    ((outputKeys.length - 1) * 0.5 - index) *
                      MODULE_HEIGHT_PER_TERMINAL,
                    position,
                  ),
                  getTransformMatrix(module.getOutputTransform(data)),
                );
                const output = data[outputKey];
                const targetEntity =
                  output &&
                  output.ref &&
                  state.resource &&
                  state.resource.getEntity(output.ref);
                if (targetEntity) {
                  const targetModuleKey = getModuleKey(targetEntity);
                  const targetModule =
                    targetModuleKey && ComponentModules[targetModuleKey];
                  const targetData =
                    targetModuleKey && targetEntity.state[targetModuleKey];
                  const targetInputs =
                    targetModule &&
                    targetData &&
                    targetModule.getInputs(resource.idTree, targetData);
                  const targetInput =
                    targetInputs && targetInputs[output.input];
                  if (
                    targetInputs &&
                    targetInput &&
                    targetModule &&
                    targetData
                  ) {
                    secondaryLabel = targetInput.label;
                    const targetInputKeys = Object.keys(targetInputs);
                    const targetIndex = targetInputKeys.indexOf(output.input);
                    const targetWidth = targetModule.getWidth(targetData);
                    secondaryPosition = vec2(
                      targetWidth * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
                      ((targetInputKeys.length - 1) * 0.5 - targetIndex) *
                        MODULE_HEIGHT_PER_TERMINAL,
                    );
                    transformPointEquals(
                      secondaryPosition,
                      getTransformMatrix(
                        targetEntity.getLastCachedValue('worldTransform'),
                      ),
                    );
                    secondaryPosition.y += MODULE_HEIGHT_PER_TERMINAL * 0.25;
                  }
                }
              }
              transformPointEquals(
                position,
                getTransformMatrix(entity.getLastCachedValue('worldTransform')),
              );
              position.y += MODULE_HEIGHT_PER_TERMINAL * 0.25;
              store.dispatch(
                StoreActions.setTooltip.create({
                  entityId: entity.id,
                  label,
                  position,
                  secondaryLabel,
                  secondaryPosition,
                }),
              );
              break;
            }
          }
        }
        return oldHoverState;
      }
    }
    if (state.tooltip && state.tooltip.entityId === entity.id) {
      store.dispatch(StoreActions.setTooltip.create(null));
    }
    return oldHoverState;
  },
  onPress: (entity, position) => {
    const state = store.getState();
    const oldHoverState = state.hoverStates.get(entity.id);
    const resource = state.resource;
    if (!(resource instanceof Scene)) {
      return [oldHoverState, true];
    }
    const parentPosition = transformPoint(
      position,
      getTransformMatrix(entity.state.transform),
    );
    const offset = minus(
      getTransformTranslation(entity.state.transform),
      parentPosition,
    );
    if (oldHoverState && oldHoverState.part) {
      if (state.tooltip && state.tooltip.entityId === entity.id) {
        store.dispatch(StoreActions.setTooltip.create(null));
      }
      let part = oldHoverState.part;
      if (part <= getInputCount(resource.idTree, entity)) {
        part = 0;
      }
      return [{dragging: position, offset, part}, false];
    } else if (oldHoverState) {
      for (const key in entity.state) {
        const module = ComponentModules[key];
        if (module) {
          return module.onPress(entity, position, offset);
        }
      }
    }
    return [oldHoverState, true];
  },
  onDrag: (entity, position, setHoverState) => {
    const state = store.getState();
    const oldHoverState = state.hoverStates.get(entity.id);
    const resource = state.resource;
    if (
      !(oldHoverState && oldHoverState.dragging && resource instanceof Scene)
    ) {
      for (const key in entity.state) {
        const module = ComponentModules[key];
        if (module) {
          return module.onDrag(entity, position, setHoverState);
        }
      }
      return oldHoverState;
    }
    if (oldHoverState.part) {
      const transform = composeTransforms(
        entity.getLastCachedValue('worldTransform'),
        {translation: position},
      );
      const bounds = expandBoundsEquals(
        transformBounds(WireArrowBounds, transform),
        MODULE_THICKNESS,
      );
      const inverseTransform = invertTransform(transform);
      const dropTargetIds: Set<string> = new Set();
      resource.applyToEntities(state.page, bounds, otherEntity => {
        if (otherEntity === entity) {
          return;
        }
        for (const key in otherEntity.state) {
          const renderer = ComponentRenderers[key];
          if (renderer) {
            const hoverState = renderer.onDragOver(
              otherEntity,
              entity,
              inverseTransform,
            );
            if (hoverState) {
              setHoverState(otherEntity.id, hoverState);
              dropTargetIds.add(otherEntity.id);
            }
          }
        }
      });
      for (const [id, hoverState] of state.hoverStates) {
        if (!(hoverState.dragging || dropTargetIds.has(id))) {
          setHoverState(id, undefined);
        }
      }
    } else {
      const parentPosition = transformPoint(
        position,
        getTransformMatrix(entity.state.transform),
      );
      const oldTrans = getTransformTranslation(entity.state.transform);
      const translation = plusEquals(parentPosition, oldHoverState.offset);
      if (translation.x !== oldTrans.x || translation.y !== oldTrans.y) {
        store.dispatch(
          SceneActions.editEntities.create({
            [entity.id]: {
              transform: {translation},
            },
          }),
        );
      }
    }
    return Object.assign({}, oldHoverState, {dragging: equals(position)});
  },
  onDragOver: (entity, draggedEntity, transform) => {
    const state = store.getState();
    const resource = state.resource;
    if (!(resource instanceof Scene)) {
      return;
    }
    const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
    if (!collisionGeometry) {
      return;
    }
    const results: PenetrationResult[] = [];
    collisionGeometry.getPenetration(
      WireArrowCollisionGeometry,
      composeTransforms(transform, entity.getLastCachedValue('worldTransform')),
      0.0,
      vec2(),
      results,
    );
    const inputCount = getInputCount(resource.idTree, entity);
    let part: ?number;
    for (const result of results) {
      const resultPart = collisionGeometry.getFloatAttribute(
        result.fromIndex,
        'part',
      );
      if (resultPart > 0 && resultPart <= inputCount) {
        if (!part) {
          part = resultPart;
        } else if (part !== resultPart) {
          return;
        }
      }
    }
    if (!part) {
      return;
    }
    let color: ?string;
    const draggedHoverState = state.hoverStates.get(draggedEntity.id);
    if (draggedHoverState && draggedHoverState.part) {
      const index =
        draggedHoverState.part -
        getInputCount(resource.idTree, draggedEntity) -
        1;
      color = WireColors[index % WireColors.length];
    }
    const oldHoverState = state.hoverStates.get(entity.id);
    if (
      oldHoverState &&
      oldHoverState.part === part &&
      oldHoverState.color === color &&
      oldHoverState.over
    ) {
      return oldHoverState;
    }
    return {part, color, over: true, moveTime: Date.now()};
  },
  onRelease: (entity, position) => {
    const state = store.getState();
    const resource = state.resource;
    const oldHoverState = state.hoverStates.get(entity.id);
    if (
      !(
        resource instanceof Scene &&
        oldHoverState.dragging &&
        oldHoverState.part
      )
    ) {
      for (const key in entity.state) {
        const module = ComponentModules[key];
        if (module) {
          return module.onRelease(entity, position);
        }
      }
      return;
    }
    const moduleKey = getModuleKey(entity);
    const outputKey = getOutputKey(resource.idTree, entity, oldHoverState.part);
    if (!(moduleKey && outputKey)) {
      return;
    }
    let targetEntity: ?Entity;
    let targetModuleKey: ?string;
    let targetInputKey: ?string;
    for (const [id, hoverState] of state.hoverStates) {
      if (hoverState && !hoverState.dragging && hoverState.part) {
        targetEntity = resource.getEntity(id);
        targetModuleKey = targetEntity && getModuleKey(targetEntity);
        targetInputKey =
          targetEntity &&
          getInputKey(resource.idTree, targetEntity, hoverState.part);
        break;
      }
    }
    const oldOutput = entity.state[moduleKey][outputKey];
    const map = {};
    if (targetEntity && targetModuleKey && targetInputKey) {
      if (
        oldOutput &&
        oldOutput.ref === targetEntity.id &&
        oldOutput.input === targetInputKey
      ) {
        return;
      }
      map[entity.id] = {
        [moduleKey]: {
          [outputKey]: {
            ref: targetEntity.id,
            input: targetInputKey,
          },
        },
      };
      const oldInput = targetEntity.state[targetModuleKey][targetInputKey];
      const oldSource = oldInput && resource.getEntity(oldInput.ref);
      const oldModuleKey = oldSource && getModuleKey(oldSource);
      if (oldModuleKey) {
        const existingValue = map[oldSource.id];
        map[oldSource.id] = {
          [oldModuleKey]: Object.assign(
            {},
            existingValue && existingValue[oldModuleKey],
            {[oldInput.output]: null},
          ),
        };
      }
      const existingValue = map[targetEntity.id];
      map[targetEntity.id] = {
        [targetModuleKey]: Object.assign(
          {},
          existingValue && existingValue[targetModuleKey],
          {[targetInputKey]: {ref: entity.id, output: outputKey}},
        ),
      };
    } else if (oldOutput) {
      map[entity.id] = {
        [moduleKey]: {
          [outputKey]: null,
        },
      };
    } else {
      return;
    }
    const oldTarget = oldOutput && resource.getEntity(oldOutput.ref);
    const oldTargetModuleKey = oldTarget && getModuleKey(oldTarget);
    if (oldTargetModuleKey) {
      const existingValue = map[oldTarget.id];
      map[oldTarget.id] = {
        [oldTargetModuleKey]: Object.assign(
          {},
          existingValue && existingValue[oldTargetModuleKey],
          {[oldOutput.input]: null},
        ),
      };
    }
    store.dispatch(SceneActions.editEntities.create(map));
  },
};

ComponentEditCallbacks.moduleRenderer = extend(BaseEditCallbacks, {
  onDelete: (scene, entity, map) => {
    const moduleKey = getModuleKey(entity);
    if (!moduleKey) {
      return map;
    }
    let newMap = map;
    const moduleData = entity.state[moduleKey];
    for (const key in moduleData) {
      const value = moduleData[key];
      if (value && value.ref) {
        const otherEntity = scene.getEntity(value.ref);
        const otherModuleKey = otherEntity && getModuleKey(otherEntity);
        if (otherModuleKey && newMap[value.ref] !== null) {
          // remove reference on other side
          newMap = mergeEntityEdits(newMap, {
            [value.ref]: {
              [otherModuleKey]: {
                [value.input || value.output]: null,
              },
            },
          });
        }
      }
    }
    return newMap;
  },
  onEdit: (scene, entity, map) => {
    const moduleKey = getModuleKey(entity);
    if (!moduleKey) {
      return map;
    }
    const module = ComponentModules[moduleKey];
    const moduleData = mergeEntityEdits(
      entity.state[moduleKey],
      map[entity.id][moduleKey] || {},
    );
    const inputs = module.getInputs(scene.idTree, moduleData);
    const outputs = module.getOutputs(scene.idTree, moduleData);
    let newMap = map;
    for (const key in moduleData) {
      // remove any connections that are no longer valid
      const value = moduleData[key];
      if (value && value.ref) {
        let remove: ?string;
        if (value.input) {
          if (!outputs[key]) {
            remove = value.input;
          }
        } else if (value.output) {
          if (!inputs[key]) {
            remove = value.output;
          } else if (scene.getEntity(value.ref) && newMap[value.ref] !== null) {
            // touch the source to trigger an update
            newMap = mergeEntityEdits(newMap, {[value.ref]: {}});
          }
        }
        if (remove) {
          const otherEntity = scene.getEntity(value.ref);
          const otherModuleKey = otherEntity && getModuleKey(otherEntity);
          if (otherModuleKey) {
            newMap = mergeEntityEdits(newMap, {
              [entity.id]: {
                [moduleKey]: {[key]: null},
              },
              [value.ref]: {
                [otherModuleKey]: {[remove]: null},
              },
            });
          }
        }
      }
    }
    return newMap;
  },
});

function onModuleMove(entity: Entity, position: Vector2): HoverState {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
  if (!collisionGeometry) {
    return;
  }
  const results: PenetrationResult[] = [];
  collisionGeometry.getPointPenetration(position, 0.0, vec2(), results);
  if (results.length === 0) {
    return;
  }
  const part = collisionGeometry.getFloatAttribute(
    results[0].fromIndex,
    'part',
  );
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      const data = entity.state[key];
      if (part === 0) {
        return module.onMove(entity, position);
      }
      const inputKeys = Object.keys(module.getInputs(resource.idTree, data));
      const inputKey = inputKeys[part - 1];
      if (inputKey && data[inputKey]) {
        return; // connected input
      }
    }
  }
  const oldHoverState = state.hoverStates.get(entity.id);
  if (oldHoverState && oldHoverState.part === part && !oldHoverState.dragging) {
    return oldHoverState;
  }
  return {part, moveTime: Date.now()};
}

function getInputCount(idTree: IdTreeNode, entity: Entity): number {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      return Object.keys(module.getInputs(idTree, entity.state[key])).length;
    }
  }
  return 0;
}

function getInputKey(
  idTree: IdTreeNode,
  entity: Entity,
  part: number,
): ?string {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      const data = entity.state[key];
      const inputs = Object.keys(module.getInputs(idTree, data));
      return inputs[part - 1];
    }
  }
}

function getOutputKey(
  idTree: IdTreeNode,
  entity: Entity,
  part: number,
): ?string {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      const data = entity.state[key];
      const inputs = Object.keys(module.getInputs(idTree, data));
      const outputs = Object.keys(module.getOutputs(idTree, data));
      return outputs[part - inputs.length - 1];
    }
  }
}

function getModuleKey(entity: Entity): ?string {
  for (const key in entity.state) {
    if (ComponentModules[key]) {
      return key;
    }
  }
}

const MODULE_THICKNESS = 0.15;
const TERMINAL_WIDTH = 1.125;
const MODULE_BODY_ATTRIBUTES = {
  thickness: 0.15,
  pathColor: [1.0, 1.0, 1.0],
  fillColor: [0.5, 0.5, 0.5],
  part: 0,
};

const WireColors = [
  '#00ffff', // cyan
  '#ff00ff', // magenta
  '#ffff00', // yellow
  '#00ff00', // green
  '#ff8000', // orange
  '#ff0000', // red
];
const WireColorArrays = WireColors.map(getColorArray);

ComponentBounds.moduleRenderer = BaseBounds;

ComponentGeometry.moduleRenderer = extend(BaseGeometry, {
  createShapeList: (idTree, entity) => {
    for (const key in entity.state) {
      const module = ComponentModules[key];
      if (!module) {
        continue;
      }
      const data = entity.state[key];
      const inputs = module.getInputs(idTree, data);
      const inputCount = Object.keys(inputs).length;
      const outputs = module.getOutputs(idTree, data);
      const outputCount = Object.keys(outputs).length;
      const width = module.getWidth(data);
      const height = module.getHeight(data, inputCount, outputCount);
      const shapeList = new ShapeList().lower();
      shapeList.omitCollisionAttributes.add('pathColor');
      shapeList.omitCollisionAttributes.add('fillColor');
      let y = (inputCount - 1) * MODULE_HEIGHT_PER_TERMINAL * 0.5;
      let part = 1;
      for (const input in inputs) {
        let color = [1.0, 1.0, 1.0];
        const source = data[input];
        const sourceEntity = source && idTree.getEntity(source.ref);
        const sourceModuleKey = sourceEntity && getModuleKey(sourceEntity);
        if (sourceEntity && sourceModuleKey) {
          const sourceOutputs = Object.keys(
            ComponentModules[sourceModuleKey].getOutputs(
              idTree,
              sourceEntity.state[sourceModuleKey],
            ),
          );
          const index = sourceOutputs.indexOf(source.output);
          color = WireColorArrays[index % WireColorArrays.length];
        }
        shapeList
          .move(width * -0.5, y, 180)
          .penDown(false, {
            thickness: MODULE_THICKNESS,
            pathColor: color,
            fillColor: color,
            part,
          })
          .advance(0.75)
          .penUp()
          .penDown(false, {thickness: 0.375})
          .penUp();
        y -= MODULE_HEIGHT_PER_TERMINAL;
        part++;
      }
      y = (outputCount - 1) * MODULE_HEIGHT_PER_TERMINAL * 0.5;
      const outputPosition = vec2();
      let color = 0;
      let connected = false;
      const outputTransform = module.getOutputTransform(data);
      const outputMatrix = getTransformMatrix(outputTransform);
      const outputInverseMatrix = getTransformInverseMatrix(outputTransform);
      const outputRotation = getTransformRotation(outputTransform);
      for (const output in outputs) {
        const wireColor = WireColorArrays[color];
        color = (color + 1) % WireColorArrays.length;
        transformPointEquals(
          vec2(width * 0.5, y, outputPosition),
          outputMatrix,
        );
        shapeList
          .jump(outputPosition.x, outputPosition.y, outputRotation)
          .penDown(false, {
            thickness: MODULE_THICKNESS,
            pathColor: wireColor,
            fillColor: wireColor,
            part,
          });
        const target = data[output];
        const targetEntity = target && idTree.getEntity(target.ref);
        const targetModuleKey = targetEntity && getModuleKey(targetEntity);
        if (targetEntity && targetModuleKey) {
          connected = true;
          const targetModule = ComponentModules[targetModuleKey];
          const targetData = targetEntity.state[targetModuleKey];
          const targetInputKeys = Object.keys(
            targetModule.getInputs(idTree, targetData),
          );
          const targetWidth = targetModule.getWidth(targetData);
          const index = targetInputKeys.indexOf(target.input);
          const inputPosition = vec2(
            targetWidth * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
            ((targetInputKeys.length - 1) * 0.5 - index) *
              MODULE_HEIGHT_PER_TERMINAL,
          );
          transformPointEquals(
            inputPosition,
            getTransformMatrix(
              getWorldTransform(idTree.getEntityLineage(targetEntity)),
            ),
          );
          transformPointEquals(
            inputPosition,
            getTransformInverseMatrix(
              getWorldTransform(idTree.getEntityLineage(entity)),
            ),
          );
          vec2(width * 0.5, y, outputPosition);
          transformPointEquals(inputPosition, outputInverseMatrix);
          const halfSpan = distance(outputPosition, inputPosition) * 0.5;
          outputPosition.x += halfSpan;
          inputPosition.x -= halfSpan;
          const angle = Math.atan2(
            inputPosition.y - outputPosition.y,
            inputPosition.x - outputPosition.x,
          );
          shapeList
            .curve(
              halfSpan,
              angle,
              distance(outputPosition, inputPosition),
              -angle,
              halfSpan,
            )
            .penUp()
            .penDown(false, {thickness: 0.375})
            .penUp();
        } else {
          drawWireArrow(shapeList.advance(0.525).penUp());
        }
        y -= MODULE_HEIGHT_PER_TERMINAL;
        part++;
      }
      shapeList.raise().setAttributes(MODULE_BODY_ATTRIBUTES);
      module.drawBody(data, width, height, shapeList);
      shapeList.add(module.getIcon(data));
      return new TransferableValue(shapeList, newEntity => {
        // we can transfer if we have the same module component
        return newEntity.state[key] === data && !connected;
      });
    }
    return new ShapeList();
  },
});

const start = vec2();
const end = vec2();

function renderModule(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
  inputCount: number,
  outputCount: number,
  outputTransform: Transform,
  width: number,
) {
  const partHover = hoverState && hoverState.part;
  if (!partHover) {
    renderShapeList(
      renderer,
      transform,
      pathColor,
      fillColor,
      geometry,
      selected,
      hoverState,
    );
    return;
  }
  const program = renderer.getProgram(
    renderModule,
    renderer.getVertexShader(renderModule, MODULE_VERTEX_SHADER),
    renderer.getFragmentShader(renderModule, MODULE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  if (hoverState.dragging) {
    program.setUniformFloat('replacePart', hoverState.part);
    program.setUniformFloat('replaceAlpha', 0.0);
  } else if (hoverState.color) {
    program.setUniformFloat('replacePart', hoverState.part);
    program.setUniformColor('replaceColor', hoverState.color);
    program.setUniformFloat('replaceAlpha', 1.0);
  } else {
    program.setUniformFloat('replacePart', -1.0);
  }
  program.setUniformColor('outlineColor', SELECT_COLOR);
  renderer.setEnabled(renderer.gl.BLEND, true);
  if (selected) {
    program.setUniformFloat('alpha', 1.0);
    program.setUniformFloat('outline', 1.0);
    program.setUniformFloat('hoverPart', -1.0);
    geometry.draw(program);
    program.setUniformFloat('outline', 0.0);
  } else {
    program.setUniformFloat('alpha', 0.25);
    program.setUniformFloat('outline', 0.0);
    program.setUniformFloat('hoverPart', hoverState.part);
    geometry.draw(program);
    program.setUniformFloat('alpha', 1.0);
    program.setUniformFloat('hoverPart', -1.0);
  }
  if (hoverState.dragging) {
    const index = hoverState.part - inputCount - 1;
    start.x = width * 0.5;
    start.y = ((outputCount - 1) * 0.5 - index) * MODULE_HEIGHT_PER_TERMINAL;
    const wireTransform = composeTransforms(transform, outputTransform);
    transformPoint(
      hoverState.dragging,
      getTransformInverseMatrix(outputTransform),
      end,
    );
    if (selected) {
      renderWireHelper(
        renderer,
        wireTransform,
        MODULE_THICKNESS + renderer.pixelsToWorldUnits * 3.0,
        SELECT_COLOR,
        start,
        end,
      );
    }
    renderWireHelper(
      renderer,
      wireTransform,
      MODULE_THICKNESS,
      WireColors[index % WireColors.length],
      start,
      end,
    );
  }
  geometry.draw(program);
}

const MODULE_VERTEX_SHADER = createVertexShader(
  `
    uniform float hoverPart;
    uniform float replacePart;
    uniform vec3 replaceColor;
    uniform float replaceAlpha;
    uniform float alpha;
    uniform float outline;
    uniform vec3 outlineColor;
    attribute float thickness;
    attribute vec3 pathColor;
    attribute vec3 fillColor;
    attribute float part;
    varying vec3 interpolatedPathColor;
    varying vec3 interpolatedFillColor;
    varying float interpolatedAlpha;
  `,
  `
    float replace =
      step(replacePart - 0.5, part) * step(part, replacePart + 0.5);
    vec3 basePathColor = mix(pathColor, replaceColor, replace);
    vec3 baseFillColor = mix(fillColor, replaceColor, replace);
    interpolatedPathColor = mix(basePathColor, outlineColor, outline);
    interpolatedFillColor = mix(baseFillColor, outlineColor, outline);
    interpolatedAlpha = alpha * mix(1.0, replaceAlpha, replace);
    float hovered = step(hoverPart - 0.5, part) * step(part, hoverPart + 0.5);
  `,
  `thickness + (hovered * 2.0 + outline * 3.0) * pixelsToWorldUnits`,
);

export const MODULE_FRAGMENT_SHADER = createFragmentShader(
  `
    varying vec3 interpolatedPathColor;
    varying vec3 interpolatedFillColor;
    varying float interpolatedAlpha;
  `,
  `
    float filled = 1.0 - step(dist, 0.0);
    vec3 color = mix(interpolatedFillColor, interpolatedPathColor, filled);
  `,
  `vec4(color, baseAlpha * interpolatedAlpha)`,
);
