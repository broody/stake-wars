import * as THREE from 'three';

export const createSphereGeometry = (radius: number, detail: number) => {
  return new THREE.IcosahedronGeometry(radius, detail);
};

export const createBasicMaterial = (color: number, wireframe = false) => {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe,
    side: THREE.DoubleSide,
  });
};

export const loadTexture = (url: string): Promise<THREE.Texture> => {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
};

export const extractFacePositions = (
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): Float32Array => {
  const positions = geometry.attributes.position.array as Float32Array;
  const facePositions = new Float32Array(faceIndices.length * 9);

  let vertIdx = 0;
  for (const faceIdx of faceIndices) {
    const startIdx = faceIdx * 9;
    for (let j = 0; j < 9; j++) {
      facePositions[vertIdx + j] = positions[startIdx + j];
    }
    vertIdx += 9;
  }

  return facePositions;
};
