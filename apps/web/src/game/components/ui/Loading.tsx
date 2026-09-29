import React from 'react';
import { Spinner } from '../../../ui';

interface LoadingProps {
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-surface font-mono">
      <Spinner className="h-8 w-8 text-fg" />
      <p className="mt-4 text-caption text-fg-muted">{message}</p>
    </div>
  );
};
