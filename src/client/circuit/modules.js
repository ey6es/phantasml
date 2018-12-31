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
import {renderPointHelper, renderLineHelper} from '../renderer/helpers';
import {ShapeList} from '../../server/store/shape';
import type {Entity} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {SceneActions} from '../../server/store/scene';
import type {Transform, Vector2} from '../../server/store/math';
import {
  TWO_PI,
  HALF_PI,
  vec2,
  equals,
  length,
  rotateEquals,
  times,
  normalize,
  cross,
  composeTransforms,
  clamp,
} from '../../server/store/math';
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
  onPress: (Entity, Vector2, Vector2) => [HoverState, boolean],
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

const White = [1.0, 1.0, 1.0];
const DarkGray = [0.25, 0.25, 0.25];

const IconAttributes = {
  thickness: 0.15,
  pathColor: White,
  fillColor: White,
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

const ButtonDialIcon = new ShapeList().penDown(false, {
  thickness: 1.2,
  pathColor: White,
});

function getDialValue(position: Vector2): number {
  return Math.atan2(position.x, position.y) / TWO_PI + 0.5;
}

function getDialTransform(value: ?number): Transform {
  const rotation = getDialRotation(value);
  return {
    translation: rotateEquals(vec2(0.7, 0), rotation),
    rotation,
  };
}

function getDialRotation(value: ?number): number {
  return HALF_PI - ((value || 0.0) - 0.5) * TWO_PI;
}

const TOGGLE_SWITCH_SIZE = 0.6;
const HALF_TOGGLE_SWITCH_SIZE = TOGGLE_SWITCH_SIZE * 0.5;
const KNOB_THICKNESS = 0.4;

function getToggleSwitchPosition(value: ?boolean): Vector2 {
  return vec2((value ? 1 : -1) * HALF_TOGGLE_SWITCH_SIZE, 0.0);
}

const ToggleSwitchIcon = new ShapeList()
  .move(-HALF_TOGGLE_SWITCH_SIZE, 0.0)
  .penDown(false, {thickness: KNOB_THICKNESS, pathColor: DarkGray})
  .advance(TOGGLE_SWITCH_SIZE);

const SLIDER_SIZE = 4.5;
const HALF_SLIDER_SIZE = SLIDER_SIZE * 0.5;

function getSliderValue(position: Vector2): number {
  return clamp(position.x / SLIDER_SIZE + 0.5, 0.0, 1.0);
}

function getSliderPosition(value: ?number): Vector2 {
  return vec2(((value || 0.0) - 0.5) * SLIDER_SIZE, 0.0);
}

const SliderIcon = new ShapeList()
  .move(-HALF_SLIDER_SIZE, 0)
  .penDown(false, {thickness: 0.15, pathColor: DarkGray})
  .advance(SLIDER_SIZE);

const JOYSTICK_SIZE = 1.5;
const HALF_JOYSTICK_SIZE = JOYSTICK_SIZE * 0.5;

function getJoystickValue(position: Vector2): Vector2 {
  return vec2(
    clamp(position.x / HALF_JOYSTICK_SIZE, -1.0, 1.0),
    clamp(position.y / HALF_JOYSTICK_SIZE, -1.0, 1.0),
  );
}

function getJoystickPosition(value: ?Vector2): ?Vector2 {
  return value && times(value, HALF_JOYSTICK_SIZE);
}

const JoystickIcon = new ShapeList()
  .move(-HALF_JOYSTICK_SIZE, -HALF_JOYSTICK_SIZE)
  .penDown(true, {
    thickness: 0.15,
    pathColor: DarkGray,
    fillColor: DarkGray,
  })
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE);

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
  onPress: (entity, position, offset) => [{dragging: position, offset}, true],
  onDrag: (entity, position, setHoverState) => {
    return store.getState().hoverStates.get(entity.id);
  },
  onRelease: (entity, position) => {},
};

const BUTTON_DIAL_RADIUS = 0.9;

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
    getIcon: data => ButtonDialIcon,
    getOutputs: data => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const buttonHover = hoverObject && hoverState.value;
        baseFn(renderer, selected, buttonHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          transform,
          BUTTON_DIAL_RADIUS,
          entity.state.pushButton.value
            ? '#00ffff'
            : buttonHover
              ? '#00bfbf'
              : '#009999',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || buttonHover),
        );
      };
    },
    onMove: (entity, position) => {
      if (length(position) > BUTTON_DIAL_RADIUS) {
        return true;
      }
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState && oldHoverState.value
        ? oldHoverState
        : {value: true};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              pushButton: {value: true},
            },
          },
          false,
        ),
      );
      return [oldHoverState, false];
    },
    onRelease: (entity, position) => {
      if (entity.state.pushButton.value) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                pushButton: {value: null},
              },
            },
            false,
          ),
        );
      }
    },
  }),
  toggleSwitch: extend(BaseModule, {
    getIcon: data => ToggleSwitchIcon,
    getOutputs: data => SingleOutput,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const switchHover = hoverObject && hoverState.value != null;
        baseFn(renderer, selected, switchHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {
            translation: getToggleSwitchPosition(
              entity.state.toggleSwitch.value,
            ),
          }),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || switchHover),
        );
        if (switchHover) {
          renderLineHelper(
            renderer,
            transform,
            KNOB_THICKNESS,
            '#ffffff',
            TOGGLE_SWITCH_SIZE,
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_TOGGLE_SWITCH_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > KNOB_THICKNESS
      ) {
        return true;
      }
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      const value = !entity.state.toggleSwitch.value;
      return oldHoverState && oldHoverState.value === value
        ? oldHoverState
        : {value};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            toggleSwitch: {value: !entity.state.toggleSwitch.value},
          },
        }),
      );
      return [oldHoverState, false];
    },
  }),
  dial: extend(BaseModule, {
    getIcon: data => ButtonDialIcon,
    getOutputs: data => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const dialHover = hoverObject && hoverState.value != null;
        baseFn(renderer, selected, dialHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          transform,
          BUTTON_DIAL_RADIUS,
          '#404040',
          hoverObject && !(hoverState.part || hoverState.dragging || dialHover),
        );
        renderLineHelper(
          renderer,
          composeTransforms(
            transform,
            getDialTransform(entity.state.dial.value),
          ),
          0.2,
          '#ffffff',
          0.4,
          hoverObject && !(hoverState.part || hoverState.dragging || dialHover),
        );
        if (dialHover) {
          renderLineHelper(
            renderer,
            composeTransforms(transform, getDialTransform(hoverState.value)),
            0.2,
            '#ffffff',
            0.4,
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (length(position) > BUTTON_DIAL_RADIUS) {
        return true;
      }
      return {value: getDialValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {value: getDialValue(position)},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return oldHoverState;
      }
      // use vectors to compute delta in order to enforce dial limits
      const oldValue = entity.state.dial.value || 0.0;
      const oldVector = rotateEquals(vec2(1.0, 0.0), getDialRotation(oldValue));
      const newVector = normalize(position);
      const delta = Math.asin(cross(newVector, oldVector)) / TWO_PI;
      const value = clamp(oldValue + delta, 0.0, 1.0);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {value},
          },
        }),
      );
      return {value};
    },
  }),
  slider: extend(BaseModule, {
    getIcon: data => SliderIcon,
    getWidth: data => DEFAULT_MODULE_WIDTH * 2.0,
    getOutputs: data => SingleOutput,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const sliderHover = hoverObject && hoverState.value != null;
        baseFn(renderer, selected, sliderHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {
            translation: getSliderPosition(entity.state.slider.value),
          }),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || sliderHover),
        );
        if (sliderHover) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {
              translation: getSliderPosition(hoverState.value),
            }),
            KNOB_THICKNESS,
            '#ffffff',
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_SLIDER_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > KNOB_THICKNESS
      ) {
        return true;
      }
      return {value: getSliderValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {value: getSliderValue(position)},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return oldHoverState;
      }
      const value = getSliderValue(position);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {value},
          },
        }),
      );
      return {value};
    },
  }),
  joystick: extend(BaseModule, {
    getIcon: data => JoystickIcon,
    getOutputs: data => ({
      leftRight: {
        label: (
          <FormattedMessage
            id="joystick.left_right"
            defaultMessage="Left/Right"
          />
        ),
      },
      upDown: {
        label: (
          <FormattedMessage id="joystick.up_down" defaultMessage="Up/Down" />
        ),
      },
    }),
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        const hoverObject = hoverState && typeof hoverState === 'object';
        const joystickHover = hoverObject && hoverState.value;
        baseFn(renderer, selected, joystickHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {
            translation: getJoystickPosition(entity.state.joystick.value),
          }),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || joystickHover),
        );
        if (joystickHover) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {
              translation: getJoystickPosition(hoverState.value),
            }),
            KNOB_THICKNESS,
            '#ffffff',
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_JOYSTICK_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > HALF_JOYSTICK_SIZE + KNOB_THICKNESS
      ) {
        return true;
      }
      return {value: getJoystickValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {value: getJoystickValue(position)},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return oldHoverState;
      }
      const value = getJoystickValue(position);
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {value},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return {value};
    },
    onRelease: (entity, position) => {
      if (
        entity.state.joystick.value &&
        entity.state.joystick.autocenter !== false
      ) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                joystick: {value: null},
              },
            },
            false,
          ),
        );
      }
    },
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
