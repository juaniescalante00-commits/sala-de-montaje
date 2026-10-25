import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { useGsapTimeline } from '@remotion/gsap';
import { Caption, createTikTokStyleCaptions } from '@remotion/captions';

// Prueba de las librerías de motion: título con GSAP (timeline pausada, atada al cuadro) y subtítulos
// palabra por palabra con @remotion/captions. Todo dentro de la zona segura (14% arriba, 35% abajo, 10% a los lados).
const PALABRAS: Caption[] = [
  ['Editar', 400, 760], ['bien', 760, 1050], ['es', 1150, 1300], ['sacar', 1300, 1650], ['lo', 1650, 1780],
  ['que', 1780, 1950], ['sobra.', 1950, 2500], ['Lo', 2700, 2850], ['demás,', 2850, 3250], ['aire.', 3300, 3800],
].map(([w, s, e], i) => ({ text: (i ? ' ' : '') + w, startMs: s as number, endMs: e as number, timestampMs: null, confidence: 1 }));

const Titulo: React.FC = () => {
  const ref = useGsapTimeline<HTMLDivElement>(({ timeline, selector }) => {
    timeline.from(selector('.p'), { yPercent: 60, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.12 });
    timeline.from(selector('.linea'), { scaleX: 0, transformOrigin: 'left center', duration: 0.7, ease: 'power2.inOut' }, 0.3);
  });
  return (
    <div ref={ref} style={{ position: 'absolute', left: 108, top: 330, color: '#f2f0ea' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 92, lineHeight: 1.05, letterSpacing: -1 }}>
        {['Sala', 'de', 'Montaje'].map((p) => (
          <span key={p} style={{ display: 'inline-block', overflow: 'hidden', marginRight: 22 }}>
            <span className="p" style={{ display: 'inline-block' }}>{p}</span>
          </span>
        ))}
      </div>
      <div className="linea" style={{ marginTop: 28, width: 240, height: 2, background: '#c9a46a' }} />
    </div>
  );
};

const Subtitulos: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions: PALABRAS, combineTokensWithinMilliseconds: 900 }), []);
  const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);
  if (!page) return null;
  return (
    <div style={{ position: 'absolute', left: 108, right: 108, top: 1080, textAlign: 'center', fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: 64, fontWeight: 600, whiteSpace: 'pre', textShadow: '0 2px 12px rgba(0,0,0,.5)' }}>
      {page.tokens.map((t) => (
        <span key={t.fromMs} style={{ color: ms >= t.fromMs ? '#ffffff' : 'rgba(255,255,255,.45)' }}>{t.text}</span>
      ))}
    </div>
  );
};

export const PruebaMotion: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#0e0e0e' }}>
    <Titulo />
    <Subtitulos />
  </AbsoluteFill>
);
