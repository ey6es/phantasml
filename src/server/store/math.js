/**
 * Math types and operations used by the store.
 *
 * @module server/store/math
 * @flow
 */

export type Vector2 = {x: number, y: number};

export type Plane = {normal: Vector2, constant: number};

/** General transform type. */
export type Transform = ?{
  translation?: Vector2 | {x?: number, y?: number},
  rotation?: number,
  scale?: Vector2 | {x?: number, y?: number},
  matrix?: number[],
};

/**
 * Composes two transforms into one.
 *
 * @param second the second transform to apply.
 * @param first the first transform to apply.
 * @return the combined transform.
 */
export function composeTransforms(
  second: Transform,
  first: Transform,
): Transform {
  if (!second) {
    return first;
  }
  if (!first) {
    return second;
  }
  const m2 = getTransformMatrix(second);
  const m1 = getTransformMatrix(first);
  return {
    // prettier-ignore
    matrix: [
      m2[0] * m1[0] + m2[3] * m1[1] + m2[6] * m1[2],
      m2[1] * m1[0] + m2[4] * m1[1] + m2[7] * m1[2],
      m2[2] * m1[0] + m2[5] * m1[1] + m2[8] * m1[2],
      
      m2[0] * m1[3] + m2[3] * m1[4] + m2[6] * m1[5],
      m2[1] * m1[3] + m2[4] * m1[4] + m2[7] * m1[5],
      m2[2] * m1[3] + m2[5] * m1[4] + m2[8] * m1[5],
      
      m2[0] * m1[6] + m2[3] * m1[7] + m2[6] * m1[8],
      m2[1] * m1[6] + m2[4] * m1[7] + m2[7] * m1[8],
      m2[2] * m1[6] + m2[5] * m1[7] + m2[8] * m1[8],
    ]
  };
}

// prettier-ignore
const IDENTITY_MATRIX = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,  
];

/**
 * Retrieves the matrix corresponding to the provided transform.
 *
 * @param transform the transform of interest.
 * @return the transformation matrix.
 */
export function getTransformMatrix(transform: Transform): number[] {
  if (!transform) {
    return IDENTITY_MATRIX;
  }
  if (!transform.matrix) {
    let tx: ?number;
    let ty: ?number;
    if (transform.translation) {
      tx = transform.translation.x;
      ty = transform.translation.y;
    }
    let sx: ?number;
    let sy: ?number;
    if (transform.scale) {
      sx = transform.scale.x;
      sy = transform.scale.y;
    }
    sx = sx || 0;
    sy = sy || 0;
    const rotation = transform.rotation || 0;
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);

    // prettier-ignore
    transform.matrix = [
      cr * sx, -sr * sx, 0,
      sr * sy, cr * sy, 0,
      tx || 0, ty || 0, 1,
    ];
  }
  return transform.matrix;
}

const ZERO_VECTOR = {x: 0.0, y: 0.0};

/**
 * Retrieves the translation corresponding to the given transform.
 *
 * @param transform the transform of interest.
 * @return the translation vector.
 */
export function getTransformTranslation(transform: Transform): Vector2 {
  if (!transform) {
    return ZERO_VECTOR;
  }
  let translation = transform.translation;
  if (!translation) {
    transform.translation = translation = {};
  }
  if (translation.x == null) {
    translation.x = transform.matrix ? transform.matrix[6] : 0.0;
  }
  if (translation.y == null) {
    translation.y = transform.matrix ? transform.matrix[7] : 0.0;
  }
  return (translation: any);
}

/**
 * Adds two vectors, returning a new result.
 *
 * @param first the first vector to add.
 * @param second the second vector to add.
 * @return a new vector containing the result.
 */
export function plus(first: Vector2, second: Vector2): Vector2 {
  return {x: first.x + second.x, y: first.y + second.y};
}

/**
 * Adds the second vector to the first.
 *
 * @param first the vector to add to.
 * @param second the vector to add.
 * @return a reference to the first vector, for chaining.
 */
export function plusEquals(first: Vector2, second: Vector2): Vector2 {
  first.x += second.x;
  first.y += second.y;
  return first;
}

/**
 * Subtracts the second vector from the first, returning a new result.
 *
 * @param first the vector to subtract from.
 * @param second the vector to subtract.
 * @return a new vector containing the result.
 */
export function minus(first: Vector2, second: Vector2): Vector2 {
  return {x: first.x - second.x, y: first.y - second.y};
}

/**
 * Subtracts the second vector from the first.
 *
 * @param first the vector to subtract from.
 * @param second the vector to subtract.
 * @return a reference to the first vector, for chaining.
 */
export function minusEquals(first: Vector2, second: Vector2): Vector2 {
  first.x -= second.x;
  first.y -= second.y;
  return first;
}

/**
 * Multiplies a vector by a scalar, returning a new result.
 *
 * @param vector the vector to scale.
 * @param scalar the scale factor.
 * @return a new vector containing the result.
 */
export function times(vector: Vector2, scalar: number): Vector2 {
  return {x: vector.x * scalar, y: vector.y * scalar};
}

/**
 * Multiplies a vector by a scalar.
 *
 * @param vector the vector to scale.
 * @param scalar the scale factor.
 * @return a reference to the vector, for chaining.
 */
export function timesEquals(vector: Vector2, scalar: number): Vector2 {
  vector.x *= scalar;
  vector.y *= scalar;
  return vector;
}

/**
 * Computes the length of a vector.
 *
 * @param vector the vector.
 * @return the vector's length.
 */
export function length(vector: Vector2): number {
  return Math.sqrt(dot(vector, vector));
}

/**
 * Computes the distance between two points.
 *
 * @param from the source point.
 * @param to the destination point.
 * @return the distance between the points.
 */
export function distance(from: Vector2, to: Vector2): number {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  return Math.sqrt(vx * vx + vy * vy);
}

/**
 * Computes and returns the dot product of two vectors.
 *
 * @param first the first vector.
 * @param second the second vector.
 * @return the dot product.
 */
export function dot(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y;
}

/**
 * Clamps a value between a minimum and a maximum.
 *
 * @param value the value to clamp.
 * @param min the minimum boundary.
 * @param max the maximum boundary.
 * @return the clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
