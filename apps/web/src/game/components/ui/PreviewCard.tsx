import React from 'react';
import { config } from '../../services/config';

interface PreviewCardProps {
  tokenId: number;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({ tokenId }) => {
  return (
    <div
      className="absolute top-20 right-4 w-64 h-64 bg-black border border-white text-white rounded p-2"
      style={{
        backgroundImage: `url('${config.domain}/unknowns/${tokenId}.svg')`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="absolute top-2 left-2">
        <div className="text-sm">NFT #{tokenId}</div>
      </div>
      <div className="absolute bottom-2 right-2">
        <a
          href={`${config.opensea}0xD560e04Ac70382e387BE3208741465D4FD8F36B8/${tokenId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs hover:text-primary-400 transition-colors"
        >
          opensea.io
        </a>
      </div>
    </div>
  );
};
