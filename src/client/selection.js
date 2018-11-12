/**
 * Components related to selection operations.
 *
 * @module client/selection
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {store, createUuid} from './store';
import {createEntity} from './entity';
import {Menu, Submenu, MenuItem} from './util/ui';
import {GeometryComponents} from './geometry/components';
import type {Vector2} from '../server/store/math';
import {
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
import type {ControlPoint} from '../server/store/geometry';
import {
  DEFAULT_THICKNESS,
  ComponentGeometry,
  parsePath,
} from '../server/store/geometry';
import {Scene, SceneActions} from '../server/store/scene';
import {getValue} from '../server/store/util';

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
        <ToShapeItem locale={this.props.locale} />
        <ToShapeListItem locale={this.props.locale} />
        <ToPartsItem locale={this.props.locale} />
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

const ToShapeItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => convertToShape(props.locale)}>
    <FormattedMessage id="selection.to_shape" defaultMessage="To Shape" />
  </MenuItem>
));

type ShapeElement = {
  type: string,
  controlPoints: Vector2[],
  endpoints: Vector2[],
  closestElements: ShapeElementIndex[],
};

type ShapeElementIndex = [ShapeElement, number];

function convertToShape(locale: string) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const entityState = {
    shape: {exterior: '', thickness: DEFAULT_THICKNESS, fill: true, order: 1},
    shapeRenderer: {order: 2},
    shapeCollider: {order: 3},
    rigidBody: {order: 4},
  };
  const elements: ShapeElement[] = [];
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
            key === 'curve')
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
  entityState.shape.thickness = totalThickness / elements.length;
  store.dispatch(SceneActions.editEntities.create(map));
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
  }
  const firstElement = elements[0];
  let signedArea = 0.0;
  const centroid = vec2();
  let currentElement: ShapeElementIndex = [firstElement, 0];
  let index = 0;
  for (let ii = 0; ii < elements.length; ii++) {
    const [element, index] = currentElement;
    const otherIndex = 1 - index;
    const from = element.endpoints[index];
    const to = element.endpoints[otherIndex];
    const cp = cross(from, to);
    signedArea += cp;
    centroid.x += cp * (from.x + to.x);
    centroid.y += cp * (from.y + to.y);

    // "weld" endpoints together to their midpoints
    currentElement = element.closestElements[otherIndex];
    const [nextElement, nextIndex] = currentElement;
    const nextFrom = nextElement.endpoints[nextIndex];
    equals(timesEquals(plusEquals(to, nextFrom), 0.5), nextFrom);
  }
  timesEquals(centroid, 1.0 / (3.0 * signedArea));
  const reversed = signedArea < 0.0;
  currentElement = [firstElement, reversed ? 1 : 0];
  let exterior = '';
  let lastPosition = vec2();
  for (let ii = 0; ii < elements.length; ii++) {
    const [element, index] = currentElement;
    const otherIndex = 1 - index;
    let firstPoint = element.controlPoints[element.type === 'arc' ? 1 : 0];
    let lastPoint = element.controlPoints[element.controlPoints.length - 1];
    if (index === 1) {
      const tmp = firstPoint;
      firstPoint = lastPoint;
      lastPoint = tmp;
    }
    if (exterior.length === 0) {
      exterior = 'M ' + positionToString(firstPoint, centroid);
    }
    lastPosition = lastPoint;
    switch (element.type) {
      case 'line':
        exterior += ' L ' + positionToString(lastPoint, centroid);
        break;

      case 'lineGroup':
        if (index === 0) {
          for (let ii = 1; ii < element.controlPoints.length; ii++) {
            exterior +=
              ' L ' + positionToString(element.controlPoints[ii], centroid);
          }
        } else {
          for (let ii = element.controlPoints.length - 2; ii >= 0; ii--) {
            exterior +=
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
          exterior += ' A ' + positionToString(midpoint, centroid);
          exterior += roundedRadius;
        }
        exterior += ' A ' + positionToString(lastPoint, centroid);
        exterior += roundedRadius;
        break;

      case 'curve':
        exterior += ' C ' + positionToString(lastPoint, centroid);
        if (index === 0) {
          exterior +=
            ' ' +
            positionToString(element.controlPoints[1], centroid) +
            ' ' +
            positionToString(element.controlPoints[2], centroid);
        } else {
          exterior +=
            ' ' +
            positionToString(element.controlPoints[2], centroid) +
            ' ' +
            positionToString(element.controlPoints[1], centroid);
        }
        break;
    }
    currentElement = element.closestElements[otherIndex];
  }
  entityState.shape.exterior = exterior;
  createEntity(GeometryComponents.shape.label, locale, entityState, {
    translation: centroid,
  });
}

function positionToString(position: Vector2, offset: Vector2): string {
  return (
    roundToPrecision(position.x - offset.x, 6) +
    ' ' +
    roundToPrecision(position.y - offset.y, 6)
  );
}

const ToShapeListItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => convertToShapeList(props.locale)}>
    <FormattedMessage
      id="selection.to_shape_list"
      defaultMessage="To Shape List"
    />
  </MenuItem>
));

function convertToShapeList(locale: string) {}

const ToPartsItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
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
  for (const id of state.selection) {
    const entity = resource.getEntity(id);
    if (!entity) {
      continue;
    }
    const shapeData = entity.state.shape;
    if (shapeData) {
      map[id] = null;
      const baseState = Object.assign({}, entity.state);
      delete baseState.parent;
      delete baseState.name;
      delete baseState.order;
      delete baseState.transform;
      delete baseState.shape;
      const thickness = getValue(shapeData.thickness, DEFAULT_THICKNESS);
      const controlPoints = ComponentGeometry.shape.getControlPoints(shapeData);
      const worldMatrix = getTransformMatrix(resource.getWorldTransform(id));
      controlPoints.forEach(point =>
        transformPointEquals(point.position, worldMatrix),
      );
      const exterior = shapeData.exterior || '';
      let index = controlPoints.length - 1;
      parsePath(exterior, {
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
          createEntity(
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
          createEntity(
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
          createEntity(
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
        },
      });
    }
    const shapeListData = entity.state.shapeList;
    if (shapeListData) {
      map[id] = null;
    }
  }
  store.dispatch(SceneActions.editEntities.create(map));
}
