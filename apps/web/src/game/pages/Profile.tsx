import React from 'react';
import { useNFT } from '../contexts/NFTContext';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import { WalletButton } from '../components/ui/WalletButton';

export const Profile: React.FC = () => {
  const { ownedFaces } = useNFT();
  const { isConnected, address, username, walletName } = useWallet();

  if (!isConnected) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-400 mb-6">
            Connect your wallet to view your NFT collection
          </p>
          <div className="inline-block">
            <WalletButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">My Collection</h1>
          <p className="text-gray-400">
            {walletName || 'Wallet'}:{' '}
            {username ||
              (address
                ? `${address.slice(0, 6)}...${address.slice(-4)}`
                : 'Not connected')}
          </p>
        </div>

        {ownedFaces.length === 0 ? (
          <div className="text-gray-400 text-center py-20">
            <p className="text-xl mb-4">You don't own any NFTs yet</p>
            <p>Visit the home page to mint some!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {ownedFaces.map((tokenId) => (
              <div
                key={tokenId}
                className="bg-gray-800 rounded-lg p-4 hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="aspect-square mb-2 flex items-center justify-center bg-gray-700 rounded">
                  <img
                    src={`${config.domain}/unknowns/${tokenId}.svg`}
                    alt={`NFT #${tokenId}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-center">
                  <p className="text-white font-semibold">#{tokenId}</p>
                  <a
                    href={`${config.opensea}0xD560e04Ac70382e387BE3208741465D4FD8F36B8/${tokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    View on OpenSea
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
