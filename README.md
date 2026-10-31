# Sonic Rogue (werktitel)

PokéRogue-achtige roguelite met Sonic. Phaser 3 + TypeScript + Vite.
Fan game, non-commercieel. Sprites © Sega/Sonic Team. Sonic, Tails, Knuckles, Cream en Amy (Advance 3) geript door Ren "Foxx" Ramos,
badniks door SkyLights (Advance 3) en Fatazz/Turtle474 (Advance 2), achtergronden door Παρατηρητής
en Ice (Chaos Angel), Chao Garden/emeralds door Spitfya en Roj, title/menu/intro-zee/character select door raidlandguy,
Random Talking Bush en EternalLight, objecten en shields door Flare en Techokami.

## Starten

```bash
npm install
npm run dev            # dev-server met hot reload op http://localhost:5173
npm run build          # normale build in dist/ (bijv. voor Netlify)
npm run build:single   # alles in één HTML-bestand
npm test               # unit tests (Vitest): damage, stages, types, boost, shop, zones
```

Besturing: pijltjes/WASD bewegen, Z/Enter/Spatie bevestigen, X/Esc terug, C = stats (hoofdmenu) of move-info (Fight), V = field (zone-effect, stages, type-matchup),
H of het ?-knopje = uitleg over de game, M = settings, of klikken/tikken.

## Online zetten

**GitHub Pages** (automatisch bij elke push naar `main`, via `.github/workflows/deploy.yml`):
1. Maak een repo op GitHub en push dit project (zonder `node_modules` en `dist`, die staan in `.gitignore`).
2. Repo > Settings > Pages > Source: **GitHub Actions**.
3. Elke push draait de tests, bouwt de game en zet hem op `https://<jouw-naam>.github.io/<repo-naam>/`.
   Faalt een test, dan gaat er niks online.

**Netlify**: `npm run build` en sleep de map `dist` op app.netlify.com/drop, of koppel de repo
(build command `npm run build`, publish directory `dist`). In een submap van een bestaande site werkt ook,
omdat alle paden relatief zijn (`base: './'` in vite.config.ts).

## Structuur

```
src/
  main.ts               Phaser-config (480x270, pixelArt, FIT scaling)
  scenes/BootScene.ts   laadt de atlassen, maakt alle animaties
  scenes/TitleScene.ts  intro-kaarten + run-intro + title screen (Advance 2-stijl): GAME START / CREDITS / OPTIONS
  scenes/CreditsScene.ts  rollende credits (alle rippers, SEGA/Sonic Team)
  scenes/CharSelectScene.ts  character select (Advance 3-stijl); hier komt later het cost-systeem
  scenes/BattleScene.ts de battle: HUD, menu's, beurten, aanval-animaties, rewards, waves
  scenes/Backdrop.ts    zone-achtergronden (lagen, scrollen, Chaos Angel wolken-flits)
  data/fighters.ts      characters, moves, damage-formule en rewards (alle balans-getallen)
  data/zones.ts         zones: welke badniks, welke achtergrond, boss, waves per zone
  data/items.ts         shop-items (healing) en vanaf welke wave ze te koop zijn
  data/settings.ts      tekstsnelheid, battle-snelheid, muziek- en geluidsvolume (bewaard in localStorage)
  audio.ts              muziek (streamt, crossfade, jingles), geluidseffecten en stemmen
  scenes/Mode7.ts       de nep-3D zee van de intro
  scenes/HelpScene.ts   uitleg-overlay (?-knop / H), getallen komen direct uit de data
  scenes/SettingsScene.ts  settings-overlay (M of het menu-knopje rechtsboven)
  assets/<char>.png/.json/_anims.json   atlas + animaties per character (sonic, tails, knuckles, cream, amy)
public/audio/           music/, sfx/ en voice/ (mp3, omgezet uit jouw wav's)
  assets/badniks.png/.json, badnik_anims.json   alle vijanden + explosie
tools/build_atlas.py    snijdt character-frames uit een Foxx-sheet
tools/build_badniks.py  snijdt badniks uit de enemy-sheets
tools/build_bgs.py      snijdt de achtergrond-lagen uit (assets/bg)
tools/build_ui.py       rings, glinsters, item monitors, monitor-rook en character-icoontjes (assets/ui)
tools/build_menu.py     title, menu-labels, character select en effecten (shield, ballonnen) -> assets/menu
tools/build_emeralds.py haalt de 7 geanimeerde Chaos Emeralds uit de Chao Garden-sheet
```

## Een nieuwe sheet / nieuw character verwerken

```bash
pip install pillow numpy scipy
python3 tools/build_atlas.py tails pad/naar/tails_sheet.png src/assets
python3 tools/build_badniks.py advance3_enemies.png advance2_enemies.png src/assets
```

Characters: frames worden aangewezen als `(rij, kolom)` of `(rij, kolom, ms)` in `CHARACTERS` in het script.
Schuift een hamer of uitgestoken vuist het lichaam scheef, corrigeer dat dan in `OFFSETS` (pixels).
Badniks: elke animatie is een rechthoek op de sheet (`ENEMIES` in het script); de frames
daarbinnen worden automatisch gesplitst op lege kolommen.
Rijen en kolommen tellen vanaf 0, van boven naar beneden en van links naar rechts,
zoals de sprites op de sheet staan. Het script lijnt elk frame uit op het lichaam
(niet op stofwolkjes) met de voeten op dezelfde lijn.

Let op: de sprites op deze sheet kijken naar **links**. Jouw team staat links en wordt
daarom in de code geflipt (`setFlipX(true)`); vijanden blijven zoals ze zijn.

## Hoe het spel nu werkt

- Intro (Advance 2-stijl: zee in Mode 7 met de kaartjes, eiland, Sonic & Tails rennen voorbij, logo) -> title screen -> GAME START -> character select: kies een team van 3 (Sonic, Tails en Amy zijn vanaf het begin speelbaar).
- In Toy Kingdom zweven ballonnen voorbij. (De shield-bubbel staat klaar in de code voor een latere shield-mechaniek.)
- Fight opent op je laatst gebruikte move; na een boss begint hij weer bovenaan.
- Zones van 10 waves, Advance 3 en Advance 2 om en om: Route 99 -> Leaf Forest -> Sunset Hill -> Hot Crater -> Toy Kingdom
  -> Music Plant -> Twinkle Snow -> Ice Paradise (met zwaaiende zoeklichten) -> Sky Canyon (daarna opnieuw, sterker).
  De nieuwe zones gebruiken voorlopig de bestaande badniks.
- Vijand-level = 4 + 0,65 per wave (elite/boss +2); EXP is daarop afgestemd zodat je net iets voor blijft.
- **Team**: max 3 characters, de eerste begint. Voor elke wave vraagt de game of je wilt wisselen (gratis;
  Settings > Battle Style: Switch/Set). Via Party in het gevecht wisselen kan ook, maar dan krijgt de vijand een gratis beurt.
  Wisselen reset de stat stages van wie eruit gaat. KO = je kiest wie er verder gaat; pas als iedereen KO is, is de run voorbij.
  De 1-Up-reward haalt KO-teamleden terug (50% HP) en zit er altijd tussen als iemand KO is.
- **Exp Share**: na de boss van wave 10 krijgt de bank 50% van de EXP, na wave 20 100% (`EXP_SHARE_STEPS` in fighters.ts).
- **Rivals**: op wave 15, 25, 35, 45 en 55 (daarna elke wave die op 5 eindigt) is er 50% kans (`RIVAL_CHANCE` in
  `src/data/zones.ts`) dat je een ander character tegenkomt in plaats van de elite badnik. Versla je die, dan is dat character vrijgespeeld (bewaard in de browser)
  en mag hij meteen bij je team (bij een vol team kies je wie er weggaat).
  Er komt eerst iemand die nog op slot zit; zijn ze allemaal vrij, dan blijven rivals gewoon sterke gevechten.
  Testen: in de console `resetUnlocks()` (alles weer op slot) of `unlock('amy')`.
- Wave 5 van een zone (tot wave 15): een sterkere "elite" badnik. Wave 10: zone-boss op de Chaos Angel-achtergrond.
- Bosses, elites en rivals hebben een label onder hun HP-box (BOSS / ELITE / RIVAL); de boss-balk is in 4 stukken.
- Naast je HP-box staat een Advance 3-portret van je character.
- Elke verslagen zone-boss levert een Chaos Emerald op (7 slots linksboven in beeld).
- **Boost-meter** (max 6, je begint met 3): Spin Attack kost niks en geeft +1, geraakt worden geeft +1,
  sterkere moves kosten 1-3 en missen nooit (alleen een ACC-debuff zoals Clouds kan ze laten missen).
  De meter blijft staan tussen waves, dus sparen voor de boss loont.
  Vanaf **Lv. 30** leert elk character een ultimate die de hele meter kost (`ULTIMATE_LEVEL` in `fighters.ts`).
- **Stat stages**: Power Up / Speed Shoes / Shield geven ATK/SPD/DEF +1 (25% per stap, max +6, omlaag tot -6:
  -1 = x0,8, zodat +1 en -1 elkaar opheffen). Na elke zone-boss worden de stages gereset (en dan worden er ook geen stat-rewards aangeboden).
- **Types**: Fly > Power > Speed > Fly (x1,5 / x0,67). Sonic = Speed, Tails/Cream = Fly, Knuckles/Amy = Power.
  In het Fight-menu krijgen moves een groen pijltje omhoog bij type-voordeel en oranje omlaag bij nadeel.
  Zone-bosses zijn type-neutraal zolang er nog maar 1 character per run is (`BOSS_TYPE_NEUTRAL` in BattleScene).
  Balans checken: `npm run sim` speelt 2000 boss-gevechten per character na.
  Icoontjes: schoen / wervelwind / vuur uit de Advance 3-monitors (Spitfya).
- **Zone-effecten** (op jou): Hot Crater = HEAT (ATK -1, 1/16 HP schade per beurt), Toy Kingdom/Music Plant = JOY (DEF -1),
  Twinkle Snow/Ice Paradise = FREEZING (SPD -1), Sky Canyon = CLOUDS (ACC -1).
- **Shopprijzen** stijgen +75% per zone (`PRICE_GROWTH_PER_ZONE` in `items.ts`).
- Sonic: Spin Attack, Homing Attack (gaat altijd eerst), Spin Dash: power hangt af van hoeveel sneller Sonic is
  dan de vijand (Electro Ball-tabel: <1x = 50, 1x = 70, 2x = 90, 3x = 120, 4x+ = 150; `SPEED_POWER` in fighters.ts).
- Tails: Spin Attack, Copter Dive (gaat altijd eerst), Glove Punch.
- Knuckles (tank: veel HP/ATK/DEF, traag): Spin Attack, Glide Attack (mist nooit), Knuckle Punch (heel sterk, kan missen).
- Cream (snel, support): Spin Attack, Flutter Dive (gaat altijd eerst), Chao Cheer (geneest 30% HP).
- Amy (aanvaller): Spin Attack, Piko Hammer, Hammer Twirl (sterk, kan missen).
- Badniks hebben eigen aanvalsstijlen: schieten, rammen, tong uitslaan of erop springen.
- Na elke gewonnen wave: EXP, rings (vliegen naar de teller) en een keuze uit 3 item monitors.
- Onder de rewards zit de shop (PokéRogue-stijl, met Reroll voor nieuwe gratis rewards): healing items kopen met rings. Health Ring vanaf wave 1, Super Ring
  vanaf 11, Hyper Ring vanaf 21, Chili Dog vanaf 31. Gebruik ze in battle via Items (kost je beurt).
- Koop je een heal-item terwijl je HP niet vol is, dan kies je Use now of Keep in bag. Rechtsonder zie je je HP.
- Sonic KO = run voorbij, Z of tikken om opnieuw te beginnen.

- Mist een aanval, dan popt er "MISS" naast het doelwit.

## Geluid

- De browser laat pas geluid toe na een klik/toets, daarom begint het spel met "PRESS ANY BUTTON".
- Muziek per scherm/zone staat in `MUSIC` in `src/audio.ts`; zones gebruiken hun `backdrop`-naam als track.
- Nog niet aanwezig: game over-muziek en aanval-geluiden van badniks/bosses.
- Volume van muziek en geluid stel je in via Settings (M).

Badnik-namen zijn zelfbedacht; pas ze gerust aan in `src/data/fighters.ts`.

Zie ook [ROADMAP.md](ROADMAP.md).

## Ideeën voor later

- Korte dialoog voor/na een rival-gevecht.

- **Character passives** (de "abilities" van dit spel): elk character krijgt een eigen passive naast zijn stats,
  zodat ze echt anders spelen. Bijvoorbeeld *Sonic: always moves first*.
- Party van max 3 (Speed / Fly / Power) met een cost-systeem op het starter-scherm.
- Recruiten via rival-encounters (Knuckles, Amy, ...) in plaats van catchen.
- Eggman als boss elke 20 waves, met fases.
- Chaos Angel / de grote special-stage ring voor speciale events.
- **Stat stages i.p.v. permanente %-buffs** (nu kun je ATK/DEF/SPD eindeloos stacken = broken).
  Plan: +1 stage per buff, max +6, reset na elke zone-boss. Zie het voorstel in de chat.
