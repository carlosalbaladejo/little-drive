# A Little Drive

A small 3D driving game set in a coastal town. Explore the roads, listen to the radio, and find marked parking spots. There is no finish line.

**[Play A Little Drive](https://carlosalbaladejo.github.io/little-drive/)**

- **Keyboard:** Arrow keys or WASD to steer and drive, **H** for the horn, **R** for the radio, **Space** to pause and **Esc** for settings.
- **Gamepad:** D-pad or left stick to steer; south button to accelerate, west to brake or reverse, east for the horn and north for the radio. **Start** pauses and **Select** opens settings.
- **Touch:** The driving buttons appear on touchscreens. Hold the pedals and steering buttons to drive.

The game needs WebGL. Progress and settings stay in your browser; no account or server is required.

## A working Link Arcade example

In [Link Arcade](https://carlosalbaladejo.github.io/link-arcade/), add the game by its playable URL: `https://carlosalbaladejo.github.io/little-drive/`. The same URL can be imported in the Android app for controller remapping.

- [`docs/index.html`](docs/index.html) is the launch page and declares the manifest with `<link rel="tv-game-manifest" href="./game.json">`.
- [`docs/game.json`](docs/game.json) declares the title, same-origin cover and logical controller actions.
- [`docs/drive.js`](docs/drive.js) consumes Link Arcade's `tv-game-input` snapshots. [`docs/browser-controls.js`](docs/browser-controls.js) handles touch and Gamepad API input in the standalone browser game without relying on the launcher.

See the [Link Arcade game compatibility specification](https://github.com/carlosalbaladejo/link-arcade/blob/main/spec/game-compatibility.md) for the full contract.

## Run locally

From the repository root, run `python3 -m http.server 8080 --bind 127.0.0.1 --directory docs` and open <http://127.0.0.1:8080/>. GitHub Pages serves the same static files. The vendored Three.js renderer is distributed under its [MIT license](docs/vendor/LICENSE).
