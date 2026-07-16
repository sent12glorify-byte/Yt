// Cosmic Web Explorer - Spaceship Navigation System
// Started: 2026-07-16 05:11 AM UTC
// Location: Between Sun and Moon, viewing Earth

class SpaceshipNavigator {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = {};
        this.celestialObjects = {};
        this.cosmicData = null;
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = Date.now();
        
        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLighting();
        this.setupControls();
        this.loadCosmicData();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e27);
        
        // Add starfield
        this.createStarfield();
    }

    createStarfield() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 10000;
        const positions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 200000;
            positions[i + 1] = (Math.random() - 0.5) * 200000;
            positions[i + 2] = (Math.random() - 0.5) * 200000;
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 100,
            sizeAttenuation: true,
            opacity: 0.8
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000000
        );
        this.camera.position.set(0, 50, 100);
        this.camera.lookAt(0, 0, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
    }

    setupLighting() {
        // Sun lighting (from -149.6M km distance)
        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(-149600000, 0, 0);
        sunLight.castShadow = true;
        sunLight.shadow.camera.far = 500000000;
        this.scene.add(sunLight);

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);
    }

    setupControls() {
        this.controls = {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false,
            moveUp: false,
            moveDown: false,
            speed: 500
        };

        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('wheel', (e) => this.onMouseWheel(e), false);
    }

    onKeyDown(event) {
        switch (event.key.toUpperCase()) {
            case 'W': this.controls.moveForward = true; break;
            case 'S': this.controls.moveBackward = true; break;
            case 'A': this.controls.moveLeft = true; break;
            case 'D': this.controls.moveRight = true; break;
            case ' ': this.controls.moveUp = true; event.preventDefault(); break;
            case 'Control': this.controls.moveDown = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.key.toUpperCase()) {
            case 'W': this.controls.moveForward = false; break;
            case 'S': this.controls.moveBackward = false; break;
            case 'A': this.controls.moveLeft = false; break;
            case 'D': this.controls.moveRight = false; break;
            case ' ': this.controls.moveUp = false; break;
            case 'Control': this.controls.moveDown = false; break;
        }
    }

    onMouseMove(event) {
        const deltaX = event.movementX * 0.005;
        const deltaY = event.movementY * 0.005;

        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.camera.quaternion);

        euler.setFromVector3(new THREE.Vector3(euler.x - deltaY, euler.y - deltaX, 0));
        this.camera.quaternion.setFromEuler(euler);
    }

    onMouseWheel(event) {
        event.preventDefault();
        this.controls.speed += event.deltaY > 0 ? -50 : 50;
        this.controls.speed = Math.max(100, Math.min(5000, this.controls.speed));
    }

    async loadCosmicData() {
        try {
            const response = await fetch('/api/scene');
            this.cosmicData = await response.json();
            this.createCelestialObjects();
        } catch (error) {
            console.error('Error loading cosmic data:', error);
        }
    }

    createCelestialObjects() {
        if (!this.cosmicData) return;

        this.cosmicData.celestial_objects.forEach(obj => {
            let geometry, material, mesh;

            if (obj.type === 'star') {
                // Sun: Glowing sphere
                geometry = new THREE.IcosahedronGeometry(696000 * 0.01, 32);
                material = new THREE.MeshBasicMaterial({
                    color: 0xfdb813,
                    emissive: 0xfdb813
                });
                mesh = new THREE.Mesh(geometry, material);

                // Add glow effect
                const glowGeometry = new THREE.IcosahedronGeometry(696000 * 0.012, 32);
                const glowMaterial = new THREE.MeshBasicMaterial({
                    color: 0xfdb813,
                    transparent: true,
                    opacity: 0.1
                });
                const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
                mesh.add(glowMesh);
            } else if (obj.type === 'planet') {
                // Earth: Textured sphere
                geometry = new THREE.IcosahedronGeometry(6371 * 0.1, 32);
                material = new THREE.MeshStandardMaterial({
                    color: 0x2e7d32,
                    metalness: 0.3,
                    roughness: 0.7
                });
                mesh = new THREE.Mesh(geometry, material);
                
                // Add atmospheric glow
                const atmosphereGeometry = new THREE.IcosahedronGeometry(6371 * 0.105, 32);
                const atmosphereMaterial = new THREE.MeshBasicMaterial({
                    color: 0x4da6ff,
                    transparent: true,
                    opacity: 0.1,
                    side: THREE.BackSide
                });
                const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
                mesh.add(atmosphere);
            } else if (obj.type === 'satellite') {
                // Moon: Gray sphere
                geometry = new THREE.IcosahedronGeometry(1737 * 0.1, 16);
                material = new THREE.MeshStandardMaterial({
                    color: 0x9e9e9e,
                    metalness: 0.1,
                    roughness: 0.9
                });
                mesh = new THREE.Mesh(geometry, material);
            }

            mesh.position.set(obj.x, obj.y, obj.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = obj;
            this.scene.add(mesh);
            this.celestialObjects[obj.name] = mesh;
        });
    }

    updateHUD() {
        // Update camera position
        const camPos = this.camera.position;
        document.getElementById('camera-pos').textContent = 
            `${camPos.x.toFixed(0)}, ${camPos.y.toFixed(0)}, ${camPos.z.toFixed(0)}`;

        // Update zoom level
        const zoomLevel = (this.controls.speed / 500).toFixed(1);
        document.getElementById('zoom').textContent = `${zoomLevel}x`;

        // Update FPS
        this.frameCount++;
        const currentTime = Date.now();
        if (currentTime - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            document.getElementById('fps').textContent = this.fps;
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
    }

    updateCamera(deltaTime) {
        const direction = new THREE.Vector3();
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        this.camera.getWorldDirection(forward);
        right.crossVectors(forward, up).normalize();
        up.crossVectors(right, forward).normalize();

        const distance = this.controls.speed * deltaTime;

        if (this.controls.moveForward) direction.addScaledVector(forward, distance);
        if (this.controls.moveBackward) direction.addScaledVector(forward, -distance);
        if (this.controls.moveLeft) direction.addScaledVector(right, -distance);
        if (this.controls.moveRight) direction.addScaledVector(right, distance);
        if (this.controls.moveUp) direction.addScaledVector(up, distance);
        if (this.controls.moveDown) direction.addScaledVector(up, -distance);

        this.camera.position.add(direction);
    }

    animate = () => {
        requestAnimationFrame(this.animate);

        const deltaTime = 1 / 60; // Assuming 60 FPS

        this.updateCamera(deltaTime);
        this.updateHUD();

        this.renderer.render(this.scene, this.camera);
    };
}

// Lock pointer on click
document.addEventListener('click', () => {
    document.getElementById('canvas-container').requestPointerLock =
        document.getElementById('canvas-container').requestPointerLock ||
        document.getElementById('canvas-container').mozRequestPointerLock;
    document.getElementById('canvas-container').requestPointerLock();
});

// Initialize on page load
window.addEventListener('load', () => {
    new SpaceshipNavigator();
});
