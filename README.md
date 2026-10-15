# Corners

A game for friends watching the Premier League. Each player stakes their own tokens, a
random player starts with the Corner flag, and the flag passes along the order every
time either team gets a corner. Whoever holds it at full time takes the whole pot.

## Rules

1. Everyone starts the season with the same tokens (100 unless you pick another amount under New season). Most tokens at the end of the season wins.
2. Each player picks their own stake for a match on their own phone, from 1 token up to their balance. No stake means sitting it out.
3. At the start the order is shuffled and the first player in it holds the flag.
4. Every corner to either team, stoppage time included, moves the flag one place along.
5. The flag holder at full time wins the pot. No corners means the starter wins.
6. If the live feed takes a corner back, the flag moves back too.
7. An abandoned or postponed match refunds every stake.

## How it works

- The corner count comes from [API-Football](https://www.api-football.com/)'s live "Corner Kicks" statistic.
- While anyone has the page open, the server checks the count every 80 seconds. That keeps one match
  under the free plan's 100 requests a day. Set `POLL_SECONDS` lower on a paid plan.
- The flag holder is worked out from the total, so corrections in the feed fix themselves.
- If the feed is wrong or stuck, the backup controls let you add or remove a corner, end the match, or abandon it.
- State (players, tokens, the live match, results) is kept in Upstash Redis.

## Set it up (free)

1. Sign up at https://dashboard.api-football.com/register and copy your API key.
2. Put this folder in a GitHub repository. Then, at https://vercel.com/new, import that repository.
   No build settings are needed.
3. In the Vercel project, open **Storage**, add **Upstash for Redis** (free plan), and connect it to the project.
   This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` settings.
4. In **Settings → Environment Variables**, add:
   - `API_FOOTBALL_KEY`: your key from step 1
   - `GAME_PIN` (optional): a PIN friends need before they can change anything
5. Redeploy, and share the link with your friends.

## Try it locally

```
MOCK_FEED=1 POLL_SECONDS=2 npm run dev   # simulated match: a corner every 20s, full time after 4 minutes
npm test
```
