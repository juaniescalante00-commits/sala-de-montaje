import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

// Prueba mínima: un título que entra subiendo y con fundido. Movimiento manejado por cuadro (HARD-RULES 15).
export const Prueba: React.FC<{ texto: string }> = ({ texto }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, 18], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: '#0e0e0e', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ color: '#f2f0ea', fontFamily: 'Georgia, serif', fontSize: 96, letterSpacing: -1,
        opacity: t, transform: `translateY(${(1 - t) * 60}px)` }}>{texto}</div>
    </AbsoluteFill>
  );
};
