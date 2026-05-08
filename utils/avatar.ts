type AvatarPalette = { bg: string; fg: string };

const PALETTE: AvatarPalette[] = [
  { bg: '#e6dcc6', fg: '#3d362a' },
  { bg: '#d8d2c2', fg: '#2f2c24' },
  { bg: '#dcd4e0', fg: '#3a2f4a' },
  { bg: '#d4dcc8', fg: '#2e3826' },
  { bg: '#e2cfc8', fg: '#42302a' },
  { bg: '#cdd6d8', fg: '#28333a' },
  { bg: '#e0d3c0', fg: '#3e3322' },
  { bg: '#cfd0d6', fg: '#2c2e3a' },
];

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickPalette(name: string): AvatarPalette {
  return PALETTE[nameHash(name) % PALETTE.length];
}

export function getMonogram(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
