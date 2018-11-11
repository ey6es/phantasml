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
  plusEquals,
  minus,
  timesEquals,
  negative,
  distance,
  cross,
  transformPointEquals,
  roundToPrecision,
} from '../server/store/math';
import type {ControlPoint} from '../server/store/geometry';
import {ComponentGeometry} from '../server/store/geometry';
import {Scene, SceneActions} from '../server/store/scene';

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
        <ToShapeListItem />
        <ToPartsItem />
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
  controlPoints: ControlPoint[],
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
    shape: {exterior: '', fill: true, order: 1},
    shapeRenderer: {order: 2},
    shapeCollider: {order: 3},
    rigidBody: {order: 4},
  };
  const elements: ShapeElement[] = [];
  const map = {};
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
      const controlPoints = geometry.getControlPoints(data);
      const matrix = getTransformMatrix(resource.getWorldTransform(id));
      for (const controlPoint of controlPoints) {
        transformPointEquals(controlPoint.position, matrix);
      }
      elements.push({
        type: key,
        controlPoints,
        endpoints: [
          controlPoints[key === 'arc' ? 1 : 0].position,
          controlPoints[controlPoints.length - 1].position,
        ],
        closestElements: [],
      });
      map[id] = null;
      break;
    }
  }
  if (elements.length === 0) {
    return;
  }
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
      exterior = 'M ' + controlPointToString(firstPoint, centroid);
    }
    lastPosition = lastPoint.position;
    switch (element.type) {
      case 'line':
        exterior += ' L ' + controlPointToString(lastPoint, centroid);
        break;

      case 'lineGroup':
        if (index === 0) {
          for (let ii = 1; ii < element.controlPoints.length; ii++) {
            exterior +=
              ' L ' + controlPointToString(element.controlPoints[ii], centroid);
          }
        } else {
          for (let ii = element.controlPoints.length - 2; ii >= 0; ii--) {
            exterior +=
              ' L ' + controlPointToString(element.controlPoints[ii], centroid);
          }
        }
        break;

      case 'arc':
        const center = element.controlPoints[0].position;
        const midpoint = element.controlPoints[2];
        const cp = cross(
          minus(midpoint.position, firstPoint.position),
          minus(lastPosition, firstPoint.position),
        );
        const radius =
          (cp < 0.0 ? -0.5 : 0.5) *
          (distance(center, lastPosition) +
            distance(center, firstPoint.position));
        const roundedRadius = ' ' + roundToPrecision(radius, 6);
        if (Math.abs(radius) > Math.PI) {
          // break large angles into two parts
          exterior += ' A ' + controlPointToString(midpoint, centroid);
          exterior += roundedRadius;
        }
        exterior += ' A ' + controlPointToString(lastPoint, centroid);
        exterior += roundedRadius;
        break;

      case 'curve':
        exterior += ' C ' + controlPointToString(lastPoint, centroid);
        if (index === 0) {
          exterior +=
            ' ' +
            positionToString(element.controlPoints[1].position, centroid) +
            ' ' +
            positionToString(element.controlPoints[2].position, centroid);
        } else {
          exterior +=
            ' ' +
            positionToString(element.controlPoints[2].position, centroid) +
            ' ' +
            positionToString(element.controlPoints[1].position, centroid);
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

function controlPointToString(
  controlPoint: ControlPoint,
  offset: Vector2,
): string {
  return (
    positionToString(controlPoint.position, offset) +
    ' ' +
    roundToPrecision(controlPoint.thickness, 6)
  );
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
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage
      id="selection.to_shape_list"
      defaultMessage="To Shape List"
    />
  </MenuItem>
));

const ToPartsItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="selection.to_parts" defaultMessage="To Parts" />
  </MenuItem>
));
