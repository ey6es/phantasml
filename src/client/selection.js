/**
 * Components related to selection operations.
 *
 * @module client/selection
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {DropdownItem} from 'reactstrap';
import {StoreActions, store, createPasteAction} from './store';
import {canCopyOrDelete} from './edit';
import {createEntity} from './entity';
import {Menu, Submenu, MenuItem, Shortcut} from './util/ui';
import {GeometryComponents} from './geometry/components';
import {PathColorProperty, FillColorProperty} from './renderer/components';
import type {Vector2, Transform} from '../server/store/math';
import {
  ZERO_VECTOR,
  getTransformTranslation,
  composeTransforms,
  getTransformMatrix,
  vec2,
  equals,
  plus,
  plusEquals,
  minus,
  minusEquals,
  timesEquals,
  negative,
  distance,
  cross,
  dot,
  normalizeEquals,
  orthonormalizeEquals,
  transformPointEquals,
  rotateEquals,
  roundToPrecision,
  clamp,
} from '../server/store/math';
import {ShapeList} from '../server/store/shape';
import type {ControlPoint} from '../server/store/geometry';
import {
  DEFAULT_THICKNESS,
  ComponentGeometry,
  parsePath,
  parseShapeList,
} from '../server/store/geometry';
import type {Entity} from '../server/store/resource';
import {TransferableValue} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';
import {getValue, getColorArray} from '../server/store/util';

/**
 * The selection menu dropdown.
 */
export class SelectionDropdown extends React.Component<{locale: string}, {}> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="selection.title" defaultMessage="Selection" />
        }>
        <Submenu
          label={
            <FormattedMessage
              id="selection.transform"
              defaultMessage="Transform"
            />
          }>
          <FlipHorizontalItem />
          <FlipVerticalItem />
        </Submenu>
        <ToPathItem locale={this.props.locale} />
        <ToShapeItem locale={this.props.locale} />
        <ToShapeListItem locale={this.props.locale} />
        <ToPartsItem locale={this.props.locale} />
        <DropdownItem divider />
        <DuplicateItem />
      </Menu>
    );
  }
}

const FlipHorizontalItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => mirrorSelection(-1, 1)}>
    <FormattedMessage
      id="transform.flip_horizontal"
      defaultMessage="Flip Horizontal"
    />
  </MenuItem>
));

const FlipVerticalItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => mirrorSelection(1, -1)}>
    <FormattedMessage
      id="transform.flip_vertical"
      defaultMessage="Flip Vertical"
    />
  </MenuItem>
));

function mirrorSelection(sx: number, sy: number) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const center = vec2();
  let translationCount = 0;
  for (const id of state.selection) {
    // if we have children and their parents, we only want the parents
    if (resource.isAncestorInSet(id, state.selection)) {
      continue;
    }
    plusEquals(center, getTransformTranslation(resource.getWorldTransform(id)));
    translationCount++;
  }
  timesEquals(center, 1.0 / translationCount);

  const mirrorTransform = composeTransforms(
    {translation: center},
    composeTransforms({scale: vec2(sx, sy)}, {translation: negative(center)}),
  );

  const map = {};
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    const matrix = getTransformMatrix(
      composeTransforms(
        mirrorTransform,
        entity.getLastCachedValue('worldTransform'),
      ),
    );
    for (const key in entity.state) {
      const geometry = ComponentGeometry[key];
      if (geometry) {
        const controlPoints = geometry.getControlPoints(entity.state[key]);
        const indexPositions: [number, Vector2][] = [];
        for (let ii = 0; ii < controlPoints.length; ii++) {
          indexPositions.push([
            ii,
            transformPointEquals(controlPoints[ii].position, matrix),
          ]);
        }
        map[id] = geometry.createControlPointEdit(entity, indexPositions, true);
        break;
      }
    }
  }
  store.dispatch(SceneActions.editEntities.create(map));
}

const ToPathItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    shortcut={new Shortcut('T', Shortcut.CTRL)}
    onClick={() => convertToShapeOrPath(props.locale, false)}>
    <FormattedMessage id="selection.to_path" defaultMessage="To Path" />
  </MenuItem>
));

const ToShapeItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    shortcut={new Shortcut('H', Shortcut.CTRL)}
    onClick={() => convertToShapeOrPath(props.locale, true)}>
    <FormattedMessage id="selection.to_shape" defaultMessage="To Shape" />
  </MenuItem>
));

type PathElement = {
  type: string,
  data: Object,
  controlPoints: Vector2[],
  endpoints: Vector2[],
  closestElements: PathElementIndex[],
};

type PathElementIndex = [PathElement, number];

type Path = {
  firstIndex: number,
  elements: PathElement[],
  signedArea: number,
  centroid: Vector2,
};

function convertToShapeOrPath(locale: string, shape: boolean) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const geometryKey = shape ? 'shape' : 'path';
  const geometryValue: Object = {order: 1};
  if (shape) {
    geometryValue.fill = true;
  }
  const entityState = {
    [geometryKey]: geometryValue,
    shapeRenderer: {order: 2},
    shapeCollider: {order: 3},
    rigidBody: {order: 4},
  };
  const elements: PathElement[] = [];
  const map = {};
  let totalThickness = 0.0;
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    for (const key in entity.state) {
      const data = entity.state[key];
      const geometry = ComponentGeometry[key];
      if (
        !(
          geometry &&
          (key === 'line' ||
            (key === 'lineGroup' && data.loop !== true) ||
            key === 'arc' ||
            key === 'curve' ||
            key === 'path')
        )
      ) {
        if (
          key === 'shapeRenderer' ||
          key === 'shapeCollider' ||
          key === 'rigidBody'
        ) {
          entityState[key] = Object.assign({}, data, entityState[key]);
        }
        continue;
      }
      const matrix = getTransformMatrix(resource.getWorldTransform(id));
      const controlPoints = geometry
        .getControlPoints(data)
        .map(point => transformPointEquals(point.position, matrix));
      elements.push({
        type: key,
        data,
        controlPoints,
        endpoints: [
          controlPoints[key === 'arc' ? 1 : 0],
          controlPoints[controlPoints.length - 1],
        ],
        closestElements: [],
      });
      totalThickness += getValue(data.thickness, DEFAULT_THICKNESS);
      map[id] = null;
      break;
    }
  }
  if (elements.length === 0) {
    return;
  }
  geometryValue.thickness = totalThickness / elements.length;
  store.dispatch(SceneActions.editEntities.create(map));
  let farthestDistance = 0.0;
  let farthestElement = [elements[0], 0];
  for (const element of elements) {
    const closestDistances = [Infinity, Infinity];
    for (const otherElement of elements) {
      if (otherElement === element) {
        continue;
      }
      for (let ii = 0; ii < 2; ii++) {
        for (let jj = 0; jj < 2; jj++) {
          const dist = distance(
            element.endpoints[ii],
            otherElement.endpoints[jj],
          );
          if (dist < closestDistances[ii]) {
            closestDistances[ii] = dist;
            element.closestElements[ii] = [otherElement, jj];
          }
        }
      }
    }
    for (let ii = 0; ii < 2; ii++) {
      if (closestDistances[ii] > farthestDistance) {
        farthestDistance = closestDistances[ii];
        farthestElement = [element, ii];
      }
    }
  }
  // divide elements up into contiguous paths
  let currentPath: Path = {
    firstIndex: 0,
    elements: [],
    signedArea: 0.0,
    centroid: vec2(),
  };
  const paths: Path[] = [];
  let currentElement = farthestElement;
  while (elements.length > 0) {
    const [element, index] = currentElement;
    elements.splice(elements.indexOf(element), 1);
    if (currentPath.elements.length === 0) {
      currentPath.firstIndex = index;
      paths.push(currentPath);
    }
    currentPath.elements.push(element);
    const otherIndex = 1 - index;
    const from = element.endpoints[index];
    const to = element.endpoints[otherIndex];
    currentElement = element.closestElements[otherIndex];

    // "weld" endpoints together to their midpoints
    if (shape || elements.length > 0) {
      const [nextElement, nextIndex] = currentElement;
      const nextFrom = nextElement.endpoints[nextIndex];
      equals(timesEquals(plusEquals(to, nextFrom), 0.5), nextFrom);
    }

    if (shape) {
      const cp = cross(from, to);
      currentPath.signedArea += cp;
      currentPath.centroid.x += cp * (from.x + to.x);
      currentPath.centroid.y += cp * (from.y + to.y);
    } else {
      currentPath.elements.length === 1 &&
        plusEquals(currentPath.centroid, from);
      plusEquals(currentPath.centroid, to);
    }

    // if we wrap around, open a new path
    if (currentElement[0] === currentPath.elements[0]) {
      currentPath = {
        firstIndex: 0,
        elements: [],
        signedArea: 0.0,
        centroid: vec2(),
      };
      currentElement = [elements[0], 0];
    }
  }
  let largestArea = 0.0;
  let largestIndex = 0;
  for (let ii = 0; ii < paths.length; ii++) {
    const path = paths[ii];
    timesEquals(
      path.centroid,
      1.0 / (shape ? 3.0 * path.signedArea : path.elements.length + 1),
    );
    const area = Math.abs(path.signedArea);
    if (area > largestArea) {
      largestArea = area;
      largestIndex = ii;
    }
  }
  // biggest path goes first, then holes
  if (largestIndex !== 0) {
    const tmp = paths[largestIndex];
    paths[largestIndex] = paths[0];
    paths[0] = tmp;
  }
  const centroid = paths[0].centroid;
  const parts: string[] = [];
  for (let ii = 0; ii < paths.length; ii++) {
    const path = paths[ii];
    const reversed =
      shape && (ii === 0 ? path.signedArea < 0.0 : path.signedArea > 0.0);
    currentElement = [
      path.elements[0],
      reversed ? 1 - path.firstIndex : path.firstIndex,
    ];
    let part = '';
    let lastPosition = vec2();
    for (let jj = 0; jj < path.elements.length; jj++) {
      const [element, index] = currentElement;
      const otherIndex = 1 - index;
      let firstPoint = element.controlPoints[element.type === 'arc' ? 1 : 0];
      let lastPoint = element.controlPoints[element.controlPoints.length - 1];
      if (index === 1) {
        const tmp = firstPoint;
        firstPoint = lastPoint;
        lastPoint = tmp;
      }
      if (part.length === 0) {
        part = 'M ' + positionToString(firstPoint, centroid);
      }
      lastPosition = lastPoint;
      switch (element.type) {
        case 'line':
          part += ' L ' + positionToString(lastPoint, centroid);
          break;

        case 'lineGroup':
          if (index === 0) {
            for (let ii = 1; ii < element.controlPoints.length; ii++) {
              part +=
                ' L ' + positionToString(element.controlPoints[ii], centroid);
            }
          } else {
            for (let ii = element.controlPoints.length - 2; ii >= 0; ii--) {
              part +=
                ' L ' + positionToString(element.controlPoints[ii], centroid);
            }
          }
          break;

        case 'arc':
          const center = element.controlPoints[0];
          const midpoint = element.controlPoints[2];
          const cp = cross(
            minus(midpoint, firstPoint),
            minus(lastPosition, firstPoint),
          );
          const radius =
            (cp < 0.0 ? -0.5 : 0.5) *
            (distance(center, lastPosition) + distance(center, firstPoint));
          const roundedRadius = ' ' + roundToPrecision(radius, 6);
          const dp = dot(
            normalizeEquals(minus(firstPoint, center)),
            normalizeEquals(minus(midpoint, center)),
          );
          const angle = 2.0 * Math.acos(dp);
          if (angle > Math.PI) {
            // break large angles into two parts
            part += ' A ' + positionToString(midpoint, centroid);
            part += roundedRadius;
          }
          part += ' A ' + positionToString(lastPoint, centroid);
          part += roundedRadius;
          break;

        case 'curve':
          part += ' C ' + positionToString(lastPoint, centroid);
          if (index === 0) {
            part +=
              ' ' +
              positionToString(element.controlPoints[1], centroid) +
              ' ' +
              positionToString(element.controlPoints[2], centroid);
          } else {
            part +=
              ' ' +
              positionToString(element.controlPoints[2], centroid) +
              ' ' +
              positionToString(element.controlPoints[1], centroid);
          }
          break;

        case 'path':
          let jj = 1;
          let increment = 1;
          if (index === 1) {
            jj = element.controlPoints.length - 2;
            increment = element.controlPoints.length - 1;
          }
          const reverseIncrement = element.controlPoints.length - increment;
          parsePath(
            element.data.path || '',
            {
              moveTo: position => {},
              lineTo: position => {
                part +=
                  ' L ' + positionToString(element.controlPoints[jj], centroid);
                jj = (jj + increment) % element.controlPoints.length;
              },
              arcTo: (position, radius) => {
                const start =
                  element.controlPoints[
                    (jj + reverseIncrement) % element.controlPoints.length
                  ];
                const mid = element.controlPoints[jj];
                jj = (jj + increment) % element.controlPoints.length;
                const end = element.controlPoints[jj];
                jj = (jj + increment) % element.controlPoints.length;

                const height = 0.5 * distance(start, end);
                const vector = orthonormalizeEquals(minus(end, start));
                const midpoint = minusEquals(
                  timesEquals(plus(start, end), 0.5),
                  mid,
                );
                const dist = clamp(dot(vector, midpoint), -height, height);
                if (dist !== 0.0) {
                  radius = (height * height + dist * dist) / (2.0 * dist);
                }

                part +=
                  ' A ' +
                  positionToString(end, centroid) +
                  ' ' +
                  roundToPrecision(radius, 6);
              },
              curveTo: () => {
                const c1 = element.controlPoints[jj];
                jj = (jj + increment) % element.controlPoints.length;
                const c2 = element.controlPoints[jj];
                jj = (jj + increment) % element.controlPoints.length;
                const end = element.controlPoints[jj];
                jj = (jj + increment) % element.controlPoints.length;

                part +=
                  ' C ' +
                  positionToString(end, centroid) +
                  ' ' +
                  positionToString(c1, centroid) +
                  ' ' +
                  positionToString(c2, centroid);
              },
            },
            index === 1,
          );
          break;
      }
      currentElement = element.closestElements[otherIndex];
    }
    parts.push(part);
  }
  geometryValue[shape ? 'exterior' : 'path'] = parts[0];
  if (shape && parts.length > 1) {
    geometryValue.holes = parts.slice(1);
  }
  createEntity(GeometryComponents[geometryKey].label, locale, entityState, {
    translation: centroid,
  });
}

const ToShapeListItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    shortcut={new Shortcut('L', Shortcut.CTRL)}
    onClick={() => convertToShapeList(props.locale)}>
    <FormattedMessage id="selection.to_shape_list" defaultMessage="To List" />
  </MenuItem>
));

type ShapeListElement = {
  type: string,
  entity: Entity,
  renderer: Object,
  transform: Transform,
};

function convertToShapeList(locale: string) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const entityState = {
    shapeList: {list: '', order: 1},
    shapeRenderer: {fillColor: '#ffffff', order: 2},
    shapeCollider: {order: 3},
    rigidBody: {order: 4},
  };
  const centroid = vec2();
  const elements: ShapeListElement[] = [];
  const map = {};
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    for (const key in entity.state) {
      const data = entity.state[key];
      const geometry = ComponentGeometry[key];
      if (!geometry) {
        if (key === 'shapeCollider' || key === 'rigidBody') {
          entityState[key] = Object.assign({}, data, entityState[key]);
        }
        continue;
      }
      const renderer = entity.state.shapeRenderer;
      if (!renderer) {
        break;
      }
      const transform = resource.getWorldTransform(id);
      plusEquals(centroid, getTransformTranslation(transform));
      elements.push({
        type: key,
        entity,
        renderer,
        transform,
      });
      map[id] = null;
      break;
    }
  }
  if (elements.length === 0) {
    return;
  }
  store.dispatch(SceneActions.editEntities.create(map));
  timesEquals(centroid, 1.0 / elements.length);

  elements.sort((first, second) => {
    return (first.renderer.zOrder || 0) - (second.renderer.zOrder || 0);
  });
  let list = '';

  const combinedList = new ShapeList();
  const offset = {translation: negative(centroid)};
  for (const element of elements) {
    const geometry = ComponentGeometry[element.type];
    let shapeList = geometry.createShapeList(resource.idTree, element.entity);
    if (shapeList instanceof TransferableValue) {
      shapeList = shapeList.value;
    }
    shapeList.transform(composeTransforms(offset, element.transform));
    shapeList.addAttributes({
      pathColor: getColorArray(
        element.renderer.pathColor || PathColorProperty.pathColor.defaultValue,
      ),
      fillColor: getColorArray(
        element.renderer.fillColor || FillColorProperty.fillColor.defaultValue,
      ),
    });
    combinedList.add(shapeList);
  }
  entityState.shapeList.list = combinedList.encode();
  createEntity(GeometryComponents.shapeList.label, locale, entityState, {
    translation: centroid,
  });
}

const ToPartsItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    shortcut={new Shortcut('P', Shortcut.CTRL)}
    onClick={() => convertToParts(props.locale)}>
    <FormattedMessage id="selection.to_parts" defaultMessage="To Parts" />
  </MenuItem>
));

function convertToParts(locale: string) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const map = {};
  const selection = {};
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    const shapeData = entity.state.shape;
    const pathData = entity.state.path;
    const shapeOrPathData = shapeData || pathData;
    if (shapeOrPathData) {
      map[id] = null;
      const baseState = Object.assign({}, entity.state);
      delete baseState.parent;
      delete baseState.name;
      delete baseState.order;
      delete baseState.transform;
      delete baseState.shape;
      delete baseState.path;
      const thickness = getValue(shapeOrPathData.thickness, DEFAULT_THICKNESS);
      const controlPoints = shapeData
        ? ComponentGeometry.shape.getControlPoints(shapeData)
        : ComponentGeometry.path.getControlPoints(shapeOrPathData);
      const worldMatrix = getTransformMatrix(resource.getWorldTransform(id));
      controlPoints.forEach(point =>
        transformPointEquals(point.position, worldMatrix),
      );
      const path =
        (shapeData ? shapeData.exterior : shapeOrPathData.path) || '';
      let index = shapeData ? controlPoints.length - 1 : 0;
      parsePath(path, {
        moveTo: position => {},
        lineTo: position => {
          const start = controlPoints[index];
          index = (index + 1) % controlPoints.length;
          const end = controlPoints[index];
          const translation = timesEquals(
            plus(start.position, end.position),
            0.5,
          );
          const rotation = Math.atan2(
            end.position.y - start.position.y,
            end.position.x - start.position.x,
          );
          const id = createEntity(
            GeometryComponents.line.label,
            locale,
            Object.assign(
              {
                line: {
                  thickness,
                  length: distance(start.position, end.position),
                  order: 1,
                },
              },
              baseState,
            ),
            {translation, rotation},
          );
          id && (selection[id] = true);
        },
        arcTo: (position, radius) => {
          const start = controlPoints[index];
          index = (index + 1) % controlPoints.length;
          const mid = controlPoints[index++];
          const end = controlPoints[index];

          const height = 0.5 * distance(start.position, end.position);
          const vector = orthonormalizeEquals(
            minus(end.position, start.position),
          );
          const midpoint = timesEquals(plus(start.position, end.position), 0.5);
          minusEquals(midpoint, mid.position);
          const dist = clamp(dot(vector, midpoint), -height, height);
          if (dist !== 0.0) {
            radius = (height * height + dist * dist) / (2.0 * dist);
          }
          const center = plus(mid.position, timesEquals(vector, radius));
          const dp = dot(
            normalizeEquals(minus(mid.position, center)),
            normalizeEquals(minus(end.position, center)),
          );
          let angle = 2.0 * Math.acos(dp);
          if (radius < 0.0) {
            radius = -radius;
            angle = -angle;
          }
          const rotation = Math.atan2(
            start.position.y - center.y,
            start.position.x - center.x,
          );
          const id = createEntity(
            GeometryComponents.arc.label,
            locale,
            Object.assign(
              {
                arc: {
                  thickness,
                  radius,
                  angle,
                  order: 1,
                },
              },
              baseState,
            ),
            {translation: center, rotation},
          );
          id && (selection[id] = true);
        },
        curveTo: position => {
          const start = controlPoints[index];
          index = (index + 1) % controlPoints.length;
          const c1 = controlPoints[index++];
          const c2 = controlPoints[index++];
          const end = controlPoints[index];
          const translation = timesEquals(
            plus(start.position, end.position),
            0.5,
          );
          const rotation = Math.atan2(
            end.position.y - start.position.y,
            end.position.x - start.position.x,
          );
          const id = createEntity(
            GeometryComponents.curve.label,
            locale,
            Object.assign(
              {
                curve: {
                  thickness,
                  span: distance(start.position, end.position),
                  c1: rotateEquals(minus(c1.position, translation), -rotation),
                  c2: rotateEquals(minus(c2.position, translation), -rotation),
                  order: 1,
                },
              },
              baseState,
            ),
            {translation, rotation},
          );
          id && (selection[id] = true);
        },
      });
    }
    const shapeListData = entity.state.shapeList;
    if (shapeListData) {
      map[id] = null;
      const baseState = Object.assign({}, entity.state);
      delete baseState.parent;
      delete baseState.name;
      delete baseState.order;
      delete baseState.transform;
      delete baseState.shapeList;
      delete baseState.shapeRenderer;

      const transform = resource.getWorldTransform(id);
      const list = shapeListData.list || '';
      const createVisitor = (fillColor, pathColor, thickness, createEntity) => {
        let path = '';
        return {
          moveTo: position => {
            path += 'M ' + positionToString(position, ZERO_VECTOR);
          },
          lineTo: position => {
            path += ' L ' + positionToString(position, ZERO_VECTOR);
          },
          arcTo: (position, radius) => {
            path +=
              ' A ' +
              positionToString(position, ZERO_VECTOR) +
              ' ' +
              roundToPrecision(radius, 6);
          },
          curveTo: (position, c1, c2) => {
            path +=
              ' C ' +
              positionToString(position, ZERO_VECTOR) +
              ' ' +
              positionToString(c1, ZERO_VECTOR) +
              ' ' +
              positionToString(c2, ZERO_VECTOR);
          },
          end: () => createEntity(path),
        };
      };
      parseShapeList(list, {
        createShapeVisitor: (fillColor, pathColor, thickness) => {
          return createVisitor(fillColor, pathColor, thickness, path => {
            const id = createEntity(
              GeometryComponents.shape.label,
              locale,
              Object.assign(
                {
                  shape: {
                    exterior: path,
                    thickness,
                    fill: true,
                    order: 1,
                  },
                  shapeRenderer: {
                    pathColor,
                    fillColor,
                    order: 2,
                  },
                },
                baseState,
              ),
              transform,
            );
            id && (selection[id] = true);
          });
        },
        createHoleVisitor: (pathColor, thickness) => {
          return createVisitor(null, pathColor, thickness, path => {});
        },
        createPathVisitor: (loop, pathColor, thickness) => {
          return createVisitor(null, pathColor, thickness, path => {
            const id = createEntity(
              GeometryComponents.path.label,
              locale,
              Object.assign(
                {
                  path: {
                    path,
                    thickness,
                    order: 1,
                  },
                  shapeRenderer: {
                    pathColor,
                    order: 2,
                  },
                },
                baseState,
              ),
              transform,
            );
            id && (selection[id] = true);
          });
        },
      });
    }
  }
  store.dispatch(SceneActions.editEntities.create(map));
  store.dispatch(StoreActions.select.create(selection));
}

function positionToString(position: Vector2, offset: Vector2): string {
  return (
    roundToPrecision(position.x - offset.x, 6) +
    ' ' +
    roundToPrecision(position.y - offset.y, 6)
  );
}

const DuplicateItem = ReactRedux.connect(state => ({
  disabled: !canCopyOrDelete(state.selection),
}))(props => (
  <MenuItem
    disabled={props.disabled}
    shortcut={new Shortcut('D', Shortcut.CTRL)}
    onClick={duplicateSelection}>
    <FormattedMessage id="selection.duplicate" defaultMessage="Duplicate" />
  </MenuItem>
));

function duplicateSelection() {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const entitiesByParentId: Map<string, Map<string, Object>> = new Map();
  for (const id of state.selection) {
    if (resource.isAncestorInSet(id, state.selection)) {
      continue; // we only want the top-level selections
    }
    const entity = resource.getEntity(id);
    const parent = entity && entity.getParent();
    const node = resource.getEntityHierarchyNode(id);
    if (!(entity && parent && node)) {
      continue;
    }
    let entities: Map<string, Object> = (entitiesByParentId.get(
      parent.ref,
    ): any);
    if (!entities) {
      entitiesByParentId.set(parent.ref, (entities = new Map()));
    }
    node.applyToEntityIds(id => {
      const entity = resource.getEntity(id);
      entity && entities.set(id, entity.state);
    });
  }
  const map = {};
  for (const [parentId, entities] of entitiesByParentId) {
    const pasteAction = createPasteAction(state, entities, parentId);
    if (pasteAction) {
      store.dispatch(pasteAction);
      for (const key in pasteAction.map) {
        map[key] = true;
      }
    }
  }
  store.dispatch(StoreActions.select.create(map));
}
