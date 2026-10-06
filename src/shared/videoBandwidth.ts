export type ChromaFormat = 'rgb-444' | 'ycbcr-444' | 'ycbcr-422' | 'ycbcr-420';

export interface VideoBandwidthInput {
  width: number;
  height: number;
  refreshRate: number;
  bitsPerComponent: 8 | 10 | 12;
  chroma: ChromaFormat;
  blankingPercent: number;
  dscRatio: 1 | 2 | 2.5 | 3;
}

export interface VideoInterfaceMode {
  id: string;
  family: 'HDMI' | 'DisplayPort';
  label: string;
  rawGbps: number;
  payloadGbps: number;
  note?: string;
}

export const VIDEO_INTERFACE_MODES: VideoInterfaceMode[] = [
  { id: 'hdmi-1.4', family: 'HDMI', label: 'HDMI 1.4b (TMDS)', rawGbps: 10.2, payloadGbps: 8.16 },
  { id: 'hdmi-2.0', family: 'HDMI', label: 'HDMI 2.0 / 2.1 TMDS', rawGbps: 18, payloadGbps: 14.4 },
  { id: 'hdmi-2.1', family: 'HDMI', label: 'HDMI 2.1 FRL 48G', rawGbps: 48, payloadGbps: 42.67 },
  {
    id: 'hdmi-2.2',
    family: 'HDMI',
    label: 'HDMI 2.2 Ultra96',
    rawGbps: 96,
    payloadGbps: 85.33
  },
  { id: 'dp-1.1', family: 'DisplayPort', label: 'DisplayPort 1.1 HBR', rawGbps: 10.8, payloadGbps: 8.64 },
  { id: 'dp-1.2', family: 'DisplayPort', label: 'DisplayPort 1.2 HBR2', rawGbps: 21.6, payloadGbps: 17.28 },
  { id: 'dp-1.4', family: 'DisplayPort', label: 'DisplayPort 1.3/1.4 HBR3', rawGbps: 32.4, payloadGbps: 25.92 },
  { id: 'dp-2.1-10', family: 'DisplayPort', label: 'DisplayPort 2.0/2.1 UHBR10', rawGbps: 40, payloadGbps: 38.79 },
  { id: 'dp-2.1-13.5', family: 'DisplayPort', label: 'DisplayPort 2.1 UHBR13.5', rawGbps: 54, payloadGbps: 52.36 },
  { id: 'dp-2.1-20', family: 'DisplayPort', label: 'DisplayPort 2.1 UHBR20', rawGbps: 80, payloadGbps: 77.58 }
];

export function bitsPerPixel(chroma: ChromaFormat, bitsPerComponent: number): number {
  if (chroma === 'ycbcr-422') return bitsPerComponent * 2;
  if (chroma === 'ycbcr-420') return bitsPerComponent * 1.5;
  return bitsPerComponent * 3;
}

export function calculateVideoBandwidth(input: VideoBandwidthInput): {
  uncompressedGbps: number;
  requiredGbps: number;
  bitsPerPixel: number;
} {
  const bpp = bitsPerPixel(input.chroma, input.bitsPerComponent);
  const activeGbps = input.width * input.height * input.refreshRate * bpp / 1_000_000_000;
  const uncompressedGbps = activeGbps * (1 + input.blankingPercent / 100);
  return {
    bitsPerPixel: bpp,
    uncompressedGbps,
    requiredGbps: uncompressedGbps / input.dscRatio
  };
}

