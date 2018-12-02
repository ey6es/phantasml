/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import * as React from 'react';
import {RendererComponents} from './components';
import type {Renderer} from './util';
import {Geometry} from './util';
import {renderWireHelper, drawWireArrow} from './helpers';
import type {HoverState} from '../store';
import {StoreActions, store} from '../store';
import {ComponentModules} from '../circuit/modules';
import {TOOLTIP_DELAY} from '../util/ui';
import type {Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {Scene, SceneActions} from '../../server/store/scene';
import {Path, Shape, ShapeList} from '../../server/store/shape';
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
  getTransformMaxScaleMagnitude,
  getTransformTranslation,
  composeTransforms,
  simplifyTransform,
  transformPoint,
  transformPointEquals,
  boundsUnionEquals,
  addToBoundsEquals,
  vec2,
  equals,
  minus,
  plusEquals,
} from '../../server/store/math';
import {getColorArray} from '../../server/store/util';
import * as FontData from '../font/Lato-Regular.json';

const FontCharacters: Map<string, Object> = new Map();
let maxCharacterId = 0;
for (const character of FontData.chars) {
  FontCharacters.set(character.char, character);
  maxCharacterId = Math.max(maxCharacterId, character.id);
}
const Kernings: Map<number, number> = new Map();
for (const kerning of FontData.kernings) {
  Kernings.set(getKerningKey(kerning.first, kerning.second), kerning.amount);
}
function getKerningKey(first: number, second: number) {
  return first * (maxCharacterId + 1) + second;
}

const FONT_SCALE = 1.0 / 10.0;

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (
    IdTreeNode,
    Entity,
  ) => (Renderer, boolean, HoverState) => void,
  onMove: (Entity, Vector2) => HoverState,
  onFrame: Entity => HoverState,
  onPress: (Entity, Vector2) => HoverState,
  onRelease: (Entity, Vector2) => HoverState,
};

/**
 * Renderer component functions mapped by component name.
 */
export const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (idTree: IdTreeNode, entity: Entity) => {
      const data = entity.state.shapeRenderer;
      const props = RendererComponents.shapeRenderer.properties;
      const pathColor = data.pathColor || props.pathColor.defaultValue;
      const fillColor = data.fillColor || props.fillColor.defaultValue;
      const shapeList = getShapeList(idTree, entity);
      if (!shapeList) {
        return () => {};
      }
      return createShapeListRenderFn(
        entity,
        shapeList,
        entity.state.shapeList ? renderShapeList : renderShape,
        pathColor,
        fillColor,
      );
    },
    onMove: onShapeMove,
    onFrame: getCurrentHoverState,
    onPress: getCurrentHoverState,
    onRelease: getCurrentHoverState,
  },
  textRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (idTree: IdTreeNode, entity: Entity) => {
      const data = entity.state.textRenderer;
      const transform: Transform = entity.getLastCachedValue('worldTransform');
      const color =
        data.color ||
        RendererComponents.textRenderer.properties.color.defaultValue;
      const geometry = getTextGeometry(entity);
      return (renderer, selected, hoverState) => {
        renderText(renderer, transform, color, geometry, selected, hoverState);
      };
    },
    onMove: onShapeMove,
    onFrame: getCurrentHoverState,
    onPress: getCurrentHoverState,
    onRelease: getCurrentHoverState,
  },
  moduleRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (idTree: IdTreeNode, entity: Entity) => {
      const shapeList = getShapeList(idTree, entity);
      if (!shapeList) {
        return () => {};
      }
      const renderShapeList = createShapeListRenderFn(
        entity,
        shapeList,
        renderModule,
        '#ffffff',
        '#ffffff',
      );
      const transform = entity.getLastCachedValue('worldTransform');
      const inputCount = getInputCount(entity);
      const outputCount = getOutputCount(entity);
      const start = vec2(MODULE_WIDTH * 0.5);
      return (renderer, selected, hoverState) => {
        if (hoverState && hoverState.part && hoverState.dragging) {
          const index = hoverState.part - inputCount - 1;
          start.y =
            ((outputCount - 1) * 0.5 - index) * MODULE_HEIGHT_PER_TERMINAL;
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
        renderShapeList(renderer, selected, hoverState);
      };
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
                let index = oldHoverState.part - 1;
                let label: React.Element<any>;
                const position = vec2();
                if (index < inputKeys.length) {
                  label = inputs[inputKeys[index]].label;
                  vec2(
                    MODULE_WIDTH * -0.5 - MODULE_HEIGHT_PER_TERMINAL * 0.5,
                    ((inputKeys.length - 1) * 0.5 - index + 0.25) *
                      MODULE_HEIGHT_PER_TERMINAL,
                    position,
                  );
                } else {
                  index -= inputKeys.length;
                  label = outputs[outputKeys[index]].label;
                  vec2(
                    MODULE_WIDTH * 0.5 + MODULE_HEIGHT_PER_TERMINAL * 0.5,
                    ((outputKeys.length - 1) * 0.5 - index + 0.25) *
                      MODULE_HEIGHT_PER_TERMINAL,
                    position,
                  );
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
        return {dragging: position, offset, part};
      } else if (oldHoverState) {
        return {dragging: position, offset};
      }
      return oldHoverState;
    },
    onRelease: (entity, position) => onModuleMove(entity, position, true),
  },
};

function onModuleMove(
  entity: Entity,
  position: Vector2,
  release: boolean = false,
): HoverState {
  const state = store.getState();
  const oldHoverState = state.hoverStates.get(entity.id);
  if (oldHoverState && oldHoverState.dragging && !release) {
    if (!oldHoverState.part) {
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
  }
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
  if (part === 0) {
    return true;
  }
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

function onShapeMove(entity: Entity, position: Vector2): HoverState {
  const resource = store.getState().resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
  if (collisionGeometry && collisionGeometry.intersectsPoint(position)) {
    return true;
  }
}

function getCurrentHoverState(entity: Entity): HoverState {
  return store.getState().hoverStates.get(entity.id);
}

type RenderShapeFn = (
  Renderer,
  Transform,
  string,
  string,
  Geometry,
  boolean,
  HoverState,
) => void;

function createShapeListRenderFn(
  entity: Entity,
  shapeList: ShapeList,
  renderShapeFn: RenderShapeFn,
  pathColor: string,
  fillColor: string,
): (Renderer, boolean, HoverState) => void {
  if (!shapeList.requiresTessellation()) {
    const geometry: Geometry = (entity.getCachedValue(
      'geometry',
      createGeometry,
      shapeList,
      0,
    ): any);
    return (renderer, selected, hoverState) => {
      const transform: Transform = entity.getLastCachedValue('worldTransform');
      renderShapeFn(
        renderer,
        transform,
        pathColor,
        fillColor,
        geometry,
        selected,
        hoverState,
      );
    };
  }
  return (renderer, selected, hoverState) => {
    const transform: Transform = entity.getLastCachedValue('worldTransform');
    const magnitude = getTransformMaxScaleMagnitude(transform);
    const world = renderer.pixelsToWorldUnits / renderer.levelOfDetail;
    const tessellation = magnitude / world;
    const exponent =
      tessellation === 0.0
        ? 0.0
        : Math.round(Math.log(tessellation) / Math.LN2);
    const geometry: Geometry = (entity.getCachedValue(
      exponent,
      createGeometry,
      shapeList,
      exponent,
    ): any);
    renderShapeFn(
      renderer,
      transform,
      pathColor,
      fillColor,
      geometry,
      selected,
      hoverState,
    );
  };
}

const MODULE_WIDTH = 4.0;
const MODULE_THICKNESS = 0.2;
const TERMINAL_WIDTH = 1.5;
const MODULE_HEIGHT_PER_TERMINAL = 2.0;
const MODULE_BODY_ATTRIBUTES = {
  thickness: 0.2,
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
    if (!shapeList) {
      return 0.0;
    }
    // TODO: add wire control points to bounds
    return shapeList.addToBounds(bounds);
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
      const icon = module.getIcon(data);
      const inputs = module.getInputs(data);
      const inputCount = Object.keys(inputs).length;
      const outputs = module.getOutputs(data);
      const outputCount = Object.keys(outputs).length;
      const height =
        MODULE_HEIGHT_PER_TERMINAL * Math.max(inputCount, outputCount);
      const shapeList = new ShapeList().lower();
      shapeList.omitCollisionAttributes.add('pathColor');
      shapeList.omitCollisionAttributes.add('fillColor');
      let y = (inputCount - 1) * MODULE_HEIGHT_PER_TERMINAL * 0.5;
      let part = 1;
      for (const input in inputs) {
        shapeList
          .move(MODULE_WIDTH * -0.5, y, 180)
          .penDown(false, {
            thickness: 0.2,
            pathColor: [1.0, 1.0, 1.0],
            fillColor: [1.0, 1.0, 1.0],
            part,
          })
          .advance(1)
          .penUp()
          .penDown(false, {thickness: 0.5})
          .penUp();
        y -= MODULE_HEIGHT_PER_TERMINAL;
        part++;
      }
      y = (outputCount - 1) * MODULE_HEIGHT_PER_TERMINAL * 0.5;
      let color = 0;
      for (const output in outputs) {
        const wireColor = WireColorArrays[color];
        color = (color + 1) % WireColorArrays.length;
        shapeList
          .move(MODULE_WIDTH * 0.5, y, 0)
          .penDown(false, {
            thickness: 0.2,
            pathColor: wireColor,
            fillColor: wireColor,
            part,
          })
          .advance(0.7)
          .penUp();
        drawWireArrow(shapeList);
        y -= MODULE_HEIGHT_PER_TERMINAL;
        part++;
      }
      shapeList
        .raise()
        .move(MODULE_WIDTH * -0.5, height * -0.5, 0, MODULE_BODY_ATTRIBUTES)
        .penDown(true)
        .advance(MODULE_WIDTH)
        .pivot(90)
        .advance(height)
        .pivot(90)
        .advance(MODULE_WIDTH)
        .pivot(90)
        .advance(height)
        .penUp();
      shapeList.add(module.getIcon(data));
      return new TransferableValue(shapeList, newEntity => {
        // we can transfer if we have the same module component
        return newEntity.state[key] === data;
      });
    }
    return new ShapeList();
  },
  getControlPoints: data => [],
  createControlPointEdit: (entity, indexPositions, mirrored) => ({}),
};

ComponentBounds.textRenderer = {
  addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
    boundsUnionEquals(bounds, getTextBounds(entity.state.textRenderer));
    return 0.0;
  },
};

ComponentGeometry.textRenderer = {
  createShapeList: (idTree, entity) => {
    const data = entity.state.textRenderer;
    const bounds = getTextBounds(data);
    const path = new Path()
      .moveTo(bounds.min)
      .lineTo(vec2(bounds.max.x, bounds.min.y))
      .lineTo(bounds.max)
      .lineTo(vec2(bounds.min.x, bounds.max.y))
      .lineTo(bounds.min);
    return new ShapeList([new Shape(path)]);
  },
  getControlPoints: data => [],
  createControlPointEdit: (entity, indexPositions, mirrored) => ({}),
};

function getTextBounds(data: Object): Bounds {
  const text = data.text || '';
  const hAlign = data.hAlign || 'center';
  const vAlign = data.vAlign || 'baseline';
  let positionX = 0.0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let lastCharacterId: ?number;
  for (let ii = 0; ii < text.length; ii++) {
    const character = FontCharacters.get(text.charAt(ii));
    if (!character) {
      continue;
    }
    if (lastCharacterId != null) {
      const kerning = Kernings.get(
        getKerningKey(lastCharacterId, character.id),
      );
      if (kerning) {
        positionX += kerning;
      }
    }
    lastCharacterId = character.id;
    minX = Math.min(minX, positionX + character.xoffset);
    maxX = Math.max(maxX, positionX + character.xoffset + character.width);
    minY = Math.min(
      minY,
      FontData.common.base - character.yoffset - character.height,
    );
    maxY = Math.max(maxY, FontData.common.base - character.yoffset);
    positionX += character.xadvance;
  }
  let offsetX = 0.0;
  if (hAlign === 'center') {
    offsetX = -positionX * 0.5;
  } else if (hAlign === 'right') {
    offsetX = -positionX;
  }
  let offsetY = 0.0;
  if (vAlign === 'top') {
    offsetY = -FontData.common.base;
  } else if (vAlign === 'middle') {
    offsetY = FontData.common.lineHeight * 0.5 - FontData.common.base;
  } else if (vAlign === 'bottom') {
    offsetY = FontData.common.lineHeight - FontData.common.base;
  }
  return {
    min: vec2((minX + offsetX) * FONT_SCALE, (minY + offsetY) * FONT_SCALE),
    max: vec2((maxX + offsetX) * FONT_SCALE, (maxY + offsetY) * FONT_SCALE),
  };
}

function getTextGeometry(entity: Entity): Geometry {
  return (entity.getCachedValue(
    'textGeometry',
    createTextGeometry,
    entity.state.textRenderer,
  ): any);
}

function createTextGeometry(data: Object): TransferableValue<Geometry> {
  const text = data.text || '';
  const hAlign = data.hAlign || 'center';
  const vAlign = data.vAlign || 'baseline';
  let renderedChars = 0;
  let width = 0;
  for (let ii = 0; ii < text.length; ii++) {
    const character = FontCharacters.get(text.charAt(ii));
    if (character) {
      renderedChars++;
      width += character.xadvance;
    }
  }
  const arrayBuffer = new Float32Array(4 * 4 * renderedChars);
  const elementArrayBuffer = new Uint32Array(2 * 3 * renderedChars);
  let arrayIndex = 0;
  let elementArrayIndex = 0;
  let elementIndex = 0;
  const scaleS = 1.0 / FontData.common.scaleW;
  const scaleT = 1.0 / FontData.common.scaleH;
  let positionX = 0.0;
  if (hAlign === 'center') {
    positionX = -width * 0.5;
  } else if (hAlign === 'right') {
    positionX = -width;
  }
  let offsetY = 0.0;
  if (vAlign === 'top') {
    offsetY = -FontData.common.base;
  } else if (vAlign === 'middle') {
    offsetY = FontData.common.lineHeight * 0.5 - FontData.common.base;
  } else if (vAlign === 'bottom') {
    offsetY = FontData.common.lineHeight - FontData.common.base;
  }
  let lastCharacterId: ?number;
  for (let ii = 0; ii < text.length; ii++) {
    const character = FontCharacters.get(text.charAt(ii));
    if (!character) {
      continue;
    }
    elementArrayBuffer[elementArrayIndex++] = elementIndex;
    elementArrayBuffer[elementArrayIndex++] = elementIndex + 1;
    elementArrayBuffer[elementArrayIndex++] = elementIndex + 2;

    elementArrayBuffer[elementArrayIndex++] = elementIndex;
    elementArrayBuffer[elementArrayIndex++] = elementIndex + 2;
    elementArrayBuffer[elementArrayIndex++] = elementIndex + 3;
    elementIndex += 4;

    if (lastCharacterId != null) {
      const kerning = Kernings.get(
        getKerningKey(lastCharacterId, character.id),
      );
      if (kerning) {
        positionX += kerning;
      }
    }
    lastCharacterId = character.id;

    const left = (positionX + character.xoffset) * FONT_SCALE;
    const right =
      (positionX + character.xoffset + character.width) * FONT_SCALE;
    const top =
      (FontData.common.base - character.yoffset + offsetY) * FONT_SCALE;
    const bottom =
      (FontData.common.base - character.yoffset - character.height + offsetY) *
      FONT_SCALE;
    const uvLeft = character.x * scaleS;
    const uvRight = (character.x + character.width) * scaleS;
    const uvTop = character.y * scaleT;
    const uvBottom = (character.y + character.height) * scaleT;
    arrayBuffer[arrayIndex++] = left;
    arrayBuffer[arrayIndex++] = bottom;
    arrayBuffer[arrayIndex++] = uvLeft;
    arrayBuffer[arrayIndex++] = uvBottom;

    arrayBuffer[arrayIndex++] = right;
    arrayBuffer[arrayIndex++] = bottom;
    arrayBuffer[arrayIndex++] = uvRight;
    arrayBuffer[arrayIndex++] = uvBottom;

    arrayBuffer[arrayIndex++] = right;
    arrayBuffer[arrayIndex++] = top;
    arrayBuffer[arrayIndex++] = uvRight;
    arrayBuffer[arrayIndex++] = uvTop;

    arrayBuffer[arrayIndex++] = left;
    arrayBuffer[arrayIndex++] = top;
    arrayBuffer[arrayIndex++] = uvLeft;
    arrayBuffer[arrayIndex++] = uvTop;

    positionX += character.xadvance;
  }
  return new TransferableValue(
    new Geometry(arrayBuffer, elementArrayBuffer, {vertex: 2, uv: 2}),
    newEntity => {
      return newEntity.state.textRenderer === data;
    },
  );
}

function renderText(
  renderer: Renderer,
  transform: Transform,
  color: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object') {
    renderTranslucentText(
      renderer,
      composeTransforms(hoverState, transform),
      color,
      geometry,
    );
    return;
  }
  if (selected || hoverState) {
    renderTextBackdrop(renderer, transform, geometry, selected, hoverState);
  }
  const program = renderer.getProgram(
    renderText,
    renderer.getVertexShader(renderText, TEXT_VERTEX_SHADER),
    renderer.getFragmentShader(renderText, TEXT_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformInt('texture', 0);
  program.setUniformFloat('stepSize', renderer.pixelsToWorldUnits);
  program.setUniformColor('color', color);
  renderer.setEnabled(renderer.gl.BLEND, true);
  renderer.bindTexture(renderer.fontTexture);
  geometry.draw(program);
  renderer.bindTexture(null);
}

const TEXT_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat3 viewProjectionMatrix;
  attribute vec2 vertex;
  attribute vec2 uv;
  varying vec2 interpolatedUv;
  void main(void) {
    interpolatedUv = uv;
    vec3 position = viewProjectionMatrix * (modelMatrix * vec3(vertex, 1.0));
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const TEXT_FRAGMENT_SHADER = `
  precision mediump float; 
  uniform sampler2D texture;
  uniform float stepSize;
  uniform vec3 color;
  varying vec2 interpolatedUv;
  void main(void) {
    vec4 dists = texture2D(texture, interpolatedUv);
    float dist = max(
      min(max(dists.r, dists.g), dists.b),
      min(max(dists.b, dists.g), dists.r)
    );
    float alpha = smoothstep(0.5 - stepSize, 0.5 + stepSize, dist);
    gl_FragColor = vec4(color, alpha);
  }
`;

function renderTranslucentText(
  renderer: Renderer,
  transform: Transform,
  color: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderTranslucentText,
    renderer.getVertexShader(renderTranslucentText, TEXT_VERTEX_SHADER),
    renderer.getFragmentShader(
      renderTranslucentText,
      TRANSLUCENT_TEXT_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformInt('texture', 0);
  program.setUniformFloat('stepSize', renderer.pixelsToWorldUnits);
  program.setUniformColor('color', color);
  renderer.setEnabled(renderer.gl.BLEND, true);
  renderer.bindTexture(renderer.fontTexture);
  geometry.draw(program);
  renderer.bindTexture(null);
}

export const TRANSLUCENT_TEXT_FRAGMENT_SHADER = `
  precision mediump float; 
  uniform sampler2D texture;
  uniform float stepSize;
  uniform vec3 color;
  varying vec2 interpolatedUv;
  void main(void) {
    vec4 dists = texture2D(texture, interpolatedUv);
    float dist = max(
      min(max(dists.r, dists.g), dists.b),
      min(max(dists.b, dists.g), dists.r)
    );
    float alpha = smoothstep(0.5 - stepSize, 0.5 + stepSize, dist);
    gl_FragColor = vec4(color, alpha * 0.25);
  }
`;

function renderTextBackdrop(
  renderer: Renderer,
  transform: Transform,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  const program = renderer.getProgram(
    renderTextBackdrop,
    renderer.getVertexShader(renderTextBackdrop, TEXT_VERTEX_SHADER),
    renderer.getFragmentShader(
      renderTextBackdrop,
      TEXT_BACKDROP_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformInt('texture', 0);
  program.setUniformFloat('stepSize', renderer.pixelsToWorldUnits);
  program.setUniformColor(
    'color',
    hoverState === 'erase' ? ERASE_COLOR : SELECT_COLOR,
  );
  program.setUniformFloat('alpha', selected ? 1.0 : 0.25);
  renderer.setEnabled(renderer.gl.BLEND, true);
  renderer.bindTexture(renderer.fontTexture);
  geometry.draw(program);
  renderer.bindTexture(null);
}

export const TEXT_BACKDROP_FRAGMENT_SHADER = `
  precision mediump float; 
  uniform sampler2D texture;
  uniform float stepSize;
  uniform vec3 color;
  uniform float alpha;
  varying vec2 interpolatedUv;
  void main(void) {
    vec4 dists = texture2D(texture, interpolatedUv);
    float dist = max(
      min(max(dists.r, dists.g), dists.b),
      min(max(dists.b, dists.g), dists.r)
    );
    float baseAlpha = smoothstep(
      0.5 - stepSize * 8.0,
      0.5 - stepSize * 6.0, dist
    );
    gl_FragColor = vec4(color, baseAlpha * alpha);
  }
`;

function createGeometry(
  shapeList: ShapeList,
  exponent: number,
): TransferableValue<Geometry> {
  return new TransferableValue(
    new Geometry(...shapeList.createGeometry(2 ** exponent)),
    newEntity => {
      return newEntity.getLastCachedValue('shapeList') === shapeList;
    },
  );
}

function renderShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object') {
    renderTranslucentShape(
      renderer,
      composeTransforms(hoverState, transform),
      pathColor,
      fillColor,
      geometry,
    );
    return;
  }
  if (selected || hoverState) {
    renderBackdrop(renderer, transform, geometry, selected, hoverState);
  }
  const program = renderer.getProgram(
    renderShape,
    renderer.getVertexShader(renderShape, SHAPE_VERTEX_SHADER),
    renderer.getFragmentShader(renderShape, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const SHAPE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Fragment shader used for general shapes.
 */
export const SHAPE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 pathColor;
  uniform vec3 fillColor;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(mix(fillColor, pathColor, filled), alpha);
  }
`;

function renderTranslucentShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderTranslucentShape,
    renderer.getVertexShader(renderTranslucentShape, SHAPE_VERTEX_SHADER),
    renderer.getFragmentShader(
      renderTranslucentShape,
      TRANSLUCENT_SHAPE_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

export const TRANSLUCENT_SHAPE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 pathColor;
  uniform vec3 fillColor;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(mix(fillColor, pathColor, filled), alpha * 0.25);
  }
`;

function renderModule(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
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
  program.setUniformFloat(
    'omitPart',
    hoverState.dragging ? hoverState.part : -1.0,
  );
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
  geometry.draw(program);
}

const MODULE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float hoverPart;
  uniform float omitPart;
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
    interpolatedPathColor = mix(pathColor, outlineColor, outline);
    interpolatedFillColor = mix(fillColor, outlineColor, outline);
    float omit = step(omitPart - 0.5, part) * step(part, omitPart + 0.5);
    interpolatedAlpha = alpha * (1.0 - omit);
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

function renderShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object' && !(hoverState && hoverState.dragging)) {
    renderTranslucentShapeList(
      renderer,
      composeTransforms(hoverState, transform),
      pathColor,
      fillColor,
      geometry,
    );
    return;
  }
  if (selected || hoverState) {
    renderBackdrop(renderer, transform, geometry, selected, hoverState);
  }
  const program = renderer.getProgram(
    renderShapeList,
    renderer.getVertexShader(renderShapeList, SHAPE_LIST_VERTEX_SHADER),
    renderer.getFragmentShader(renderShapeList, SHAPE_LIST_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColorScale', pathColor);
  program.setUniformColor('fillColorScale', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const SHAPE_LIST_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform vec3 pathColorScale;
  uniform vec3 fillColorScale;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  attribute vec3 pathColor;
  attribute vec3 fillColor;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    interpolatedPathColor = pathColor * pathColorScale;
    interpolatedFillColor = fillColor * fillColorScale;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SHAPE_LIST_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(
      mix(interpolatedFillColor, interpolatedPathColor, filled),
      alpha
    );
  }
`;

function renderTranslucentShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderTranslucentShapeList,
    renderer.getVertexShader(
      renderTranslucentShapeList,
      SHAPE_LIST_VERTEX_SHADER,
    ),
    renderer.getFragmentShader(
      renderTranslucentShapeList,
      TRANSLUCENT_SHAPE_LIST_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColorScale', pathColor);
  program.setUniformColor('fillColorScale', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

export const TRANSLUCENT_SHAPE_LIST_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(
      mix(interpolatedFillColor, interpolatedPathColor, filled),
      alpha * 0.25
    );
  }
`;

/** The color used to indicate general hovering/selection. */
export const SELECT_COLOR = '#00bc8c';

/** The color used to indicate erasing. */
export const ERASE_COLOR = '#e74c3c';

function renderBackdrop(
  renderer: Renderer,
  transform: Transform,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  const program = renderer.getProgram(
    renderBackdrop,
    renderer.getVertexShader(renderBackdrop, BACKDROP_VERTEX_SHADER),
    renderer.getFragmentShader(renderBackdrop, BACKDROP_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor(
    'color',
    hoverState === 'erase' ? ERASE_COLOR : SELECT_COLOR,
  );
  program.setUniformFloat('alpha', selected ? 1.0 : 0.25);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const BACKDROP_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float expansion;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    float expandedThickness = thickness + pixelsToWorldUnits * 3.0;
    stepSize = pixelsToWorldUnits / expandedThickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * expandedThickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BACKDROP_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 color;
  uniform float alpha;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float baseAlpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(color, baseAlpha * alpha);
  }
`;
