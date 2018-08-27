/**
 * Binary reinforcement hierarchy.
 *
 * @module client/models/brh
 * @flow
 */

import {Pbrrn} from './pbrrn';
import type {PbrrnOptions} from './pbrrn';

export type BrhModelOptions = PbrrnOptions & {
  parentInputBits?: number,
  parentOutputBits?: number,
};

/**
 * Binary reinforcement hierarchy.
 *
 * @param modelOptions the options for the models at each level (assumes
 * symmetry).
 * @param [parent] the parent node, if not the root.
 */
export class Brh {
  _parent: ?Brh;
  _model: Pbrrn;
  _parentInputBits: number;
  _parentOutputBits: number;
  _inputBuffer: Uint8Array;
  _outputBuffer: Uint8Array;
  _children: Brh[] = [];

  constructor(modelOptions: BrhModelOptions[], parent?: Brh) {
    this._parent = parent;
    const options = modelOptions[0];
    this._model = new Pbrrn(options);
    this._parentInputBits = options.parentInputBits || 0;
    this._parentOutputBits = options.parentOutputBits || 0;
    this._inputBuffer = new Uint8Array(this._parentInputBits * 2 * 4);
    this._outputBuffer = new Uint8Array(this._parentOutputBits * 2 * 4);
    const remainingOptions = modelOptions.slice(1);
    if (remainingOptions.length > 0) {
      this._children.push(
        new Brh(remainingOptions, this),
        new Brh(remainingOptions, this),
      );
    }
  }

  /**
   * Sets the state of the system at the specified coordinates (i.e., set the
   * value of an input).
   *
   * @param address the address in the hierachy of the model to modify.
   * @param x the x coordinate of interest.
   * @param y the y coordinate of interest.
   * @param value the value to set at the coordinates.
   */
  setState(address: boolean[], x: number, y: number, value: boolean) {
    this.getModel(address).setState(x, y, value);
  }

  /**
   * Executes a simulation time step.
   *
   * @param reward the amount of reward to grant.
   */
  step(reward: number) {
    const parent = this._parent;
    this._maybeReadFromParent();
    this._model.step(reward);
    this._maybeWriteToParent();
    if (this._children.length === 0) {
      return;
    }
    const favoredChild = Number(
      this._model.getState(
        this._model.options.width / 2,
        this._model.options.height / 2,
      ),
    );
    this._children[favoredChild].step(1.0);
    this._children[1 - favoredChild].step(0.0);
  }

  _maybeReadFromParent() {
    const parent = this._parent;
    if (!parent) {
      return;
    }
    const childIndex = parent._children.indexOf(this);
    const inputSize = this._parentInputBits * 2;
    parent._model.getStates(
      parent._model.options.width - 1,
      childIndex ? parent._model.options.height - inputSize : 0,
      1,
      inputSize,
      this._inputBuffer,
    );
    this._model.setStates(
      Math.floor((this._model.options.width - inputSize) / 2),
      0,
      inputSize,
      1,
      this._inputBuffer,
    );
  }

  _maybeWriteToParent() {
    const parent = this._parent;
    if (!parent) {
      return;
    }
    const childIndex = parent._children.indexOf(this);
    const outputSize = this._parentOutputBits * 2;
    this._model.getStates(
      Math.floor((this._model.options.width - outputSize) / 2),
      this._model.options.height - 1,
      outputSize,
      1,
      this._outputBuffer,
    );
    parent._model.setStates(
      0,
      childIndex ? parent._model.options.height - outputSize : 0,
      1,
      outputSize,
      this._outputBuffer,
    );
  }

  /**
   * Retrieves the state of the system at the specified coordinates (i.e., get
   * the value of an output).
   *
   * @param address the address in the hierarchy of the model to sample.
   * @param x the x coordinate of interest.
   * @param y the y coordinate of interest.
   * @return the boolean state of the location.
   */
  getState(address: boolean[], x: number, y: number): boolean {
    return this.getModel(address).getState(x, y);
  }

  /**
   * Retrieves a submodel according to its address in the hierarchy.
   *
   * @param address the address of the model of interest.
   */
  getModel(address: boolean[]): Pbrrn {
    return address.length === 0
      ? this._model
      : this._children[Number(address[0])].getModel(address.slice(1));
  }

  /**
   * Releases the resources held by the model.
   */
  dispose() {
    this._model.dispose();
    this._children.forEach(child => child.dispose());
  }
}
