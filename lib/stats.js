// Running totals, worked out from the results each competition keeps. Nothing is stored twice,
// so a stat can never drift from the results it came from.

// What each player gained or lost in one settled match: stakes out, winnings back in.
// Mirrors how settle() pays out, including the side pot's odd-token rule and the golden corner.
export function matchNet(h) {
  const net = {};
  const add = (id, n) => { net[id] = (net[id] || 0) + n; };
  for (const [id, n] of Object.entries(h.stakes || {})) add(id, -n);
  const bonus = h.golden?.winner ? h.golden.bonus : 0;
  add(h.winner, h.pot - bonus);
  if (bonus) add(h.golden.winner, bonus);
  if (h.sidePot) {
    for (const [id, g] of Object.entries(h.guesses || {})) add(id, -g.stake);
    const share = Math.floor(h.sidePot / h.guessWinners.length);
    h.guessWinners.forEach((id, i) => add(id, share + (i < h.sidePot % h.guessWinners.length ? 1 : 0)));
  }
  return net;
}

// "90+3'" -> 93. Unknown minutes (test matches, corners added by hand) count as nothing.
function minuteOf(e) {
  const m = /^(\d+)(?:\+(\d+))?/.exec(e?.minute || '');
  return m ? Number(m[1]) + Number(m[2] || 0) : null;
}

const blank = () => ({
  played: 0, flags: 0, net: 0, biggestPot: 0, guesses: 0, guessWins: 0, guessError: 0,
  golden: 0, lateSteals: 0, streak: 0, bestStreak: 0, form: [],
});

// competitions: the ones to count (one for "this competition", all of them for all-time).
export function playerStats(competitions) {
  const results = competitions
    .flatMap((c) => [...c.history].reverse()) // history is newest first; ties on `at` keep play order
    .filter((h) => !h.abandoned)
    .sort((a, b) => a.at - b.at);
  const players = {};
  const p = (id) => (players[id] ??= blank());
  const totals = { matches: results.length, corners: 0, mostCorners: null };

  for (const h of results) {
    totals.corners += h.corners;
    if (!totals.mostCorners || h.corners > totals.mostCorners.corners) totals.mostCorners = { label: h.label, corners: h.corners, at: h.at };
    for (const [id, n] of Object.entries(matchNet(h))) p(id).net += n;
    for (const id of h.order || []) {
      const s = p(id);
      const won = id === h.winner;
      s.played += 1;
      s.streak = won ? s.streak + 1 : 0;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      s.form = [...s.form, won ? 'W' : 'L'].slice(-5);
    }
    const w = p(h.winner);
    w.flags += 1;
    w.biggestPot = Math.max(w.biggestPot, h.pot);
    // A steal: the flag only reached the winner in the 90th minute or later.
    const last = (h.log || []).filter((e) => !e.back).at(-1);
    if (last && last.holder === h.winner && minuteOf(last) >= 90) w.lateSteals += 1;
    if (h.golden?.winner) p(h.golden.winner).golden += 1;
    for (const [id, g] of Object.entries(h.guesses || {})) {
      const s = p(id);
      s.guesses += 1;
      s.guessError += Math.abs(g.guess - h.corners);
      if (h.guessWinners?.includes(id)) s.guessWins += 1;
    }
  }
  for (const s of Object.values(players)) {
    s.winRate = s.played ? s.flags / s.played : 0;
    s.avgGuessError = s.guesses ? s.guessError / s.guesses : null;
    delete s.guessError;
  }
  return { players, totals };
}
