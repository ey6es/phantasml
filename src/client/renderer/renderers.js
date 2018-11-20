/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import {RendererComponents} from './components';
import type {Renderer} from './util';
import {Geometry} from './util';
import type {Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import type {ShapeList} from '../../server/store/shape';
import {getShapeList} from '../../server/store/geometry';
import {ComponentBounds} from '../../server/store/bounds';
import type {Transform, Bounds} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformMaxScaleMagnitude,
  composeTransforms,
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

/** Type of hover states that alter rendering behavior. */
export type HoverState = boolean | 'erase' | Transform;

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (Object, Entity) => (Renderer, boolean, HoverState) => void,
};

/**
 * Renderer component functions mapped by component name.
 */
export const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      const props = RendererComponents.shapeRenderer.properties;
      const pathColor = data.pathColor || props.pathColor.defaultValue;
      const fillColor = data.fillColor || props.fillColor.defaultValue;
      const shapeList = getShapeList(entity);
      if (!shapeList) {
        return () => {};
      }
      const renderShapeFn = entity.state.shapeList
        ? renderShapeList
        : renderShape;
      if (!shapeList.requiresTessellation()) {
        const geometry: Geometry = (entity.getCachedValue(
          'geometry',
          createGeometry,
          shapeList,
          0,
        ): any);
        return (renderer, selected, hoverState) => {
          const transform: Transform = entity.getLastCachedValue(
            'worldTransform',
          );
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
        const transform: Transform = entity.getLastCachedValue(
          'worldTransform',
        );
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
    },
  },
  textRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      const transform: Transform = entity.getLastCachedValue('worldTransform');
      const geometry = getTextGeometry(entity);
      return (renderer, selected, hoverState) => {
        renderText(renderer, transform, geometry);
      };
    },
  },
  moduleRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      return (renderer, selected, hoverState) => {};
    },
  },
};

ComponentBounds.textRenderer = {
  addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
    const text = entity.state.textRenderer.text || '';
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
    const offsetX = positionX * 0.5;
    bounds.min.x = Math.min(bounds.min.x, (minX - offsetX) * FONT_SCALE);
    bounds.max.x = Math.max(bounds.max.x, (maxX - offsetX) * FONT_SCALE);
    bounds.min.y = Math.min(bounds.min.y, minY * FONT_SCALE);
    bounds.max.y = Math.max(bounds.max.y, maxY * FONT_SCALE);
    return 0.0;
  },
};

ComponentBounds.moduleRenderer = {
  addToBounds: (idTree: IdTreeNode, entity: Entity, bounds: Bounds) => {
    return 0.0;
  },
};

function getTextGeometry(entity: Entity): Geometry {
  return (entity.getCachedValue(
    'textGeometry',
    createTextGeometry,
    entity.state.textRenderer,
  ): any);
}

function createTextGeometry(data: Object): TransferableValue<Geometry> {
  const text = data.text || '';
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
  let positionX = -width * 0.5;
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
    const top = (FontData.common.base - character.yoffset) * FONT_SCALE;
    const bottom =
      (FontData.common.base - character.yoffset - character.height) *
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
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderText,
    renderer.getVertexShader(renderText, TEXT_VERTEX_SHADER),
    renderer.getFragmentShader(renderText, TEXT_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformInt('texture', 0);
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
  varying vec2 interpolatedUv;
  void main(void) {
    gl_FragColor = texture2D(texture, interpolatedUv);
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

function renderShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object') {
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
