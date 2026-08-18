const NOBLE_ASSETS: Record<string, string> = {
  'noble-1': 'noble-1.svg',
  'noble-2': 'noble-2.svg',
  'noble-3': 'noble-3.svg',
  'noble-4': 'noble-4.svg',
  'noble-5': 'noble-5.svg',
  'noble-6': 'noble-6.svg',
  'noble-7': 'noble-7.svg',
  'noble-8': 'noble-8.svg',
  'noble-9': 'noble-9.svg',
  'noble-10': 'noble-10.svg',
};

export function nobleAssetUrl(nobleId: string): string | null {
  const asset = NOBLE_ASSETS[nobleId];
  return asset ? `/nobles/${asset}` : null;
}
