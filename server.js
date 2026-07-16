import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Cosmic data aggregator
class CosmicDataAggregator {
  constructor() {
    this.nasaKey = process.env.NASA_API_KEY || 'DEMO_KEY';
    this.earthPosition = this.calculateEarthPosition();
    this.moonPosition = this.calculateMoonPosition();
  }

  calculateEarthPosition() {
    const date = new Date('2026-07-16T05:11:00Z');
    return {
      x: 0,
      y: 0,
      z: 0,
      name: 'Earth',
      radius: 6371,
      type: 'planet',
      data: {
        mass: '5.972e24 kg',
        distance_from_sun: '149.6 million km',
        orbital_speed: '29.78 km/s'
      }
    };
  }

  calculateMoonPosition() {
    const date = new Date('2026-07-16T05:11:00Z');
    const distance = 384400; // km from Earth
    const angle = (date.getTime() / (27.3 * 24 * 3600 * 1000)) * Math.PI * 2;
    return {
      x: Math.cos(angle) * distance * 0.001,
      y: 0,
      z: Math.sin(angle) * distance * 0.001,
      name: 'Moon',
      radius: 1737,
      type: 'satellite',
      parent: 'Earth',
      data: {
        mass: '7.342e22 kg',
        distance_from_earth: '384,400 km',
        orbital_period: '27.3 days'
      }
    };
  }

  calculateSunPosition() {
    return {
      x: -149.6 * 1000 * 0.001,
      y: 0,
      z: 0,
      name: 'Sun',
      radius: 696000,
      type: 'star',
      data: {
        mass: '1.989e30 kg',
        luminosity: '3.828e26 W',
        surface_temp: '5778 K',
        age: '4.603 billion years'
      }
    };
  }

  async fetchNASAImagery() {
    try {
      const response = await fetch(
        `https://api.nasa.gov/planetary/earth/imagery?lon=0&lat=0&dim=512&api_key=${this.nasaKey}`
      );
      return await response.json();
    } catch (error) {
      console.error('NASA imagery fetch error:', error);
      return null;
    }
  }

  async fetchAPOD() {
    try {
      const response = await fetch(
        `https://api.nasa.gov/planetary/apod?api_key=${this.nasaKey}&count=10`
      );
      return await response.json();
    } catch (error) {
      console.error('APOD fetch error:', error);
      return [];
    }
  }

  async getCosmicScene() {
    return {
      timestamp: new Date('2026-07-16T05:11:00Z').toISOString(),
      observer_position: 'Earth',
      celestial_objects: [
        this.calculateSunPosition(),
        this.calculateEarthPosition(),
        this.calculateMoonPosition()
      ],
      camera: {
        position: [0, 50, 100],
        target: [0, 0, 0],
        fov: 75
      }
    };
  }
}

const aggregator = new CosmicDataAggregator();

// API Routes
app.get('/api/scene', async (req, res) => {
  try {
    const scene = await aggregator.getCosmicScene();
    res.json(scene);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/earth', (req, res) => {
  res.json(aggregator.earthPosition);
});

app.get('/api/moon', (req, res) => {
  res.json(aggregator.moonPosition);
});

app.get('/api/sun', (req, res) => {
  res.json(aggregator.calculateSunPosition());
});

app.get('/api/nasa/imagery', async (req, res) => {
  try {
    const imagery = await aggregator.fetchNASAImagery();
    res.json(imagery);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nasa/apod', async (req, res) => {
  try {
    const apod = await aggregator.fetchAPOD();
    res.json(apod);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Cosmic Web Explorer running on http://localhost:${PORT}`);
  console.log(`📍 Starting position: Earth (2026-07-16 05:11 AM UTC)`);
  console.log(`🌙 Moon position: ${aggregator.moonPosition.x.toFixed(2)}, ${aggregator.moonPosition.z.toFixed(2)}`);
});
