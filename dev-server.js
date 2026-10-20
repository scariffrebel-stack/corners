// Local server for trying the app: `MOCK_FEED=1 npm run dev`, then open http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const routes = {
  '/api/state': (await import('./api/state.js')).default,
  '/api/action': (await import('./api/action.js')).default,
  '/api/fixtures': (await import('./api/fixtures.js')).default,
  '/api/group': (await import('./api/group.js')).default,
  '/api/teams': (await import('./api/teams.js')).default,
  '/api/cron': (await import('./api/cron.js')).default,
};

const port = Number(process.env.PORT) || 3000;
http
  .createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (routes[path]) return routes[path](req, res);
    if (path === '/sw.js' || path === '/icon.svg') {
      res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'image/svg+xml');
      return res.end(await readFile(new URL('.' + path, import.meta.url)));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(await readFile(new URL('./index.html', import.meta.url)));
  })
  .listen(port, () => console.log(`Corners App on http://localhost:${port}`));
