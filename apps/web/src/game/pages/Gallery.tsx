import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loading } from '../components/ui/Loading';
import type { ArtData } from '../types';
import { PageTitle, Panel, PanelSection } from '../../ui';

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
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="mx-auto max-w-7xl px-4 py-20">
        <PageTitle className="mb-8">Art Gallery</PageTitle>

        {artworks.length === 0 ? (
          <p className="py-20 text-center text-body text-fg-muted">
            No artworks have been uploaded yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {artworks.map((art) => (
              <Panel
                as="article"
                key={art._id}
                className="overflow-hidden transition-colors hover:border-fg"
              >
                <div className="relative aspect-square border-b border-line">
                  <img
                    src={art.image}
                    alt={art.name || `Art #${art._id}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <PanelSection>
                  <h3 className="mb-2 text-body text-fg">
                    {art.name || `Artwork #${art._id}`}
                  </h3>
                  <p className="text-caption text-fg-muted">
                    {art.sectorIds.length} Sector
                    {art.sectorIds.length !== 1 ? 's' : ''}
                  </p>
                  <p className="mt-1 text-caption tabular-nums text-fg-subtle">
                    Operator: {art.ownerId.slice(0, 6)}...
                    {art.ownerId.slice(-4)}
                  </p>
                </PanelSection>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
