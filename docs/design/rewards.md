# Rewards, money and bosses

Design for the reward revamp. Rewards are for power, money and short buffs; healing mostly comes from the shop and costs rings. Status: **rewards, money and shop are built**; boss charms and the super boss come with the boss update.

## Reward tiers

After every wave you pick 1 of 3 free monitors. Each monitor rolls a tier first, then a reward from that tier. If nothing in that tier fits (all buffs already active, full HP...), it falls back to a lower tier.

| Tier | Chance | Card border |
|---|---|---|
| Common | 65% | grey |
| Uncommon | 23% | green |
| Rare | 9% | blue |
| Super rare | 2.5% | purple |
| Ultra rare | 0.5% | gold |

PokéRogue uses 75 / 19 / 4.7 / 1.2 / 0.1%. Our runs are shorter (90 waves), so rares show up a bit more often. After a boss the odds shift up: 57 / 26 / 12 / 4 / 1%.

## Rewards

None of the buffs stack: while one is active, it isn't offered.

| Tier | Reward | Effect |
|---|---|---|
| Common | Speed Shoes | Boost +1 |
| Common | Ring Monitor | Rings (1x base value) |
| Common | Shield | The next hit on your team does half damage |
| Common | Magnet Shield | Double rings from the next 3 waves |
| Uncommon | Ring Bundle | Heal 25 HP or 25%, whichever is more (pick a teammate) |
| Uncommon | Super Boost | Boost +2 |
| Uncommon | Invincibility | The first attack next wave misses |
| Uncommon | Amy's Hammer | +20% crit chance for your next 3 turns |
| Uncommon | Eggman Monitor | Lots of rings (4x base value), whole team -25% max HP (nobody goes down from it) |
| Uncommon | Chaos Drive | +1 level for a teammate you pick |
| Rare | 1-Up | Heal 60 HP or 50%, whichever is more (pick a teammate) |
| Rare | Eggman Alarm | The next foe is an elite; beat it for uncommon-or-better rewards |
| Rare | Emerald Shard | Whole team +1 level (a shard of the Master Emerald) |
| Super rare | Shield+ | Half damage for the whole next wave |
| Super rare | Invincibility+ | The first attack in each of the next 3 waves misses |
| Ultra rare | Move Chip | Spin Attack +30 power for a teammate you pick; gone from the pool once the whole team has one |

There is no 100% heal reward anymore. Heals at full HP and Boost at a full meter aren't offered.

## Money

One base value per wave, like PokéRogue (`(10 * wave + 175) ^ (1 + 0.005 * waveSet)`), on our own scale:

```
B(wave) = (2 * wave + 35) ^ (1 + 0.005 * zone)      zone = ceil(wave / 10) - 1
```

Everything is a multiple of B, rounded down to 5, so income and prices can't drift apart.

| | x B | wave 1 | wave 20 | wave 50 | wave 90 |
|---|---|---|---|---|---|
| Rings for winning a wave | 0.35 (elite x1.5, boss x2) | 10 | 25 | 50 | 90 |
| Ring Monitor | 1 | 35 | 75 | 145 | 265 |
| Eggman Monitor | 4 | 145 | 305 | 595 | 1065 |
| Health Ring (25 HP or 25%) | 0.8 | 25 | 60 | 115 | 210 |
| Super Ring (60 HP or 50%) | 1.8 | — | 135 | 265 | 475 |
| Hyper Ring (120 HP or 75%) | 3 | — | 225 | 445 | 795 |
| Chili Dog (100%) | 5 | — | — | 740 | 1330 |
| Revive (50%) | 6 | — | 455 | 890 | 1595 |
| Reroll | 0.5, doubles every reroll | 15 | 35 | 70 | 130 |

A Health Ring always costs about 2-3 won waves. Balancing an item is now one number. Heals bought in the shop or taken as a reward can go to any teammate, and in battle you can use one item per fight without losing your turn.

## Boss schedule (next update)

- Waves 10 / 30 / 50 / 70: zone bosses (as now). Afterwards KO'd teammates get back up with 50% HP, and anyone below 50% is patched up to 50%. **Built.**
- Waves 20 / 40 / 60 / 80: main bosses. Eggman is the common one, with a chance of Chaos, Shadow or other bosses. Afterwards the whole team is fully healed, KO'd teammates included, and everyone has at least 3 Boost (stat stages reset as usual). **The heal is built** and already happens after the current boss on these waves.
- Wave 90: super boss, only after collecting all seven Chaos Emeralds.

## Boss charms (next update)

Permanent effects for the whole team, like relics. After a main boss you pick 1 of 2. Each charm only once per run. An ultra rare charm should feel like a god run, not something every run gets.

| Tier | Charm |
|---|---|
| Common | +10% crit chance |
| Common | Start every zone with a Shield |
| Common | Foes drop 10% more rings |
| Common | +1 DEF stage while your bag is empty |
| Uncommon | Active character heals 5% after every wave |
| Uncommon | Active character gains 1 Boost at the start of each wave |
| Rare | Take half damage at full HP |
| Rare | Spin Attack gives +2 Boost instead of +1 |
| Super rare | Stat changes are doubled (a raise gives 2 stages, max still +6) |
| Ultra rare | Attacks hit an extra time at 20% damage (see below) |

**Extra hit (ultra rare):** only damage, no effects (no flinch, stun or Amy's crit cost). It can crit. The attack animation plays twice back to back. Not on ultimates. Stat changes from the move do apply twice (Piko Hammer: ATK +2).

## Super boss rewards (later)

Only for one character.

| Character | Reward |
|---|---|
| Sonic | Sonic Speed damage cap goes from +50% to +100% |
| Tails | The whole team deals 2x damage to stunned foes |
| Knuckles | Can't lose more than 33% of his max HP in one turn |
| Cream | Chao Care works even when she's on the bench |
| Amy | Crits do 2x damage instead of 1.5x |

## Balance notes for after the revamp

- Check whether ring income vs prices feels right after a few runs; tune `WAVE_RINGS` and the price multipliers in `src/data/items.ts`.
- If dying is still too rare, make foes hit harder, but only after the reward changes have been played for a while.
