# Undercrown server protocol (stage 3)

This is the contract between a game client (the HTML game today, a Godot client later) and the Undercrown game
server (`server/`).

## Who decides what

Everything in a server match is decided on the server. A client shows what the server says and sends button presses.

| On the server | In the player's client |
| --- | --- |
| Room codes, seats, bots, the room clock, skip votes, kicks | Drawing the screens and playing back fights |
| **Each player's whole run**: doors, monster fights, loot, gold, the merchant, the forge, level-ups, the heart gem, potions, gear swaps, selling | Sending button presses (`act`) |
| Plunder, duels, the tournament, and every fight between players | Spectating (which player or fight you look at) |
| The match record saved to the database | |

Each human in a match gets a **twin** on the server (`server/twin.js`): the same game code the browser runs
(`src/game.js` and `src/mp.js` on top of the rules), owned by the server. The room talks to twins with the room
messages below, exactly as it used to talk to browsers; twins send the client its **state**. Nothing a client changes
on its own side reaches its hero.

Stage 3 adds matchmaking: "Find a match" (below).

## Connecting

- WebSocket: `wss://<server>/ws` (`ws://` locally). One JSON object per text message.
- `GET /health` returns `{ "ok": true, "version": "0.44", "rooms": 3, "queue": 1 }` (`queue`: players looking for a match). Free hosting sleeps when idle; calling this
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

## Your game: act and state (in a match)

Once the match starts (`start`), a client's connection carries only these, plus the lobby messages (`lobby`, `rematch`,
`end`, `kick`, `saved`, `ping`, `version`). The room messages further down are between the room and the twins.

| Direction | Message | Fields | Meaning |
| --- | --- | --- | --- |
| C → S | `act` | `fn, args, mp` | A button press: `fn` is a game action and `args` up to 3 plain values (numbers, short ids). `mp: true` for `startWatching`, `stopWatching`, `sendSkipVote`. `battleEnd` = the fight on screen finished playing (optional: the server ends every fight itself once its playback time is over plus 4 seconds, so a background tab never holds up the room; a passed skip vote cuts a fight to 10 seconds). |
| S → C | `state` | `now, full, render, me, s, del, mp, heroes, sounds` | Your game's state: only what changed since the last one (`full`: everything, after a reconnect). |

`act` functions and the screen (`s.phase`) each is accepted on: `chooseDoor` (doors), `pickWeapon` (armory), `takeItem`,
`takeGold` (reward), `takeSpoils` (spoils), `mysteryAct` (mystery), `chooseSpec` (spec), `chooseTree` (tree), `chooseGem`
(gem), `placeBet` (wager), `forgeAct`, `leaveForge` (forge), `startDuelFight` (duelIntro), `playerShopPick`,
`playerShopPass` (shop), `shopBuy`, `leaveMerchant` (merchant), `seeEnding` (dead), and on any screen `useBag`, `sellBag`,
`dyeItem`, `dyeClass`, `dyeCancel`, `markActive`. Anything else is ignored.

`state` fields:
- `now`: the server's clock. Times in the state (`s.roundEnds`, `s.shop.reviewUntil`, `s.shop.turnStart`,
  `s.goldPop.at`) are on it.
- `s`: changed top-level fields of the game state (`G.Game.s`: `phase`, `room`, `doors`, `offer`, `battle`, `shop`,
  `duel`, `tour`, `notice`, …); `del`: fields that are gone. Heroes inside them come as `{ "$hero": "h3" }`: point those
  at your own copies (`me` for your slot, `heroes` for the rest).
- `me`: your hero, field by field (only changed fields; `$gone` lists removed ones).
- `heroes`: everyone else's heroes, the same way, by seat (without their build history).
- `mp`: `players`, `mySlot`, `readyInfo`, `saveStatus`, `watchers`, `lastTourWire`, and per seat (only changed
  seats) `views` (screens of players you watch) and `lastFight` (their latest fight).
- `s.battle.res`: the finished fight to play. `"$same"` = the one you already have.
- `sounds`: sounds to play (`[name, volume]`).
- `render`: the game redrew its screen (otherwise a light refresh is enough). A fight that's playing keeps playing.
- `view` (only for clients that said `client: "godot"` in `create`, `join`, `queue` or `rejoin`): every panel and
  screen described as plain data by `src/present.js`, so the client needs no rules code. Parts (each sent only when
  it changes): `top` (room track), `clock` (`ends`, `total`, server time), `me` (your hero: vitals, `stats` columns,
  `sets`, `relics`, `look`), `gear`, `bag` (items with their buttons), `rivals` (by seat; only changed seats),
  `rivalOrder`, `supply`, `setGuide`, `tree`, `rooms`, and `screen`: `{ phase, title, lede, notice, notes, sections }`.
  Section kinds: `doors`, `cards`, `buttons`, `list`, `review`, `timer`, `skip`, `tree`, `character`, `opponent`,
  `bracket`, `places`, `arena` (play `s.battle.res` there). Every button is
  `{ label, act, args, enabled, style, hold, mp, note, confirm }`: send it as `act` (or handle `ui_…` acts
  yourself: `ui_leave`, `ui_title`, `ui_requeue`, `ui_rematch`). The Godot client in `godot/` is built on this.

## Find a match

Client → server, as the first message on a new connection: `queue` with `cid, name, v`. `bye` (or closing the
connection) leaves the queue.

Server → client while waiting, every second: `queue` with `n` (players waiting), `ms` (time until the match starts;
`null` = nobody waiting) and `max`. The server starts a match (`CONFIG.matchmaking` in data/config.js) when `max` (8) are
waiting, or `waitSeconds` (30) after the second player joined the queue (everyone waiting goes in), or after
`soloWaitSeconds` (45) for one player alone. Then it sends `lobby` (the new room, with `matched: true` and its `code`,
which `rejoin` uses) and `start`, and the match runs like any other. Matched rooms have no rematch: everyone finds a
new match instead.

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

From here on, "C" is a player's **twin** (their game on the server), not their browser. A browser that sends any of
the C → S messages below itself is ignored.

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
server answers with `lobby` and a `full` state: the twin kept playing (its clock kept running). Away longer than 45
seconds, a bot plays the hero from where the twin left it; on `rejoin` the twin takes the hero back from the bot and
carries on from the current room.

## Versions

The server only accepts clients on its exact version. When the game changes, the server and every client update
together. (The server serves the game page itself, so its own page always matches.)
