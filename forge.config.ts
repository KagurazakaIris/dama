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
  'onnxruntime-node',
  'onnxruntime-common',
];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Dama Desktop',
    executableName: 'dama-desktop',
    icon: 'resources/icon',
    asar: {
      // Unpack all native modules and their dependencies so that .node, .dll,
      // .so files are on the real filesystem where the OS dynamic linker can
      // load them, and JS dependencies can be resolved without cross-boundary issues.
      unpackDir: 'node_modules',
    },
  },
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const projectRoot = process.cwd();
      const srcModules = path.join(projectRoot, 'node_modules');
      const destModules = path.join(buildPath, 'node_modules');

      console.log('[forge hook] packageAfterPrune start');
      console.log('[forge hook] projectRoot:', projectRoot);
      console.log('[forge hook] buildPath:', buildPath);
      console.log('[forge hook] srcModules exists:', fs.existsSync(srcModules));

      fs.mkdirSync(destModules, { recursive: true });

      for (const mod of NATIVE_MODULES) {
        const src = path.join(srcModules, mod);
        const dest = path.join(destModules, mod);
        const exists = fs.existsSync(src);
        if (exists) {
          fs.cpSync(src, dest, { recursive: true });
          console.log(`[forge hook] copied: ${mod}`);
        } else {
          console.warn(`[forge hook] MISSING: ${mod} (${src})`);
        }
      }

      // Verify critical modules were copied
      const sharpDest = path.join(destModules, 'sharp', 'package.json');
      const imgDest = path.join(destModules, '@img');
      console.log('[forge hook] sharp/package.json exists in dest:', fs.existsSync(sharpDest));
      console.log('[forge hook] @img exists in dest:', fs.existsSync(imgDest));
      if (fs.existsSync(imgDest)) {
        console.log('[forge hook] @img contents:', fs.readdirSync(imgDest).join(', '));
      }

      // Strip non-current-platform binaries from onnxruntime-node to reduce size
      const ortBinDir = path.join(destModules, 'onnxruntime-node', 'bin');
      if (fs.existsSync(ortBinDir)) {
        const plat = process.platform;
        const arch = process.arch;
        const walk = (dir: string, depth: number): void => {
          if (depth > 3) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const full = path.join(dir, entry.name);
            // At napi-v*/platform level: remove other platforms
            if (depth === 1 && entry.name !== plat) {
              fs.rmSync(full, { recursive: true });
              console.log(`[forge hook] ort: removed ${entry.name} (not ${plat})`);
              continue;
            }
            // At napi-v*/platform/arch level: remove other archs
            if (depth === 2 && entry.name !== arch) {
              fs.rmSync(full, { recursive: true });
              console.log(`[forge hook] ort: removed ${plat}/${entry.name} (not ${arch})`);
              continue;
            }
            walk(full, depth + 1);
          }
        };
        walk(ortBinDir, 0);
      }
      // Remove install scripts (not needed at runtime)
      const ortScriptDir = path.join(destModules, 'onnxruntime-node', 'script');
      if (fs.existsSync(ortScriptDir)) {
        fs.rmSync(ortScriptDir, { recursive: true });
      }

      console.log('[forge hook] packageAfterPrune done');
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
