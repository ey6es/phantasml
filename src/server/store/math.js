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
 * Adds a source vector to a destination vector.
 *
 * @param dest the vector to modify.
 * @param soure the vector to add.
 * @return a reference to the destination vector, for chaining.
 */
export function addToVector(dest: Vector2, source: Vector2): Vector2 {
  dest.x += source.x;
  dest.y += source.y;
  return dest;
}

/**
 * Multiplies a vector by a scalar.
 *
 * @param dest the vector to modify.
 * @param scale the scale factor.
 * @return a reference to the destination vector, for chaining.
 */
export function scaleVector(dest: Vector2, scale: number): Vector2 {
  dest.x *= scale;
  dest.y *= scale;
  return dest;
}
