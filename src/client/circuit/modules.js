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
import type {Vector2} from '../../server/store/math';
import {
  vec2,
  equals,
  length,
  rotateEquals,
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

const ButtonDialIcon = new ShapeList().penDown(false, {
  thickness: 1.2,
  pathColor: [1.0, 1.0, 1.0],
});

const TOGGLE_SWITCH_SIZE = 0.6;
const HALF_TOGGLE_SWITCH_SIZE = TOGGLE_SWITCH_SIZE * 0.5;
const KNOB_THICKNESS = 0.4;

const ToggleSwitchIcon = new ShapeList()
  .move(-HALF_TOGGLE_SWITCH_SIZE, 0.0)
  .penDown(false, {thickness: KNOB_THICKNESS, pathColor: [0.25, 0.25, 0.25]})
  .advance(TOGGLE_SWITCH_SIZE);

const SLIDER_SIZE = 4.5;
const HALF_SLIDER_SIZE = SLIDER_SIZE * 0.5;

const SliderIcon = new ShapeList()
  .move(-HALF_SLIDER_SIZE, 0)
  .penDown(false, {thickness: 0.15, pathColor: [0.25, 0.25, 0.25]})
  .advance(SLIDER_SIZE);

const JOYSTICK_SIZE = 1.5;
const HALF_JOYSTICK_SIZE = JOYSTICK_SIZE * 0.5;

const JoystickIcon = new ShapeList()
  .move(-HALF_JOYSTICK_SIZE, -HALF_JOYSTICK_SIZE)
  .penDown(true, {
    thickness: 0.15,
    pathColor: [0.25, 0.25, 0.25],
    fillColor: [0.25, 0.25, 0.25],
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
        const buttonHover = hoverObject && hoverState.button;
        const buttonPressed = entity.state.pushButton.pressed;
        baseFn(renderer, selected, buttonHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          transform,
          BUTTON_DIAL_RADIUS,
          buttonPressed ? '#00ffff' : buttonHover ? '#00bfbf' : '#009999',
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
      return oldHoverState && oldHoverState.button
        ? oldHoverState
        : {button: true};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.button)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              pushButton: {pressed: true},
            },
          },
          false,
        ),
      );
      return [oldHoverState, false];
    },
    onRelease: (entity, position) => {
      if (entity.state.pushButton.pressed) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                pushButton: {pressed: null},
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
        const switchHover = hoverObject && hoverState.switch;
        baseFn(renderer, selected, switchHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {
            translation: vec2(-HALF_TOGGLE_SWITCH_SIZE),
          }),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || switchHover),
        );
      };
    },
    onMove: (entity, position) => {
      return true;
    },
    onPress: (entity, position, offset) => {
      return [{dragging: position, offset}, true];
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
        const dialHover = hoverObject && hoverState.angle != null;
        const angle = getValue(entity.state.dial.angle, Math.PI * -0.5);
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
          composeTransforms(transform, {
            translation: rotateEquals(vec2(0.7, 0), angle),
            rotation: angle,
          }),
          0.2,
          '#ffffff',
          0.4,
          hoverObject && !(hoverState.part || hoverState.dragging || dialHover),
        );
        if (dialHover) {
          renderLineHelper(
            renderer,
            composeTransforms(transform, {
              translation: rotateEquals(vec2(0.7, 0), hoverState.angle),
              rotation: hoverState.angle,
            }),
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
      const angle = Math.atan2(position.y, position.x);
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState && oldHoverState.angle === angle
        ? oldHoverState
        : {angle};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.angle != null)) {
        return [{dragging: position, offset}, true];
      }
      const angle = Math.atan2(position.y, position.x);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {angle},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.angle != null)) {
        return oldHoverState;
      }
      const angle = Math.atan2(position.y, position.x);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {angle},
          },
        }),
      );
      return {angle};
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
        const sliderHover = hoverObject && hoverState.position != null;
        const sliderPosition = getValue(
          entity.state.slider.position,
          -HALF_SLIDER_SIZE,
        );
        baseFn(renderer, selected, sliderHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {translation: vec2(sliderPosition)}),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || sliderHover),
        );
        if (sliderHover) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {
              translation: vec2(hoverState.position),
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
      const clampedPosition = clamp(
        position.x,
        -HALF_SLIDER_SIZE,
        HALF_SLIDER_SIZE,
      );
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState && oldHoverState.position == clampedPosition
        ? oldHoverState
        : {position: clampedPosition};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.position != null)) {
        return [{dragging: position, offset}, true];
      }
      const clampedPosition = clamp(
        position.x,
        -HALF_SLIDER_SIZE,
        HALF_SLIDER_SIZE,
      );
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {position: clampedPosition},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.position != null)) {
        return oldHoverState;
      }
      const clampedPosition = clamp(
        position.x,
        -HALF_SLIDER_SIZE,
        HALF_SLIDER_SIZE,
      );
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {position: clampedPosition},
          },
        }),
      );
      return {position: clampedPosition};
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
        const joystickHover = hoverObject && hoverState.position;
        const joystickPosition = entity.state.joystick.position;
        baseFn(renderer, selected, joystickHover ? undefined : hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(transform, {translation: joystickPosition}),
          KNOB_THICKNESS,
          '#ffffff',
          hoverObject &&
            !(hoverState.part || hoverState.dragging || joystickHover),
        );
        if (joystickHover) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {translation: hoverState.position}),
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
      const clampedPosition = vec2(
        clamp(position.x, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
        clamp(position.y, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
      );
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState &&
        oldHoverState.position &&
        oldHoverState.position.x === clampedPosition.x &&
        oldHoverState.position.y === clampedPosition.y
        ? oldHoverState
        : {position: clampedPosition};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.position)) {
        return [{dragging: position, offset}, true];
      }
      const clampedPosition = vec2(
        clamp(position.x, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
        clamp(position.y, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
      );
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {position: clampedPosition},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.position)) {
        return oldHoverState;
      }
      const clampedPosition = vec2(
        clamp(position.x, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
        clamp(position.y, -HALF_JOYSTICK_SIZE, HALF_JOYSTICK_SIZE),
      );
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {position: clampedPosition},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return {position: clampedPosition};
    },
    onRelease: (entity, position) => {
      if (
        entity.state.joystick.position &&
        entity.state.joystick.autocenter !== false
      ) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                joystick: {position: null},
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
