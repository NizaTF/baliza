import React from 'react';

interface PixelSkullProps {
  className?: string;
}

/**
 * Calavera pixel-art de color negro (#09090B) con contorno blanco/magenta
 * para mantener máxima legibilidad sobre fondos negros u oscuros.
 */
export const PixelSkull: React.FC<PixelSkullProps> = ({
  className = 'h-6 w-6',
}) => {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${className} pixelated`}
      aria-hidden="true"
    >
      {/* Contorno pixelado claro para contraste sobre fondo negro */}
      <rect x="4" y="1" width="8" height="1" fill="#F4F4F5" />
      <rect x="3" y="2" width="1" height="1" fill="#F4F4F5" />
      <rect x="12" y="2" width="1" height="1" fill="#F4F4F5" />
      <rect x="2" y="3" width="1" height="6" fill="#F4F4F5" />
      <rect x="13" y="3" width="1" height="6" fill="#F4F4F5" />
      <rect x="3" y="9" width="1" height="2" fill="#F4F4F5" />
      <rect x="12" y="9" width="1" height="2" fill="#F4F4F5" />
      <rect x="4" y="11" width="1" height="3" fill="#F4F4F5" />
      <rect x="11" y="11" width="1" height="3" fill="#F4F4F5" />
      <rect x="5" y="14" width="6" height="1" fill="#F4F4F5" />

      {/* Relleno principal de calavera NEGRA */}
      <rect x="4" y="2" width="8" height="1" fill="#09090B" />
      <rect x="3" y="3" width="10" height="6" fill="#09090B" />
      <rect x="4" y="9" width="8" height="2" fill="#09090B" />
      <rect x="5" y="11" width="6" height="3" fill="#09090B" />

      {/* Cuencas oculares pixeladas (contraste Danganronpa) */}
      <rect x="4" y="5" width="3" height="3" fill="#FAFAFA" />
      <rect x="9" y="5" width="3" height="3" fill="#FAFAFA" />
      <rect x="5" y="6" width="1" height="1" fill="#FF1E6E" />
      <rect x="10" y="6" width="1" height="1" fill="#FF1E6E" />

      {/* Nariz pixelada */}
      <rect x="7" y="9" width="2" height="1" fill="#FAFAFA" />

      {/* Dientes inferiores pixelados */}
      <rect x="6" y="12" width="1" height="2" fill="#FAFAFA" />
      <rect x="8" y="12" width="1" height="2" fill="#FAFAFA" />
      <rect x="10" y="12" width="1" height="1" fill="#FAFAFA" />
    </svg>
  );
};

export function getPixelSkullSvgHtml(sizePx = 22): string {
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 16 16" shape-rendering="crispEdges" style="image-rendering:pixelated;display:block;">
    <rect x="4" y="1" width="8" height="1" fill="#F4F4F5"/>
    <rect x="3" y="2" width="1" height="1" fill="#F4F4F5"/>
    <rect x="12" y="2" width="1" height="1" fill="#F4F4F5"/>
    <rect x="2" y="3" width="1" height="6" fill="#F4F4F5"/>
    <rect x="13" y="3" width="1" height="6" fill="#F4F4F5"/>
    <rect x="3" y="9" width="1" height="2" fill="#F4F4F5"/>
    <rect x="12" y="9" width="1" height="2" fill="#F4F4F5"/>
    <rect x="4" y="11" width="1" height="3" fill="#F4F4F5"/>
    <rect x="11" y="11" width="1" height="3" fill="#F4F4F5"/>
    <rect x="5" y="14" width="6" height="1" fill="#F4F4F5"/>
    <rect x="4" y="2" width="8" height="1" fill="#09090B"/>
    <rect x="3" y="3" width="10" height="6" fill="#09090B"/>
    <rect x="4" y="9" width="8" height="2" fill="#09090B"/>
    <rect x="5" y="11" width="6" height="3" fill="#09090B"/>
    <rect x="4" y="5" width="3" height="3" fill="#FAFAFA"/>
    <rect x="9" y="5" width="3" height="3" fill="#FAFAFA"/>
    <rect x="5" y="6" width="1" height="1" fill="#FF1E6E"/>
    <rect x="10" y="6" width="1" height="1" fill="#FF1E6E"/>
    <rect x="7" y="9" width="2" height="1" fill="#FAFAFA"/>
    <rect x="6" y="12" width="1" height="2" fill="#FAFAFA"/>
    <rect x="8" y="12" width="1" height="2" fill="#FAFAFA"/>
  </svg>`;
}
