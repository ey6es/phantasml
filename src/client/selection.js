/**
 * Components related to selection operations.
 *
 * @module client/selection
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {store} from './store';
import {Menu, Submenu, MenuItem} from './util/ui';
import type {Vector2} from '../server/store/math';
import {
  getTransformTranslation,
  composeTransforms,
  getTransformMatrix,
  vec2,
  plusEquals,
  timesEquals,
  negative,
  transformPointEquals,
} from '../server/store/math';
import {ComponentGeometry} from '../server/store/geometry';
import {Scene, SceneActions} from '../server/store/scene';

/**
 * The selection menu dropdown.
 */
export class SelectionDropdown extends React.Component<{}, {}> {
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
        <ToShapeItem />
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
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="selection.to_shape" defaultMessage="To Shape" />
  </MenuItem>
));

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
