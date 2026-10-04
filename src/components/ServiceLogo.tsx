import React, { useState } from 'react';
import { getRealBrandLogoUrl } from '@/lib/brand/logos';

export interface ServiceLogoProps {
  name: string;
  category?: string;
  imageUrl?: string;
  logoUrl?: string; // alias
  size?: 'sm' | 'md' | 'lg' | string;
  className?: string;
}

/**
 * Displays the authentic real brand logo image for each digital service.
 * Loads directly from official verified domain favicons / CDN assets.
 */
export const ServiceLogo: React.FC<ServiceLogoProps> = ({ 
  name, 
  imageUrl,
  logoUrl: propLogoUrl,
  size,
  className,
}) => {
  const [hasError, setHasError] = useState(false);
  const logoUrl = imageUrl || propLogoUrl || getRealBrandLogoUrl(name);
  const initialLetter = name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || 'S';

  const defaultSizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  const resolvedClass = className || defaultSizeClass;

  return (
    <div className={`${resolvedClass} relative rounded-xl overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 p-1 flex items-center justify-center shrink-0 shadow-xs`}>
      {!hasError ? (
        <img
          src={logoUrl}
          alt={name}
          loading="lazy"
          className="w-full h-full object-contain rounded-lg"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-bold text-xs font-mono text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-700 rounded-lg">
          {initialLetter}
        </div>
      )}
    </div>
  );
};
