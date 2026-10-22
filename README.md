# Corners

A game for friends watching the Premier League. Like in the pub, everyone puts in the same
stake, a random player starts with the Corner flag, and the flag passes along the order every
time either team gets a corner. Whoever holds it at full time takes the pot.

The stake is whatever the players agree, typed in as text: "£5 each", "losers buy a round" or
"bragging rights". Corners only shows it. It never takes, holds or pays out money; you settle up
between yourselves.

The earlier version, with tokens, competitions, side pots and golden corners, is kept on the
`classic` branch (tag `classic-v1`).

## Match day

1. **Start a game:** put in your name. The game is called after you, like "Alex's game", and can be renamed.
2. **Pick the match** from today's fixtures, another day, or a test match. For a local game the feed
   doesn't have, **enter it yourself**: the two teams and, if you like, the kick-off time. With no
   feed, anyone watching taps **+1 Corner** each time one is given (two phones tapping the same corner
   count it once) and **Full time** at the whistle.
3. **Agree the stake**, the same for everyone. It carries over to the next match, so later games skip this step.
4. **Send your mates the link** (or read out the 6-letter code). A mate opening it sees who asked them,
   the match and the stake, taps their name, and is in.
5. **Who's in** shows everyone. You put yourself in or sit out from your own phone; a mate without a
   phone can be added and put in by anyone. Once two are in, **Draw the order and start** goes live.
6. At full time every phone shows who takes the pot, the stake, and who settles up.

## Groups

Everyone who has played together stays together as a group, so the next match is just pick, share
and play. The same phone can be in several groups, and the chips under the logo switch between
them. The Group tab lists the players, who set it up (only they can remove a player), the join
code, alerts and teams you follow. **Leave group** only takes it off your phone. Whoever set the
group up can also **Delete group**, after typing its name: the group, its players and results are
gone for everyone, and other phones drop it the next time they open it.

## The table

Once a group has played three matches, a Table tab appears: pots won, games played and recent
results, with win rate and streaks under **More stats**. Everything is worked out from the saved
results.

## Chat and the host

During a match everyone can tap a reaction or send a short line (up to 80 characters), shown with
their name. The person who set up a group is its host: only they can remove a player, since that
can't be undone. Groups from before this keep
their first player as host.

## Alerts

Each phone can turn on alerts per group on the Group tab. Nobody picks matches one by one:

- **Game on:** when the first person says they're in for the next match, the rest of the group is
  told (at most once every 2 hours), and again when the match kicks off.
- **During the match:** your phone buzzes when the flag lands on you ("You've got the flag!"), and
  everyone hears the result at full time. The feed is checked while anyone in the group has the app
  open, so these come as long as one of you is watching in the app.
- **Teams you follow:** pick teams once. On days they play, you get one nudge at about 10am.
- Nothing is sent between 11pm and 8am (UK time). On iPhone, alerts only work once Corners has been
  added to the home screen and opened from there.

Alerts need three settings in Vercel (see Set it up). Without them the app works as before, and the
alerts section stays hidden.

## Rules

1. Everyone in puts in the same stake, agreed as text before the match. Sitting out is fine.
2. Your own phone says whether you're in. A friend at the table without the app can be put in by anyone.
3. At the start the order is shuffled and the first player in it holds the flag.
4. Every corner to either team, stoppage time included, moves the flag one place along.
5. The flag holder at full time wins the pot. No corners means the starter wins.
6. If the live feed takes a corner back, the flag moves back too.
7. An abandoned or postponed match has no winner.

### Golden corner

Optional, under **Extra: golden corner** before the match. Tick it and write the prize, like "a packet
of crisps". At kick-off a secret corner from 1 to 12 is drawn. Whoever the flag goes to on that
corner wins the prize, on top of the pot. The number shows once it's been taken, and if the match
never gets that many corners nobody wins it. It stays on for the next match until it's turned off.

### During the match

- Anyone can tap **Corner!** the moment the ball goes out, so the flag moves with the TV rather than
  a minute later with the feed. Taps within 8 seconds of each other count once, so a room shouting the
  same corner doesn't move it twice. When the feed catches up it confirms the corner rather than adding
  it again. At full time the feed's count wins, so a corner called by mistake that the feed never saw is dropped.
- When the flag changes hands, every phone flashes the new holder's name full screen and buzzes
  (on phones that allow it). Landing on you gets the loudest version.
- At full time every phone shows who takes the pot, the stake, and who settles up.
- The match log lists every corner with its minute, whose corner it was, and who the flag went to.
  A corner the feed takes back gets its own line.
- Tap a reaction (😱 🍺 🔥 😂 👏 😤) to let everyone else watching see it.

## How it works

- The corner count comes from [API-Football](https://www.api-football.com/)'s live "Corner Kicks" statistic.
- While anyone has the page open, the server checks the count every 80 seconds. That keeps one match
  under the free plan's 100 requests a day. Set `POLL_SECONDS` lower on a paid plan.
- The flag holder is worked out from the total, so corrections in the feed fix themselves.
- If the feed is wrong or stuck, the backup controls let you add or remove a corner, end the match, or abandon it.
  A corner added there is a correction that stays at full time; removing one takes back a called corner first.
- Each group's state (players, the stake, the live match, results) is kept in Upstash Redis, one key per group.

## Set it up (free)

1. Sign up at https://dashboard.api-football.com/register and copy your API key.
2. Put this folder in a GitHub repository. Then, at https://vercel.com/new, import that repository.
   No build settings are needed.
3. In the Vercel project, open **Storage**, add **Upstash for Redis** (free plan), and connect it to the project.
   This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` settings.
4. In **Settings → Environment Variables**, add:
   - `API_FOOTBALL_KEY`: your key from step 1
   - `GAME_PIN` (optional): a PIN needed before anyone can start a group or change anything
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (optional, for alerts): make a pair with
     `npx web-push generate-vapid-keys`
   - `VAPID_SUBJECT` (optional): `mailto:` plus your email, so push services can contact you
   - `CRON_SECRET` (optional): any long random string. Vercel sends it with the morning reminder
     call so nobody else can trigger it
   - `TIP_URL` (optional): an https link, such as your Buy Me a Coffee page, shown at the bottom of the app
5. Redeploy, and share the link with your friends.

## Try it locally

```
MOCK_FEED=1 POLL_SECONDS=2 npm run dev   # simulated match: a corner every 20s, full time after 4 minutes
npm test
```
