import React from 'react';

interface LoadingProps {
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
      <p className="mt-4 text-white text-lg">{message}</p>
    </div>
  );
};
