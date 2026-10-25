// Configuración de la CLI de Remotion. Nunca se pasa licenseKey: así no se manda ningún aviso de uso a remotion.pro.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// 3D con @remotion/three: el renderer angle de Chromium es el que pide Remotion para WebGL.
Config.setChromiumOpenGlRenderer('angle');
// Chrome propio si está (en la nube: REMOTION_CHROME=/opt/pw-browsers/chromium_headless_shell-…); si no, Remotion baja el suyo.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
