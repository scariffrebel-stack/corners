// The morning reminder: each phone gets at most one alert, naming today's matches for the teams
// its player follows, and any tournament of theirs with a match day today.
export function morningAlerts(state, fixtures, today) {
  const tournaments = Object.values(state.competitions)
    .filter((c) => c.kind === 'tournament' && c.status === 'open' && c.from <= today && c.to >= today);
  const time = (iso) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso));
  const out = [];
  for (const { pid, sub } of Object.values(state.subs || {})) {
    const p = state.players[pid];
    if (!p) continue;
    const follows = new Set(p.teams || []);
    const games = fixtures.filter((f) => follows.has(f.home) || follows.has(f.away));
    if (!games.length && !tournaments.length) continue;
    const lines = games.map((f) => `${f.label} at ${time(f.kickoff)}`);
    const title = games.length
      ? `${games.length === 1 ? games[0].label : `${games.length} of your teams play`} today`
      : `${tournaments[0].name}: match day`;
    const body = [
      games.length > 1 ? `${lines.join(', ')}.` : games.length ? `Kick-off ${time(games[0].kickoff)}.` : '',
      tournaments.length && games.length ? `${tournaments.map((c) => c.name).join(', ')} is on too.` : '',
      `Set it up in ${state.group.name}.`,
    ].filter(Boolean).join(' ');
    out.push({ sub, alert: { title, body, tag: 'morning' } });
  }
  return out;
}
