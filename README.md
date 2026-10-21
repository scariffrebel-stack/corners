# Corners

A game for friends watching the Premier League. Each player stakes their own tokens, a
random player starts with the Corner flag, and the flag passes along the order every
time either team gets a corner. Whoever holds it at full time takes the whole pot.

## Groups

Anyone can start their own group from the home screen: give it a name, your name, and how many
tokens everyone starts with. Each group has its own players, tokens, matches and results.
Until a second player joins, the Match tab is just the invite: send the join link, or read out
the 6-letter code, and watch names appear as mates join. A mate opening the link only sees names
not already picked on another phone. The same phone
can be in several groups, and the group name under the logo switches between them.

The game that was running before groups existed carries on as the group called "Corners", with
its players and tokens kept. Phones that had already picked a name open straight into it.

## Match day

The Match tab walks one step at a time. Someone picks the match once for the whole group, so
every phone shows the same fixture. Then everyone sets their own stake, and "Who's in" shows who
has staked and the pot. Once two players are in, **Shuffle and start** goes live. At full time
**Next match** goes back to picking. The three tabs are Match, Table (with recent results under
the table) and Group.

## Competitions

Every match is played for a competition, and each competition has its own tokens:

- **Season:** runs until you end it, or until you tap **New season**. Most tokens at the end wins.
- **Tournament:** a run of days, such as one weekend or a cup run. Only matches on those days count,
  and it ends by itself after the last day.
- **One-off match:** a single game with its own tokens, over at full time.

A tournament or one-off match never touches the season's tokens. Pick what the next match is for under
**Playing for**, and look back at any competition's final table from the table card. A group from
before competitions carries on as its first season, with every balance and result kept.

## Leaderboards and running totals

The leaderboard ranks players for the competition you're looking at, or for all time across every
competition in the group: tokens won, win rate, flags won, best corner guesser and streaks, with
each player's last five results. Late steals (the flag reaching the winner in the 90th minute or
later) and golden corners are counted too. Everything is worked out from the saved results.

## What do Tokens make

On the Group tab, a group can say what its tokens make, such as "10 tokens = 1 pint". It
shows beside the pot and how far each player is up or down. It's only for fun between friends:
the app never sells tokens, takes money or pays anything out.

## Chat and the host

During a match everyone can tap a reaction or send a short line (up to 80 characters), shown with
their name. The person who set up a group is its host: only they can end a competition, start a
new season or remove a player, since none of those can be undone. Groups from before this keep
their first player as host.

## Alerts

Each phone can turn on alerts per group on the Group tab. Nobody picks matches one by one:

- **Game on:** when someone puts the first stake down for the next match, the rest of the group is
  told (at most once every 2 hours), and again when the match kicks off.
- **During the match:** your phone buzzes when the flag lands on you ("You've got the flag!"), and
  everyone hears the result at full time. The feed is checked while anyone in the group has the app
  open, so these come as long as one of you is watching in the app.
- **Teams you follow:** pick teams once. On days they play, you get one nudge at about 10am.
  A tournament's match days get the same morning nudge.
- Nothing is sent between 11pm and 8am (UK time). On iPhone, alerts only work once Corners has been
  added to the home screen and opened from there.

Alerts need three settings in Vercel (see Set it up). Without them the app works as before, and the
alerts section stays hidden.

## Rules

1. Everyone starts the season with the same tokens (100 unless you pick another amount under New season). Most tokens at the end of the season wins.
2. Each player picks their own stake for a match on their own phone, from 1 token up to their balance. No stake means sitting it out. Once you have picked your name on a phone, nobody else can change your stake; a friend at the table without the app can have theirs typed in for them.
3. At the start the order is shuffled and the first player in it holds the flag.
4. Every corner to either team, stoppage time included, moves the flag one place along.
5. The flag holder at full time wins the pot. No corners means the starter wins.
6. If the live feed takes a corner back, the flag moves back too.
7. An abandoned or postponed match refunds every stake.

### Golden corner

Optional, ticked when starting a match. A secret corner from 1 to 12 is picked at random. Whoever the
flag goes to on that corner takes a quarter of the pot at full time, and the holder gets the rest.
The number shows once it's been taken. If the match never gets that many corners, the holder takes it all.

### During the match

- Anyone can tap **Corner!** the moment the ball goes out, so the flag moves with the TV rather than
  a minute later with the feed. Taps within 8 seconds of each other count once, so a room shouting the
  same corner doesn't move it twice. When the feed catches up it confirms the corner rather than adding
  it again. At full time the feed's count wins, so a corner called by mistake that the feed never saw is dropped.
- When the flag changes hands, every phone flashes the new holder's name full screen and buzzes
  (on phones that allow it). Landing on you gets the loudest version.
- At full time every phone shows who won, the tokens, any golden corner or side pot, and the top of the table.
- The match log lists every corner with its minute, whose corner it was, and who the flag went to.
  A corner the feed takes back gets its own line.
- Tap a reaction (😱 🍺 🔥 😂 👏 😤) to let everyone else watching see it.

### Side pot: guess the corners

Optional, alongside the flag game, and open to players who sit the flag game out.

1. Before the match, guess the total corners and stake tokens on it. Your flag stake and your guess stake both come out of the same balance.
2. Each phone sees only its own guess. Everyone's guesses are revealed when the match starts, and they're locked from then on.
3. At full time the closest guess takes the whole side pot. A tie splits it, with any odd token going to whoever guessed first.
4. The side pot needs at least two guesses. A lone guess is dropped and costs nothing. An abandoned match refunds the side pot too.

## How it works

- The corner count comes from [API-Football](https://www.api-football.com/)'s live "Corner Kicks" statistic.
- While anyone has the page open, the server checks the count every 80 seconds. That keeps one match
  under the free plan's 100 requests a day. Set `POLL_SECONDS` lower on a paid plan.
- The flag holder is worked out from the total, so corrections in the feed fix themselves.
- If the feed is wrong or stuck, the backup controls let you add or remove a corner, end the match, or abandon it.
  A corner added there is a correction that stays at full time; removing one takes back a called corner first.
- Each group's state (players, tokens, the live match, results) is kept in Upstash Redis, one key per group.

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
