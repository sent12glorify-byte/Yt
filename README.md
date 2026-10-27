# Heavenward — Egyptian Angel Arena

The default Node server page is now **Heavenward**, an original playable arena prototype about an Egyptian angel defending Heaven. Run `npm start`, then use `/arena/`. Play starts immediately as the invincible Creator in Heaven’s Fields. Choose arena opens five additional combat styles, four arenas, three mission types, freelance contracts, and free four-player co-op rooms. Keyboard/mouse and touch controls are included. Fictional gold buys upgrades saved locally in your browser; there are no real-money transactions.

Run `node --test tests/*.test.js` to validate both the game simulation and the existing Cloudy platform. Build a standalone offline game with `node scripts/build-arena.mjs`; open `dist/Heavenward.html` directly in a browser. See [game controls and scope](public/arena/README.md).

This is a stylized prototype with solo and cooperative battles against bots. The GitHub Pages workflow builds the standalone web edition, cover gallery, action videos, and downloadable ZIP. The web edition includes browser-hosted WebRTC rooms (beta); the host keeps the game open and connectivity depends on the players’ networks. The Node edition also supports server-hosted rooms. Xbox-style controller input is included for browsers; this is not a certified native Xbox release. It does not include motion capture, photorealism, or copied content from other video games.

---

# ☁ Cloudy — A space for possibility

The development server also provides **Cloudy**, a fullscreen cloud studio with JPEG glimmers, custom morphs, PNG/video capture, and a downloadable morph journal, plus a prompt-driven app workspace and hosting bundle builder. Run `npm start` and visit `/cloud/`. The original server-side explorer is retained at `/index.html`; the original iOS 1 static explorer is preserved in `universal-explorer.html`.

See [Cloudy setup, browser preview, and hosting instructions](cloud/README.md). To create a browser-openable single-file preview, run `node scripts/build-preview.mjs`. The repository's root `index.html` is that self-contained browser edition for GitHub Pages. Refresh it with `node scripts/build-preview.mjs index.html` after changing Cloudy.

---

# 🚀 Cosmic Web Explorer - Spaceship Navigation System

A real-time, immersive universe explorer featuring authentic astronomical data, video-quality rendering, and spaceship-based navigation interface.

## 📍 Starting Position
- **Date/Time**: July 16, 2026, 05:11 AM UTC
- **Location**: Between Sun and Moon
- **Observer**: Earth
- **Status**: Ready for cosmic exploration

## ✨ Features

### 🌌 3D Universe Visualization
- **10,000 Stars** dynamically rendered in 3D space
- **Sun** - Glowing star with atmospheric effects (149.6M km away)
- **Earth** - Textured planet with atmospheric layer (current position)
- **Moon** - Accurately positioned satellite (384,400 km from Earth)
- Real-time astronomical calculations

### 🛸 Spaceship Navigation Interface
- **First-person camera** system with full 6-DOF movement
- **Heads-Up Display (HUD)** showing:
  - Current location and time
  - Distance to celestial objects
  - Real-time telemetry (FPS, camera position, zoom level)
  - Cosmic object tracking
- **Smooth control scheme**:
  - W/A/S/D - Movement
  - SPACE - Ascend | CTRL - Descend
  - Mouse - Free look
  - Mouse Wheel - Adjust speed

### 📡 Real Data Integration
- **NASA API Integration** (APOD, Earth Imagery)
- **Accurate Orbital Mechanics**
- **Live Astronomical Data** feeds
- Extensible architecture for additional data sources

### 🎨 Cinematic Visual Effects
- **Directional lighting** from the Sun
- **Atmospheric scattering** effects
- **Glow and bloom** effects on celestial objects
- **Backdrop starfield** with depth
- **Real-time shadows** and reflections

## 🛠️ Tech Stack

- **Frontend**: Three.js (WebGL 3D rendering)
- **Backend**: Node.js + Express (Data aggregation)
- **APIs**: NASA APIs, SpaceX, ESA, Gaia
- **Visualization**: Real-time 3D graphics at 60 FPS+

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- NASA API Key (get free at https://api.nasa.gov)

### Installation

```bash
# Clone the repository
git clone https://github.com/sent12glorify-byte/Yt.git
cd Yt

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Add your NASA API key to .env
echo "NASA_API_KEY=your_key_here" >> .env

# Start the server
npm start
```

### Access the Explorer
Open your browser to `http://localhost:3000`

## 🎮 Controls

| Control | Action |
|---------|--------|
| **Click** | Lock pointer |
| **W/A/S/D** | Move forward/left/backward/right |
| **SPACE** | Move up |
| **CTRL** | Move down |
| **Mouse Move** | Look around |
| **Mouse Wheel** | Adjust speed |
| **Click Object** | Get data panel |

## 📊 Data Sources

### Currently Integrated
- ✅ NASA APOD (Astronomy Picture of the Day)
- ✅ NASA Earth Imagery
- ✅ Real astronomical calculations
- ✅ Orbital mechanics

### Planned Integration
- 🔜 ESA/Gaia stellar database
- 🔜 SpaceX Starlink tracking
- 🔜 Real-time satellite data
- 🔜 Exoplanet catalog
- 🔜 Black hole simulations
- 🔜 Deep space objects (galaxies, nebulae)

## 🌟 Project Goals

1. **Authentic Universe Representation** - Replace mock-ups with real data
2. **Immersive Navigation** - Spaceship interface for intuitive exploration
3. **Educational Value** - Learn actual astronomy while exploring
4. **Performance Optimization** - Smooth 60+ FPS rendering at any scale
5. **SpaceX Integration** - Track real spacecraft and missions
6. **Community Contributions** - Open source cosmos exploration

## 🔧 Architecture

```
Cosmic Web Explorer/
├── server.js                 # Express backend + cosmic data aggregator
├── public/
│   ├── index.html           # Main HUD interface
│   ├── spaceship.js         # 3D scene and navigation logic
│   └── style.css            # Sci-fi styling
├── package.json             # Dependencies
└── .env.example             # Configuration template
```

## 🎓 Learning Resources

- Three.js Documentation: https://threejs.org/docs/
- NASA APIs: https://api.nasa.gov/
- Orbital Mechanics: https://en.wikipedia.org/wiki/Orbital_mechanics
- Space Science: https://www.nasa.gov/

## 📈 Performance Targets

- **60+ FPS** on modern hardware
- **<100ms** API response times
- **Real-time** 3D rendering with 10,000+ objects
- **Smooth** camera movement across massive scale ranges

## 🤝 Contributing

This project welcomes contributions! Areas for help:
- 🌟 New data source integrations
- 🎨 Visual effects improvements
- 🚀 Performance optimizations
- 📱 Mobile support
- 🐛 Bug fixes and improvements

## 📝 License

MIT - Open source and free for everyone

## 🙏 Inspiration

Inspired by space exploration, SpaceX innovation, and the wonder of our universe.

---

**Status**: 🟢 Active Development  
**Last Updated**: 2026-07-16  
**Version**: 1.0.0-alpha
