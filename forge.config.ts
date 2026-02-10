import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';

// sharp and its transitive production dependencies.
// Listed explicitly so devDependencies never leak into the package.
const PRODUCTION_MODULES = [
  'sharp',
  '@img',
  'color',
  'color-convert',
  'color-name',
  'color-string',
  'simple-swizzle',
  'is-arrayish',
  'detect-libc',
  'semver',
];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Dama Desktop',
    executableName: 'dama-desktop',
    icon: 'resources/icon',
    extraResource: ['python'],
    asar: {
      unpack: '**/*.node',
    },
    // Override the vite plugin's default ignore function.
    // The vite plugin only keeps .vite/ — we also need node_modules
    // for native dependencies (sharp) that are externalized by vite.
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file === '/package.json') return false;
      for (const mod of PRODUCTION_MODULES) {
        if (file.startsWith(`/node_modules/${mod}`)) return false;
      }
      return true;
    },
  },
  makers: [
    new MakerZIP({}),
    new MakerDeb({
      options: {
        maintainer: 'Dama Desktop Contributors',
        homepage: 'https://github.com/aspect-dama/dama-desktop',
        section: 'utils',
        categories: ['Utility'],
      },
    }),
    new MakerRpm({
      options: {
        homepage: 'https://github.com/aspect-dama/dama-desktop',
        categories: ['Utility'],
        license: 'MIT',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
