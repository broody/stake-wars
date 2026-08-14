import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loading } from '../components/ui/Loading';
import type { ArtData } from '../types';

export const Gallery: React.FC = () => {
  const [artworks, setArtworks] = useState<ArtData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        const arts = await api.getArt();
        setArtworks(arts);
      } catch (error) {
        console.error('Failed to load artworks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtworks();
  }, []);

  if (loading) {
    return <Loading message="Loading gallery..." />;
  }

  return (
    <div className="w-full h-full bg-gray-900 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Art Gallery</h1>

        {artworks.length === 0 ? (
          <div className="text-gray-400 text-center py-20">
            No artworks have been uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {artworks.map((art) => (
              <div
                key={art._id}
                className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="aspect-square relative">
                  <img
                    src={art.image}
                    alt={art.name || `Art #${art._id}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-white font-semibold mb-2">
                    {art.name || `Artwork #${art._id}`}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {art.controlPointIds.length} Control Point
                    {art.controlPointIds.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Operator: {art.ownerId.slice(0, 6)}...
                    {art.ownerId.slice(-4)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
