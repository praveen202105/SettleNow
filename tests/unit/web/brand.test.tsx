import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '../../../apps/web/src/components/brand/BrandMark';

const publicAsset = (name: string) => resolve(process.cwd(), 'public', name);

describe('SettleFlow branding', () => {
  it('renders the shared mark as decorative SVG', () => {
    const { container } = render(<BrandMark />);
    const mark = container.querySelector('svg');

    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveAttribute('viewBox', '0 0 48 48');
  });

  it('publishes valid manifest icon sizes', () => {
    const manifest = JSON.parse(readFileSync(publicAsset('site.webmanifest'), 'utf8')) as {
      icons: Array<{ sizes: string; src: string }>;
    };

    expect(manifest.icons).toEqual([
      expect.objectContaining({ sizes: '192x192', src: '/app-icon-192.png' }),
      expect.objectContaining({ sizes: '512x512', src: '/app-icon-512.png' }),
    ]);

    for (const { sizes, src } of manifest.icons) {
      const png = readFileSync(publicAsset(src.slice(1)));
      const expected = Number(sizes.split('x')[0]);
      expect(png.readUInt32BE(16)).toBe(expected);
      expect(png.readUInt32BE(20)).toBe(expected);
    }
  });
});
