import React from 'react';

interface IconProps {
  className?: string;
}

/**
 * Icono pixel-art oficial de Baliza: bandera/radar pixelado amigable estilo retro.
 */
export const PixelBalizaMark: React.FC<IconProps> = ({ className = 'h-8 w-8' }) => (
  <svg
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    className={`${className} pixelated`}
    aria-hidden="true"
  >
    <rect x="2" y="1" width="12" height="14" fill="#09090B" />
    <rect x="3" y="2" width="10" height="12" fill="#FFFFFF" />
    {/* Mástil */}
    <rect x="5" y="4" width="1" height="9" fill="#09090B" />
    <rect x="4" y="12" width="4" height="1" fill="#09090B" />
    {/* Bandera magenta/turquesa Danganronpa */}
    <rect x="6" y="4" width="6" height="4" fill="#FF1E6E" />
    <rect x="7" y="5" width="3" height="2" fill="#FACC15" />
    {/* Onda verde */}
    <rect x="9" y="10" width="2" height="2" fill="#059669" />
  </svg>
);

export const PixelCrown: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    className={`${className} pixelated`}
    aria-hidden="true"
  >
    <rect x="2" y="4" width="2" height="7" fill="#09090B" />
    <rect x="7" y="3" width="2" height="8" fill="#09090B" />
    <rect x="12" y="4" width="2" height="7" fill="#09090B" />
    <rect x="2" y="10" width="12" height="3" fill="#09090B" />
    <rect x="3" y="5" width="1" height="6" fill="#FACC15" />
    <rect x="7" y="4" width="2" height="7" fill="#FACC15" />
    <rect x="12" y="5" width="1" height="6" fill="#FACC15" />
    <rect x="4" y="8" width="8" height="3" fill="#FACC15" />
    <rect x="5" y="10" width="2" height="1" fill="#FF1E6E" />
    <rect x="9" y="10" width="2" height="1" fill="#00C2A8" />
  </svg>
);

export const PixelStar: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    className={`${className} pixelated`}
    aria-hidden="true"
  >
    <rect x="7" y="1" width="2" height="14" fill="#09090B" />
    <rect x="1" y="6" width="14" height="3" fill="#09090B" />
    <rect x="4" y="4" width="8" height="8" fill="#09090B" />
    <rect x="7" y="2" width="2" height="11" fill="#FACC15" />
    <rect x="2" y="7" width="12" height="1" fill="#FACC15" />
    <rect x="5" y="5" width="6" height="6" fill="#FACC15" />
    <rect x="7" y="6" width="2" height="2" fill="#FFFFFF" />
  </svg>
);

export const PixelGamepad: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    className={`${className} pixelated`}
    aria-hidden="true"
  >
    <rect x="2" y="4" width="12" height="8" fill="#09090B" />
    <rect x="1" y="5" width="14" height="6" fill="#09090B" />
    <rect x="3" y="5" width="10" height="6" fill="#FFFFFF" />
    {/* Cruceta */}
    <rect x="4" y="7" width="3" height="1" fill="#09090B" />
    <rect x="5" y="6" width="1" height="3" fill="#09090B" />
    {/* Botones */}
    <rect x="10" y="6" width="2" height="2" fill="#FF1E6E" />
    <rect x="9" y="8" width="2" height="2" fill="#059669" />
  </svg>
);
