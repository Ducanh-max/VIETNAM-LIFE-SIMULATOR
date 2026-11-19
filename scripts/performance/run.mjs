import { build, preview } from 'vite';
import { appendFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run against a checkout with its normal pnpm dependencies installed.
const root = resolve(process.argv[2] || '.');
const parent = join(root, 'heritage-work');
await mkdir(parent, { recursive: true });
const folder = await mkdtemp(join(parent, 'gpu-profile-'));
const outDir = join(folder, 'dist');
const probe = fileURLToPath(new URL('./ProfileScene.tsx', import.meta.url)).replaceAll('\\', '/');
const port = 4185;
const plugin = {
  name: 'bridge-benchmark',
  enforce: 'pre',
  transform(source, id) {
    if (id.replaceAll('\\', '/') !== join(root, 'src/App.tsx').replaceAll('\\', '/')) return;
    const quality = "useState<Quality>('high')";
    const landscape = '<Landscape time={time} />';
    if (!source.includes(quality) || !source.includes(landscape)) throw Error('Unrecognized scene entry point');
    return "import { ProfileScene, benchQuality } from " + JSON.stringify(probe) + ";\n" +
      source.replace(quality, 'useState<Quality>(benchQuality)').replace(landscape, '<ProfileScene />' + landscape);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/result', async (request, response) => {
      if (request.method !== 'POST' || request.headers.origin !== 'http://127.0.0.1:' + port) {
        response.writeHead(403).end();
        return;
      }
      let body = '';
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 8192) throw Error('Large payload');
        }
        const sample = JSON.parse(body);
        if (!(sample.seconds >= 30 && sample.frames > 0)) throw Error('Incomplete sample');
        await appendFile(join(folder, 'results.jsonl'), JSON.stringify(sample) + '\n');
        console.log(sample.step, sample.fps.toFixed(2), 'FPS');
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  },
};
const config = { root, plugins: [plugin], build: { outDir } };
await build(config);
await preview({ ...config, preview: { host: '127.0.0.1', port, strictPort: true } });
console.log('Open http://127.0.0.1:' + port + '/?run=before#play for all eight trials; Ctrl+C to stop.');
console.log('Results: ' + join(folder, 'results.jsonl'));
