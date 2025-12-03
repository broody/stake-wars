import * as THREE from 'three';

export interface NFTMetadata {
  tokenId: number;
  owner?: string;
  isMinted: boolean;
  hasArt: boolean;
}

export interface ArtData {
  _id: string;
  ownerId: string;
  tokenIds: number[];
  image: string;
  name?: string;
  cameraPos?: string;
  cameraUp?: string;
  cameraAspect?: number;
}

export interface MintedData {
  minted: number[];
}

export interface OwnerData {
  owned: number[];
}

export interface FaceMesh extends THREE.Mesh {
  faceIdx: number;
  isMinted: boolean;
  hasArt: boolean;
}

export interface ArtMesh extends THREE.Mesh {
  address: string;
  artId: string;
  selected: boolean;
}

export interface AppState {
  uploadArtMode: boolean;
  showMintOption: boolean;
  isMinting: boolean;
  isUploading: boolean;
  isCommitting: boolean;
  isImageLoaded: boolean;
  previewId: number;
}

export interface NFTState {
  selectedFaces: number[];
  ownedFaces: number[];
  totalMinted: number;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
}

export const UKN_RES = 65536;
export const MAX_SELECTION = 10;
export const TOTAL_FACES = 2000;
