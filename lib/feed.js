// Live corner feed from API-Football (api-sports.io). Corners come from the fixture's
// "Corner Kicks" statistic, a running total per team that updates about once a minute.
// MOCK_FEED=1 simulates a match (one corner every ~20 seconds, full time after 4 minutes).

const BASE = 'https://v3.football.api-sports.io';
const PREMIER_LEAGUE = 39;
const MOCK = process.env.MOCK_FEED === '1';

async function call(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': key } });
  if (!r.ok) throw new Error(`API-Football error ${r.status}`);
  const body = await r.json();
  const errs = body.errors && Object.values(body.errors);
  if (errs?.length) throw new Error(`API-Football: ${errs.join(', ')}`);
  return body.response;
}

// Premier League seasons are named by the year they start (2026-27 is 2026).
function season(date) {
  const d = new Date(date);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export async function fixturesOn(date) {
  if (MOCK) {
    return [{ id: 'mock1', label: 'Arsenal v Chelsea (simulated)', home: 'Arsenal', away: 'Chelsea', kickoff: new Date().toISOString(), status: 'NS' }];
  }
  const res = await call(`/fixtures?league=${PREMIER_LEAGUE}&season=${season(date)}&date=${date}&timezone=Europe/London`);
  return res.map((f) => ({
    id: String(f.fixture.id),
    label: `${f.teams.home.name} v ${f.teams.away.name}`,
    home: f.teams.home.name,
    away: f.teams.away.name,
    kickoff: f.fixture.date,
    status: f.fixture.status.short,
  }));
}

// The league's team names this season, for players to pick the teams they follow.
export async function teamsIn(date = new Date().toISOString().slice(0, 10)) {
  if (MOCK) return ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Tottenham'];
  const res = await call(`/teams?league=${PREMIER_LEAGUE}&season=${season(date)}`);
  return res.map((t) => t.team.name).sort();
}

export async function cornersFor(fixtureId, startedAt) {
  if (MOCK) {
    const secs = (Date.now() - startedAt) / 1000;
    const corners = Math.floor(secs / 20);
    const teams = [{ name: 'Arsenal', corners: Math.ceil(corners / 2) }, { name: 'Chelsea', corners: Math.floor(corners / 2) }];
    return { corners, status: secs > 240 ? 'FT' : '1H', minute: `${Math.min(90, Math.floor((secs / 240) * 90))}'`, teams };
  }
  const [f] = await call(`/fixtures?id=${encodeURIComponent(fixtureId)}`);
  if (!f) throw new Error('Match not found');
  let corners = 0;
  const teams = [];
  for (const team of f.statistics || []) {
    const stat = team.statistics.find((s) => s.type === 'Corner Kicks');
    const n = Number(stat?.value) || 0;
    corners += n;
    teams.push({ name: team.team?.name || '', corners: n });
  }
  // "45+2'" in stoppage time
  const { elapsed, extra } = f.fixture.status;
  const minute = elapsed != null ? `${elapsed}${extra ? `+${extra}` : ''}'` : undefined;
  return { corners, status: f.fixture.status.short, minute, teams };
}
