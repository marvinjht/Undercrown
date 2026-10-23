# Undercrown server protocol (stage 1)

This is the contract between a game client (the HTML game today, a Godot client later) and the Undercrown game
server (`server/`). Any client that speaks these messages can play in the same rooms.

## Who decides what

| Decided by the server | Still decided by each player's game (until stage 2) |
| --- | --- |
| Room codes, seats, who owns the room | Doors, monster fights, loot, merchant, forge |
| Bots (their whole run) | Level-up picks, heart gem, bag use |
| The room clock: when each room starts and ends | The player's own hero (sent as snapshots) |
| Skip votes, kicks for inactivity, bots taking over dropped players | |
| Plunder tables, pick order and turns | |
| Duel pairings, and **every duel fight** | |
| The tournament bracket, **every tournament fight**, tournament hearts | |
| The match record saved to the database | |

The server runs every fight between players and sends the **finished result**. Clients only play it back. This is
what keeps every screen in agreement.

Stage 2 moves the rest of the left column to the server (loot, gold, Plunder picks applied server-side, level-ups).
Stage 3 adds matchmaking.

## Connecting

- WebSocket: `wss://<server>/ws` (`ws://` locally). One JSON object per text message.
- `GET /health` returns `{ "ok": true, "version": "0.38", "rooms": 3 }`. Free hosting sleeps when idle; calling this
  wakes it (the title screen does).
- The server also serves the game itself at `/`.
- Every client message carries `from` (the client's id). Every server message carries `from: "server"`.
- `cid`: a random id the client makes when it opens a room connection (e.g. `"c7k2m9x"`). It identifies the player
  for the whole match, including after a reconnect.
- `v`: the game version (`G.VERSION`). The server only accepts clients on its own version.

## Shared shapes

- **Hero**: the full hero object as `src/stats.js` `G.Hero.create` makes it (gear, bag, relics, level, hearts, gold,
  spec, gem, …) minus its random number generator. Sent whole in snapshots.
- **Item**: as `src/items.js` makes them: `{ id, kind: 'gear'|'consumable'|'relic', … }`.
- **Fight result** (`res`): what `G.simulateFight` returns. `events` is the timeline the arena plays
  (`{ type, t, src?, tgt?, amount?, h: { fighterId: [hp, shield, mana, maxHp] } … }`); `fighters`, `tracks`
  (positions over time), `winner` (`'a'` or `'b'`), `draw`, `duration`, `aHp`, `bHp`, plus effect totals
  (`bloodrage`, `rageMax`, `bladePoison`, …). Side `a` is the pair's first player.
- **Fight inputs** (`spec`): `{ sa, aHp, aName, b: { s, name, hp, sprite, tint } }`, the frozen stats both sides
  fought with (`G.Tournament.pvpSpec`).
- **Duel pair** (`w`): `{ a: slot, b: slot | null, ghostOf: slot | null, seed }`. `ghostOf` set = side b is a ghost of
  that player.
- **Player**: `{ slot, cid, name, bot, botWas?, tint, kicked? }`. `slot` 0–7 is the seat.

## Lobby

Client → server (the first message on a new connection must be one of these three):

| Message | Fields | Meaning |
| --- | --- | --- |
| `create` | `cid, name, v` | Make a new room; you own it. |
| `join` | `code, cid, name, v` | Join a room by code. |
| `rejoin` | `code, cid, name, v, room` | Same seat after a dropped connection (`room` = the room your game is in). |
| `startReq` | | Owner only: start the match (bots fill seats up to 6). |
| `rematchReq` | | Owner only, after the tournament: back to the lobby, same code. |
| `bye` | `cid` | Leaving. In a match, a bot takes over your hero. |
| `ping` | `cid` | Every 2.5 seconds. Silent for 45 seconds in a match = a bot plays for you until you're back. |

Server → client:

| Message | Fields | Meaning |
| --- | --- | --- |
| `lobby` | `lobby: { code, slots: [{cid, name} \| null] ×8, hostCid: 'server', ownerCid, v, started }` | Seats changed. |
| `version` | `cid, v` | Your version doesn't match the server's (`v`). |
| `joinError` | `cid, reason` | No such room, room full, or match already started. |
| `start` | `seed, players` | The match begins. Every client makes the starting heroes from `seed` in seat order and plans the bosses from it (`G.Dungeon.planBosses(seed)`). |
| `players` | `players` | Someone dropped (a bot took over) or came back. |
| `rematch` | `lobby` | Back to the lobby. |
| `ping` | | Every 2.5 seconds. |

## Rooms 1–29

| Direction | Message | Fields | Meaning |
| --- | --- | --- | --- |
| S → C | `room` | `n, heroes: { slot: Hero }` | Room `n` starts now. Latest snapshots of everyone. |
| C → S | `snap` | `slot, room, hero` | Your hero changed (also passed on to everyone). |
| C → S | `ready` | `slot, room, hero, afk, skipped` | You're done with the room. `afk`: your clock ran out and you did nothing. Two in a row = kicked. |
| S → C | `readyInfo` | `room, ready: [slot], votes: [slot], skipped` | Who's done, who voted to skip. |
| C → S | `skipVote` | `slot, room` | Hurry the last player (regular rooms, 3+ players still in). |
| S → C | `skip` | `room, slot` | That player's clock drops to 10 seconds. |
| S → C | `kick` | `slot` | Removed for inactivity. |

The server ends a room when every player still in is `ready` (shared rooms also wait for their shared part), runs
the bots' room, and starts the next. A room that can't finish (a lost message) moves on after the round time plus two
minutes.

## Plunder (rooms 5, 15, 25 and between tournament rounds)

| Direction | Message | Fields |
| --- | --- | --- |
| S → C | `plunder` | `room, tour (round number or 0), table: [Item], order: [slot], turn, picks: {slot: text}, seq, last: {slot, item, pass, seq}, done, reviewMs, turnMs` |
| C → S | `pick` | `slot, itemId` (`null` = pass) |

Sent after every change. When `last.slot` is you, apply `last.item` (or the pass gold) to your hero once per `seq`.

## Duels (rooms 10 and 20)

| Direction | Message | Fields | Meaning |
| --- | --- | --- | --- |
| S → C | `duels` | `room, pairs: [w], heroes` | Pairings. Show the 5-second duel card. |
| C → S | `duelLock` | `slot, room, hero` | Your card ended: this is your hero going in. |
| S → C | `duelFight` | `room, w, spec, res` | The finished fight. Play `res` back. Then settle your own side with `G.Duel.resolve(pair, res, room)` (hearts, XP, gold), and send a `snap`. |

The server fires a pair's fight once every player in it has locked in, or 7.5 seconds after the card starts. Bot-only
duels are settled at once and never sent.

## Tournament (room 30)

| Direction | Message | Fields | Meaning |
| --- | --- | --- | --- |
| S → C | `tour` | `state, phase: 'break'\|'fight'\|'plunder'\|'done', ms, heroes` | Bracket and phase. `ms` = time left in a break. |
| C → S | `tourUse` | `slot, hp, hero` | You drank a potion or changed gear in a break. |
| C → S | `tourDone` | `slot` | You finished watching your fight. |

`state`: `{ entrants: [{ slot, hp, maxHp, out, place, hearts, … }], rounds: [{ n, pairs: [{ a, b, ghostOf, seed,
result, winner, draw, lostHearts, spec, res }] }], champion }`. In the `fight` phase, every unsettled pair carries
`spec` and the finished `res`; play yours back (others can be watched). Tournament hearts are the server's: take them
from `entrants[].hearts`.

The server settles the round when every connected player in it has sent `tourDone` (or after the longest fight plus
12 seconds), then runs a Plunder, then the next break. At the end it saves the match.

| Direction | Message | Fields |
| --- | --- | --- |
| S → C | `saved` | `status: 'saving' \| 'saved' \| 'failed: …'` |

## Watching other players (passed through unchanged)

| Message | Fields | Meaning |
| --- | --- | --- |
| `watch` | `slot, target` | Start (`target` = slot) or stop (`null`) watching someone. |
| `view` | `slot, state` | Your screen, sent only while someone watches you. |
| `fight` | `slot, room, title, names, visual, res \| args` | A fight you just played: `res` for player fights (play it as is), `args` for your own monster fights (replay with `G.simulateFight(...args)`). |

## Reconnecting

If the connection drops, the client reconnects and sends `rejoin` with its `cid`, `code` and current `room`. The
server answers with `lobby`, `players`, and anything missed: the current `room` (if the client is behind), the
current Plunder, the duel pairings and an already-run duel fight, or the tournament state.

## Versions

The server only accepts clients on its exact version. When the game changes, the server and every client update
together. (The server serves the game page itself, so its own page always matches.)
