/**
 * Circuit component implementations.
 *
 * @module client/circuit/modules
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {InputsProperty, OutputsProperty, CircuitComponents} from './components';
import type {HoverState} from '../store';
import {store} from '../store';
import type {Renderer} from '../renderer/util';
import {renderPointHelper} from '../renderer/helpers';
import {ShapeList} from '../../server/store/shape';
import type {Entity} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {SceneActions} from '../../server/store/scene';
import type {Vector2} from '../../server/store/math';
import {length} from '../../server/store/math';
import {getValue, extend} from '../../server/store/util';

type InputData = {
  label: React.Element<any>,
};

type OutputData = {
  label: React.Element<any>,
};

type ModuleData = {
  getIcon: Object => ShapeList,
  getInputs: Object => {[string]: InputData},
  getOutputs: Object => {[string]: OutputData},
  getWidth: Object => number,
  getHeight: (Object, number, number) => number,
  createRenderFn: (
    IdTreeNode,
    Entity,
    (Renderer, boolean, HoverState) => void,
  ) => (Renderer, boolean, HoverState) => void,
  onMove: (Entity, Vector2) => HoverState,
  onPress: (Entity, Vector2, Vector2) => HoverState,
  onDrag: (Entity, Vector2, (string, HoverState) => void) => HoverState,
  onRelease: (Entity, Vector2) => HoverState,
};

const SingleInput = {
  input: {
    label: <FormattedMessage id="circuit.input" defaultMessage="Input" />,
  },
};

const SingleOutput = {
  output: {
    label: <FormattedMessage id="circuit.output" defaultMessage="Output" />,
  },
};

const IconAttributes = {
  thickness: 0.15,
  pathColor: [1.0, 1.0, 1.0],
  fillColor: [1.0, 1.0, 1.0],
};

const SplitIcon = new ShapeList()
  .move(-0.375, 0.0)
  .penDown(false, IconAttributes)
  .advance(0.375)
  .pivot(45)
  .advance(Math.SQRT1_2 * 0.75)
  .penUp()
  .move(0, 0, -45)
  .penDown()
  .advance(Math.SQRT1_2 * 0.75);

const InvertIcon = new ShapeList()
  .move(-0.375, 0)
  .penDown(false, IconAttributes)
  .advance(0.75);

const AddIcon = new ShapeList()
  .move(-0.375, 0)
  .penDown(false, IconAttributes)
  .advance(0.75)
  .penUp()
  .move(0, -0.375, 90)
  .penDown()
  .advance(0.75);

const MultiplyIcon = new ShapeList()
  .move(0, -0.375, 90)
  .penDown(false, IconAttributes)
  .advance(0.75)
  .penUp()
  .move(-0.3, -0.15, 26.565)
  .penDown()
  .advance(0.6708)
  .penUp()
  .move(-0.3, 0.15, -26.565)
  .penDown()
  .advance(0.6708);

const PushButtonIcon = new ShapeList().penDown(false, {
  thickness: 1.2,
  pathColor: [1.0, 1.0, 1.0],
});

const NoIcon = new ShapeList();

const DEFAULT_MODULE_WIDTH = 3.0;

/** The height of each terminal. */
export const MODULE_HEIGHT_PER_TERMINAL = 1.5;

const BaseModule = {
  getIcon: data => NoIcon,
  getInputs: data => ({}),
  getOutputs: data => ({}),
  getWidth: data => DEFAULT_MODULE_WIDTH,
  getHeight: (data, inputCount, outputCount) => {
    return Math.max(inputCount, outputCount) * MODULE_HEIGHT_PER_TERMINAL;
  },
  createRenderFn: (idTree, entity, baseFn) => baseFn,
  onMove: (entity, position) => true,
  onPress: (entity, position, offset) => ({dragging: position, offset}),
  onDrag: (entity, position, setHoverState) => {
    return store.getState().hoverStates.get(entity.id);
  },
  onRelease: (entity, position) => {},
};

const PUSH_BUTTON_RADIUS = 0.9;

/**
 * Circuit component functions mapped by component name.
 */
export const ComponentModules: {[string]: ModuleData} = {
  split: extend(BaseModule, {
    getIcon: data => SplitIcon,
    getInputs: data => SingleInput,
    getOutputs: createMultipleOutputs,
  }),
  invert: extend(BaseModule, {
    getIcon: data => InvertIcon,
    getInputs: data => SingleInput,
    getOutputs: data => SingleOutput,
  }),
  add: extend(BaseModule, {
    getIcon: data => AddIcon,
    getInputs: data =>
      createMultipleInputs(data, index => (
        <FormattedMessage
          id="add.summand.n"
          defaultMessage="Summand {number}"
          values={{number: index}}
        />
      )),
    getOutputs: data => ({
      output: {
        label: <FormattedMessage id="add.sum" defaultMessage="Sum" />,
      },
    }),
  }),
  multiply: extend(BaseModule, {
    getIcon: data => MultiplyIcon,
    getInputs: data =>
      createMultipleInputs(data, index => (
        <FormattedMessage
          id="multiply.factor.n"
          defaultMessage="Factor {number}"
          values={{number: index}}
        />
      )),
    getOutputs: data => ({
      output: {
        label: (
          <FormattedMessage id="multiply.product" defaultMessage="Product" />
        ),
      },
    }),
  }),
  pushButton: extend(BaseModule, {
    getIcon: data => PushButtonIcon,
    getOutputs: data => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const buttonHover = hoverObject && hoverState.button;
        const buttonPressed = entity.state.pushButton.pressed;
        baseFn(renderer, selected, buttonHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          transform,
          PUSH_BUTTON_RADIUS,
          buttonPressed ? '#00ffff' : buttonHover ? '#00bfbf' : '#009999',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || buttonHover),
        );
      };
    },
    onMove: (entity, position) => {
      if (length(position) > PUSH_BUTTON_RADIUS) {
        return true;
      }
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState && oldHoverState.button
        ? oldHoverState
        : {button: true};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.button)) {
        return {dragging: position, offset};
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            pushButton: {pressed: true},
          },
        }),
      );
      return oldHoverState;
    },
    onRelease: (entity, position) => {
      if (entity.state.pushButton.pressed) {
        store.dispatch(
          SceneActions.editEntities.create({
            [entity.id]: {
              pushButton: {pressed: null},
            },
          }),
        );
      }
    },
  }),
  toggleSwitch: extend(BaseModule, {
    getOutputs: data => SingleOutput,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const switchHover = hoverObject && hoverState.switch;
        baseFn(renderer, selected, switchHover ? undefined : hoverState);
      };
    },
    onMove: (entity, position) => {
      return true;
    },
    onPress: (entity, position, offset) => {
      return {dragging: position, offset};
    },
  }),
  dial: extend(BaseModule, {
    getOutputs: data => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
  }),
  pseudo3d: extend(BaseModule, {
    getWidth: data =>
      getValue(
        data.width,
        CircuitComponents.pseudo3d.properties.width.defaultValue,
      ),
    getHeight: data =>
      getValue(
        data.height,
        CircuitComponents.pseudo3d.properties.height.defaultValue,
      ),
  }),
  inputBus: extend(BaseModule, {}),
  outputBus: extend(BaseModule, {}),
};

function createMultipleInputs(
  data: Object,
  getLabel: number => React.Element<any>,
): {[string]: InputData} {
  const inputs = {};
  const inputCount = data.inputs || InputsProperty.inputs.defaultValue;
  for (let ii = 1; ii <= inputCount; ii++) {
    inputs['input' + ii] = {label: getLabel(ii)};
  }
  return inputs;
}

function createMultipleOutputs(data: Object): {[string]: OutputData} {
  const outputs = {};
  const outputCount = data.outputs || OutputsProperty.outputs.defaultValue;
  for (let ii = 1; ii <= outputCount; ii++) {
    outputs['output' + ii] = {
      label: (
        <FormattedMessage
          id="circuit.output.n"
          defaultMessage="Output {number}"
          values={{number: ii}}
        />
      ),
    };
  }
  return outputs;
}
