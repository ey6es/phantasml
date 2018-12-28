/**
 * Module renderers.
 *
 * @module client/renderer/modules
 * @flow
 */

import * as React from 'react';
import {MODULE_HEIGHT_PER_TERMINAL, ComponentModules} from './modules';
import type {HoverState} from '../store';
import {ComponentEditCallbacks, StoreActions, store} from '../store';
import {
  SELECT_COLOR,
  ComponentRenderers,
  createShapeListRenderFn,
  renderShapeList,
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
  getCollisionGeometry,
  getShapeList,
} from '../../server/store/geometry';
import type {PenetrationResult} from '../../server/store/collision';
import {ComponentBounds} from '../../server/store/bounds';
import type {Vector2, Transform, Bounds} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformInverseMatrix,
  getTransformTranslation,
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
import {getColorArray} from '../../server/store/util';

ComponentRenderers.moduleRenderer = {
  getZOrder: (data: Object) => data.zOrder || 0,
  createRenderFn: (idTree: IdTreeNode, entity: Entity) => {
    const shapeList = getShapeList(idTree, entity);
    for (const key in entity.state) {
      const module = ComponentModules[key];
      if (module && shapeList) {
        const data = entity.state[key];
        const inputCount = Object.keys(module.getInputs(data)).length;
        const outputCount = Object.keys(module.getOutputs(data)).length;
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
    if (oldHoverState && oldHoverState.part) {
      const elapsed = Date.now() - oldHoverState.moveTime;
      if (elapsed > TOOLTIP_DELAY && !oldHoverState.dragging) {
        if (!(state.tooltip && state.tooltip.entityId == entity.id)) {
          for (const key in entity.state) {
            const module = ComponentModules[key];
            if (module) {
              const data = entity.state[key];
              const inputs = module.getInputs(data);
              const inputKeys = Object.keys(inputs);
              const outputs = module.getOutputs(data);
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
                  ((inputKeys.length - 1) * 0.5 - index + 0.25) *
                    MODULE_HEIGHT_PER_TERMINAL,
                  position,
                );
              } else {
                index -= inputKeys.length;
                const outputKey = outputKeys[index];
                label = outputs[outputKey].label;
                vec2(
                  width * 0.5 + MODULE_HEIGHT_PER_TERMINAL * 0.5,
                  ((outputKeys.length - 1) * 0.5 - index + 0.25) *
                    MODULE_HEIGHT_PER_TERMINAL,
                  position,
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
                  const targetInputs =
                    targetModule &&
                    targetModule.getInputs(targetEntity.state[targetModuleKey]);
                  const targetInput =
                    targetInputs && targetInputs[output.input];
                  if (targetInputs && targetInput) {
                    secondaryLabel = targetInput.label;
                    const targetInputKeys = Object.keys(targetInputs);
                    const targetIndex = targetInputKeys.indexOf(output.input);
                    secondaryPosition = vec2(
                      width * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
                      ((targetInputKeys.length - 1) * 0.5 -
                        targetIndex +
                        0.25) *
                        MODULE_HEIGHT_PER_TERMINAL,
                    );
                    transformPointEquals(
                      secondaryPosition,
                      getTransformMatrix(
                        targetEntity.getLastCachedValue('worldTransform'),
                      ),
                    );
                  }
                }
              }
              store.dispatch(
                StoreActions.setTooltip.create({
                  entityId: entity.id,
                  label,
                  position: transformPointEquals(
                    position,
                    getTransformMatrix(
                      entity.getLastCachedValue('worldTransform'),
                    ),
                  ),
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
      if (part <= getInputCount(entity)) {
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
    const inputCount = getInputCount(entity);
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
      const index = draggedHoverState.part - getInputCount(draggedEntity) - 1;
      color = WireColors[index % WireColors.length];
    }
    const oldHoverState = state.hoverStates.get(entity.id);
    if (
      oldHoverState &&
      oldHoverState.part === part &&
      oldHoverState.color === color
    ) {
      return oldHoverState;
    }
    return {part, color, moveTime: Date.now()};
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
    const outputKey = getOutputKey(entity, oldHoverState.part);
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
          targetEntity && getInputKey(targetEntity, hoverState.part);
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

ComponentEditCallbacks.moduleRenderer = {
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
    let newMap = map;
    const moduleData = entity.state[moduleKey];
    for (const key in moduleData) {
      const value = moduleData[key];
      if (value && value.ref && value.output) {
        if (scene.getEntity(value.ref) && newMap[value.ref] !== null) {
          // touch the source to trigger an update
          newMap = mergeEntityEdits(newMap, {[value.ref]: {}});
        }
      }
    }
    return newMap;
  },
};

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
      const inputKeys = Object.keys(module.getInputs(data));
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

function getInputCount(entity: Entity): number {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      return Object.keys(module.getInputs(entity.state[key])).length;
    }
  }
  return 0;
}

function getOutputCount(entity: Entity): number {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      return Object.keys(module.getOutputs(entity.state[key])).length;
    }
  }
  return 0;
}

function getInputKey(entity: Entity, part: number): ?string {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      const data = entity.state[key];
      const inputs = Object.keys(module.getInputs(data));
      return inputs[part - 1];
    }
  }
}

function getOutputKey(entity: Entity, part: number): ?string {
  for (const key in entity.state) {
    const module = ComponentModules[key];
    if (module) {
      const data = entity.state[key];
      const inputs = Object.keys(module.getInputs(data));
      const outputs = Object.keys(module.getOutputs(data));
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

ComponentBounds.moduleRenderer = {
  addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
    const shapeList = getShapeList(idTree, entity);
    return shapeList ? shapeList.addToBounds(bounds) : 0.0;
  },
};

ComponentGeometry.moduleRenderer = {
  createShapeList: (idTree, entity) => {
    for (const key in entity.state) {
      const module = ComponentModules[key];
      if (!module) {
        continue;
      }
      const data = entity.state[key];
      const inputs = module.getInputs(data);
      const inputCount = Object.keys(inputs).length;
      const outputs = module.getOutputs(data);
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
      for (const output in outputs) {
        const wireColor = WireColorArrays[color];
        color = (color + 1) % WireColorArrays.length;
        shapeList.move(width * 0.5, y, 0).penDown(false, {
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
          const targetInputKeys = Object.keys(
            ComponentModules[targetModuleKey].getInputs(
              targetEntity.state[targetModuleKey],
            ),
          );
          const index = targetInputKeys.indexOf(target.input);
          const inputPosition = vec2(
            width * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
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
      shapeList
        .raise()
        .move(width * -0.5, height * -0.5, 0, MODULE_BODY_ATTRIBUTES)
        .penDown(true)
        .advance(width)
        .pivot(90)
        .advance(height)
        .pivot(90)
        .advance(width)
        .pivot(90)
        .advance(height)
        .penUp();
      shapeList.add(module.getIcon(data));
      return new TransferableValue(shapeList, newEntity => {
        // we can transfer if we have the same module component
        return newEntity.state[key] === data && !connected;
      });
    }
    return new ShapeList();
  },
  getControlPoints: data => [],
  createControlPointEdit: (entity, indexPositions, mirrored) => ({}),
};

const start = vec2();

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
    if (selected) {
      renderWireHelper(
        renderer,
        transform,
        MODULE_THICKNESS + renderer.pixelsToWorldUnits * 3.0,
        SELECT_COLOR,
        start,
        hoverState.dragging,
      );
    }
    renderWireHelper(
      renderer,
      transform,
      MODULE_THICKNESS,
      WireColors[index % WireColors.length],
      start,
      hoverState.dragging,
    );
  }
  geometry.draw(program);
}

const MODULE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float hoverPart;
  uniform float replacePart;
  uniform vec3 replaceColor;
  uniform float replaceAlpha;
  uniform float alpha;
  uniform float outline;
  uniform vec3 outlineColor;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  attribute vec3 pathColor;
  attribute vec3 fillColor;
  attribute float part;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  varying float interpolatedAlpha;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    float replace =
      step(replacePart - 0.5, part) * step(part, replacePart + 0.5);
    vec3 basePathColor = mix(pathColor, replaceColor, replace);
    vec3 baseFillColor = mix(fillColor, replaceColor, replace);
    interpolatedPathColor = mix(basePathColor, outlineColor, outline);
    interpolatedFillColor = mix(baseFillColor, outlineColor, outline);
    interpolatedAlpha = alpha * mix(1.0, replaceAlpha, replace);
    float hovered = step(hoverPart - 0.5, part) * step(part, hoverPart + 0.5);
    float adjustedThickness =
      thickness + (hovered * 2.0 + outline * 3.0) * pixelsToWorldUnits;
    stepSize = pixelsToWorldUnits / adjustedThickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * adjustedThickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const MODULE_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  varying float interpolatedAlpha;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(
      mix(interpolatedFillColor, interpolatedPathColor, filled),
      alpha * interpolatedAlpha
    );
  }
`;
