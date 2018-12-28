/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import {RendererComponents} from './components';
import {renderPointHelper} from './helpers';
import type {Renderer} from './util';
import {Geometry} from './util';
import type {HoverState} from '../store';
import {store} from '../store';
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
import {ComponentBounds} from '../../server/store/bounds';
import type {Vector2, Transform, Bounds} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformMaxScaleMagnitude,
  getTransformTranslation,
  composeTransforms,
  transformPoint,
  boundsUnionEquals,
  vec2,
  equals,
  plusEquals,
  minus,
  distance,
} from '../../server/store/math';
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
  onPress: (Entity, Vector2) => [HoverState, boolean],
  onDrag: (Entity, Vector2, (string, HoverState) => void) => HoverState,
  onDragOver: (Entity, Entity, Transform) => HoverState,
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
      const baseRenderFn = createShapeListRenderFn(
        entity,
        shapeList,
        entity.state.shapeList ? renderShapeList : renderShape,
        pathColor,
        fillColor,
      );
      return (renderer, selected, hoverState) => {
        baseRenderFn(renderer, selected, hoverState);
        if (!selected) {
          return;
        }
        const state = store.getState();
        if ((state.tempTool || state.tool) !== 'selectPan') {
          return;
        }
        const matrix = getTransformMatrix(
          entity.getLastCachedValue('worldTransform'),
        );
        const thicknessIncrement = renderer.pixelsToWorldUnits * 3;
        for (const key in entity.state) {
          const geometry = ComponentGeometry[key];
          if (geometry) {
            const controlPoints = geometry.getControlPoints(entity.state[key]);
            for (let ii = 0; ii < controlPoints.length; ii++) {
              const controlPoint = controlPoints[ii];
              if (controlPoint.thickness < 0) {
                continue;
              }
              const position = transformPoint(controlPoint.position, matrix);
              let outlineColor = '#ffffff';
              let centerColor = '#222222';
              let centerThickness = thicknessIncrement;
              let outlineThickness = centerThickness + thicknessIncrement;
              if (hoverState && hoverState.point === ii) {
                if (hoverState.dragging) {
                  outlineColor = '#222222';
                  centerColor = '#ffffff';
                }
                outlineThickness += thicknessIncrement;
                centerThickness += thicknessIncrement;
              }
              renderPointHelper(
                renderer,
                {translation: position},
                outlineThickness,
                outlineColor,
                false,
              );
              renderPointHelper(
                renderer,
                {translation: position},
                centerThickness,
                centerColor,
                false,
              );
            }
            break;
          }
        }
      };
    },
    onMove: onShapeMove,
    onFrame: getCurrentHoverState,
    onPress: onShapePress,
    onDrag: onShapeDrag,
    onDragOver: getCurrentHoverState,
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
    onPress: onShapePress,
    onDrag: onShapeDrag,
    onDragOver: getCurrentHoverState,
    onRelease: getCurrentHoverState,
  },
};

function onShapeMove(entity: Entity, position: Vector2): HoverState {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  if (state.selection.has(entity.id)) {
    const oldHoverState = state.hoverStates.get(entity.id);
    for (const key in entity.state) {
      const geometry = ComponentGeometry[key];
      if (geometry) {
        const controlPoints = geometry.getControlPoints(entity.state[key]);
        for (let ii = 0; ii < controlPoints.length; ii++) {
          const controlPoint = controlPoints[ii];
          if (
            distance(controlPoint.position, position) <= controlPoint.thickness
          ) {
            return oldHoverState &&
              oldHoverState.point === ii &&
              !oldHoverState.dragging
              ? oldHoverState
              : {point: ii};
          }
        }
        break;
      }
    }
  }
  const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
  if (collisionGeometry && collisionGeometry.intersectsPoint(position)) {
    return true;
  }
}

function onShapePress(
  entity: Entity,
  position: Vector2,
): [HoverState, boolean] {
  const state = store.getState();
  const oldHoverState = state.hoverStates.get(entity.id);
  if (!oldHoverState) {
    return [oldHoverState, true];
  }
  if (oldHoverState.point !== undefined) {
    return [{dragging: position, point: oldHoverState.point}, true];
  }
  const parentPosition = transformPoint(
    position,
    getTransformMatrix(entity.state.transform),
  );
  const offset = minus(
    getTransformTranslation(entity.state.transform),
    parentPosition,
  );
  return [{dragging: position, offset}, true];
}

function onShapeDrag(entity: Entity, position: Vector2): HoverState {
  const state = store.getState();
  const oldHoverState = state.hoverStates.get(entity.id);
  const resource = state.resource;
  if (!(oldHoverState && oldHoverState.dragging && resource instanceof Scene)) {
    return oldHoverState;
  }
  if (oldHoverState.point !== undefined) {
    for (const key in entity.state) {
      const geometry = ComponentGeometry[key];
      if (geometry) {
        const worldPosition = transformPoint(
          position,
          getTransformMatrix(entity.getLastCachedValue('worldTransform')),
        );
        store.dispatch(
          SceneActions.editEntities.create({
            [entity.id]: geometry.createControlPointEdit(
              entity,
              [[oldHoverState.point, worldPosition]],
              false,
            ),
          }),
        );
        break;
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

/**
 * Creates a function to render a shape list.
 *
 * @param entity the entity owning the list.
 * @param shapeList the shape list.
 * @param renderShapeFn the function to use to render the shape.
 * @param pathColor the path color.
 * @param fillColor the fill color.
 * @return the render function.
 */
export function createShapeListRenderFn(
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
  if (isHoverStateTransform(hoverState)) {
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
  if (isHoverStateTransform(hoverState)) {
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

/**
 * Renders a shape list.
 *
 * @param renderer the renderer to use.
 * @param transform the shape list transform.
 * @param pathColor the path color to use.
 * @param fillColor the fill color to use.
 * @param geometry the shape list geometry.
 * @param selected whether or not the list is selected.
 * @param hoverState the shape list hover state.
 */
export function renderShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (isHoverStateTransform(hoverState)) {
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

function isHoverStateTransform(hoverState: HoverState): boolean {
  return (
    typeof hoverState === 'object' &&
    !(hoverState && (hoverState.dragging || hoverState.point !== undefined))
  );
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
