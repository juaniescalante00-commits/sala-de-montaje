import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { useGsapTimeline } from '@remotion/gsap';

// Inserto para la Sala: título por palabras con GSAP (timeline atada al cuadro), FONDO TRANSPARENTE.
// Se renderiza con alfa y se convierte al formato de la pieza "inserto" (ver tools/a_inserto.sh y docs/EDITOR.md):
//   npx remotion render remotion/index.ts InsertoTexto out.mov --codec=prores --prores-profile=4444 \
//     --pixel-format=yuva444p10le --image-format=png --props='{"texto":"…","y":0.3}'
//   sh tools/a_inserto.sh out.mov inserto.mp4
// y: centro vertical (0 arriba, 1 abajo); zona segura: 0.14 a 0.65. La duración se pasa con --frames o durationInFrames.
export type InsertoTextoProps = { texto: string; y: number; color: string; acento: string };

export const InsertoTexto: React.FC<InsertoTextoProps> = ({ texto, y, color, acento }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const dur = durationInFrames / fps;
  const ref = useGsapTimeline<HTMLDivElement>(({ timeline, selector }) => {
    timeline.fromTo(selector('.p'), { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: 'expo.out', stagger: 0.06 }, 0);
    timeline.fromTo(selector('.linea'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out' }, 0.25);
    timeline.to(selector('.p'), { yPercent: -110, duration: 0.3, ease: 'power3.in', stagger: 0.02 }, Math.max(0.9, dur - 0.45));
    timeline.to(selector('.linea'), { scaleX: 0, duration: 0.25, ease: 'power3.in' }, Math.max(0.9, dur - 0.45));
  });
  return (
    <AbsoluteFill>
      <div ref={ref} style={{ position: 'absolute', left: 108, right: 108, top: `${y * 100}%`, transform: 'translateY(-50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSize: 96, lineHeight: 1.02, letterSpacing: '-0.035em', color }}>
          {texto.split(/\s+/).map((p, i) => (
            <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0 0.08em 0.12em' }}>
              <span className="p" style={{ display: 'inline-block', textShadow: '0 4px 30px rgba(0,0,0,.35)' }}>{p}</span>
            </span>
          ))}
        </div>
        <div className="linea" style={{ margin: '28px auto 0', width: 160, height: 10, borderRadius: 5, background: acento }} />
      </div>
    </AbsoluteFill>
  );
};
