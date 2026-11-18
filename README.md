# Rocket League Career Mode

A browser-based career mode game: start as a Bronze rookie and grind your way to the RLCS pro league.

## Play it

Open `index.html` in a browser, or serve the folder locally:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

No build step, no dependencies, no framework — just HTML, CSS and JavaScript.

## Features

- **26-rank ladder** from Bronze I all the way to World Champion, with MMR divisions and promotions.
- **Six attributes** — Speed, Aerial, Shooting, Defense, Boost Management and Teamwork — improved through training drills and skill points.
- **Four playlists** — 1v1 Duel, 2v2 Doubles, 3v3 Standard and high-stakes Tournaments — each with simulated matches, play-by-play commentary and MMR changes.
- **Clubs** — sign with teams as your MMR rises, earn signing bonuses and weekly salaries, and build chemistry.
- **Contracts** — rotating objectives with credit and XP rewards.
- **Achievements** — 15 milestones tracking your climb.
- **Leaderboard** — a simulated global ladder based around your MMR.
- **Saves** — automatic localStorage saves, plus export/import and reset in Settings.
- **3D match viewer** — a fully simulated 3D arena with detailed stadium, crowd, floodlights and five camera modes. Cars use forward-only steering with speed-sensitive turning, real front flips with a directional boost, and reverse out when stuck. AI assigns attackers, defenders and support players instead of everyone chasing the ball; kickoffs use a dedicated taker with wide support runs. The expanded 120×80 arena holds 28 small pads and 6 big pads; boost starts at 33 per kickoff, small pads add 12, big pads refill to 100, and burning boost raises the speed cap. Ball impacts transfer momentum based on car speed, with low rolling friction so it carries for ages. Solid-body collisions use speed-weighted effective mass, so a fast car bulldozes a slow one but both cars are bumped; cars and the ball never overlap or phase through each other. At Bronze level the rookie is slow, misreads the play and whiffs constantly; at Pro League he is fast, accurate and clinical. Open it from **Matches → Watch in 3D**, or visit `match3d.html?tier=bronze`.

## Game loop

1. Train to improve your attributes (costs energy, advances the week).
2. Play matches to earn MMR, XP and credits (also advances the week).
3. Spend level-up skill points on your strongest attributes.
4. Sign with better clubs as you climb.
5. Complete contracts and unlock achievements.

A season lasts 40 weeks. When it ends, the season counter increments and your career continues.

## Tech

- `index.html` — page structure
- `styles.css` — minimal dark UI, responsive layout
- `game.js` — all game state, simulation and rendering logic
- `match3d.html` / `match3d.js` / `match3d.css` — the 3D match viewer (Three.js)
- `vendor/three.module.js` — vendored Three.js so the 3D viewer works offline

## Hosting

This is a static site, so it works on GitHub Pages, Netlify, Vercel or any static host.

For GitHub Pages: **Settings → Pages → Source: Deploy from a branch → main → /root → Save**.
