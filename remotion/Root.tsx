import React from 'react';
import { Composition } from 'remotion';
import { Prueba } from './Prueba';

// Lienzo de la Sala: 1080x1920 a 30 fps. Cada pieza nueva se suma acá como otra <Composition>.
export const Root: React.FC = () => (
  <>
    <Composition id="Prueba" component={Prueba} durationInFrames={60} fps={30} width={1080} height={1920}
      defaultProps={{ texto: 'Sala de Montaje' }} />
  </>
);
