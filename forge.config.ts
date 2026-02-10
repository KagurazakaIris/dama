import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import path from 'path';
import fs from 'fs';

// sharp and its transitive production dependencies.
// Copied explicitly because the vite plugin's default ignore function
// excludes node_modules (it assumes everything is bundled by vite).
const NATIVE_MODULES = [
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
  },
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const projectRoot = process.cwd();
      const srcModules = path.join(projectRoot, 'node_modules');
      const destModules = path.join(buildPath, 'node_modules');

      fs.mkdirSync(destModules, { recursive: true });

      for (const mod of NATIVE_MODULES) {
        const src = path.join(srcModules, mod);
        const dest = path.join(destModules, mod);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
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
