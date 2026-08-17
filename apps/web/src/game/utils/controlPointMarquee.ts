import * as THREE from 'three';
import {
  CONTROL_POINT_COUNT,
  extractControlPointPositions,
} from './controlPointGeometry';

export interface ScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const VALUES_PER_CONTROL_POINT = 9;
const ALL_CONTROL_POINT_POSITIONS = extractControlPointPositions(
  Array.from({ length: CONTROL_POINT_COUNT }, (_, id) => id)
);

function pointIsInBounds(point: ScreenPoint, bounds: ScreenBounds): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function signedTriangleArea(
  point: ScreenPoint,
  first: ScreenPoint,
  second: ScreenPoint
): number {
  return (
    (point.x - second.x) * (first.y - second.y) -
    (first.x - second.x) * (point.y - second.y)
  );
}

function pointIsInTriangle(
  point: ScreenPoint,
  [first, second, third]: ScreenPoint[]
): boolean {
  const firstArea = signedTriangleArea(point, first, second);
  const secondArea = signedTriangleArea(point, second, third);
  const thirdArea = signedTriangleArea(point, third, first);
  const hasNegativeArea = firstArea < 0 || secondArea < 0 || thirdArea < 0;
  const hasPositiveArea = firstArea > 0 || secondArea > 0 || thirdArea > 0;

  return !(hasNegativeArea && hasPositiveArea);
}

function orientation(
  first: ScreenPoint,
  second: ScreenPoint,
  third: ScreenPoint
): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function segmentsIntersect(
  firstStart: ScreenPoint,
  firstEnd: ScreenPoint,
  secondStart: ScreenPoint,
  secondEnd: ScreenPoint
): boolean {
  const onSegment = (
    point: ScreenPoint,
    start: ScreenPoint,
    end: ScreenPoint
  ) =>
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y);
  const firstSide = orientation(firstStart, firstEnd, secondStart);
  const secondSide = orientation(firstStart, firstEnd, secondEnd);
  const thirdSide = orientation(secondStart, secondEnd, firstStart);
  const fourthSide = orientation(secondStart, secondEnd, firstEnd);

  if (
    ((firstSide > 0 && secondSide < 0) || (firstSide < 0 && secondSide > 0)) &&
    ((thirdSide > 0 && fourthSide < 0) || (thirdSide < 0 && fourthSide > 0))
  ) {
    return true;
  }

  return (
    (firstSide === 0 && onSegment(secondStart, firstStart, firstEnd)) ||
    (secondSide === 0 && onSegment(secondEnd, firstStart, firstEnd)) ||
    (thirdSide === 0 && onSegment(firstStart, secondStart, secondEnd)) ||
    (fourthSide === 0 && onSegment(firstEnd, secondStart, secondEnd))
  );
}

function triangleIntersectsBounds(
  triangle: ScreenPoint[],
  bounds: ScreenBounds
): boolean {
  if (triangle.some((point) => pointIsInBounds(point, bounds))) return true;

  const corners: ScreenPoint[] = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];

  if (corners.some((point) => pointIsInTriangle(point, triangle))) return true;

  return triangle.some((start, triangleIndex) => {
    const end = triangle[(triangleIndex + 1) % triangle.length];
    return corners.some((corner, cornerIndex) =>
      segmentsIntersect(
        start,
        end,
        corner,
        corners[(cornerIndex + 1) % corners.length]
      )
    );
  });
}

export function getControlPointIdsInScreenBounds(
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  bounds: ScreenBounds,
  excludedControlPointIds?: ReadonlySet<number>
): number[] {
  camera.updateMatrixWorld(true);
  const selectedControlPointIds: number[] = [];
  const worldVertex = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  for (
    let controlPointId = 0;
    controlPointId < CONTROL_POINT_COUNT;
    controlPointId += 1
  ) {
    if (excludedControlPointIds?.has(controlPointId)) continue;

    const offset = controlPointId * VALUES_PER_CONTROL_POINT;
    centroid.set(0, 0, 0);
    const triangle: ScreenPoint[] = [];

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + vertex * 3;
      worldVertex.set(
        ALL_CONTROL_POINT_POSITIONS[vertexOffset],
        ALL_CONTROL_POINT_POSITIONS[vertexOffset + 1],
        ALL_CONTROL_POINT_POSITIONS[vertexOffset + 2]
      );
      centroid.add(worldVertex);

      const projected = worldVertex.clone().project(camera);
      triangle.push({
        x: ((projected.x + 1) / 2) * viewport.width,
        y: ((1 - projected.y) / 2) * viewport.height,
      });
    }

    centroid.divideScalar(3);
    toCamera.copy(camera.position).sub(centroid);

    // The Core is convex, so a face is visible when its outward radial normal
    // points toward the camera. This prevents selecting points on the far side.
    if (
      centroid.dot(toCamera) > 0 &&
      triangleIntersectsBounds(triangle, bounds)
    ) {
      selectedControlPointIds.push(controlPointId);
    }
  }

  return selectedControlPointIds;
}
