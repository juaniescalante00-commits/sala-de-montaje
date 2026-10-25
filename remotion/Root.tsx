import React from 'react';
import { Composition } from 'remotion';
import { Prueba } from './Prueba';
import { PruebaMotion } from './PruebaMotion';
import { InsertoTexto } from './InsertoTexto';

// Lienzo de la Sala: 1080x1920 a 30 fps. Cada pieza nueva se suma acá como otra <Composition>.
export const Root: React.FC = () => (
  <>
    <Composition id="Prueba" component={Prueba} durationInFrames={60} fps={30} width={1080} height={1920}
      defaultProps={{ texto: 'Sala de Montaje' }} />
    <Composition id="PruebaMotion" component={PruebaMotion} durationInFrames={120} fps={30} width={1080} height={1920} />
    {/* Insertos para la Sala: fondo transparente, se renderizan con alfa (ver InsertoTexto.tsx) */}
    <Composition id="InsertoTexto" component={InsertoTexto} durationInFrames={75} fps={30} width={1080} height={1920}
      defaultProps={{ texto: 'Nadie te cuenta esto', y: 0.3, color: '#ffffff', acento: '#ffd400' }} />
  </>
);
