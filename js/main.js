// Main Entry Point for Messenger Planet
// Orchestrates Three.js rendering, camera tracking, and game loop

class MessengerGame {
  constructor() {
    this.container = document.getElementById('game-container');
    this.clock = new THREE.Clock();
    this.isRunning = false;

    // Interaction prompt UI
    this.promptEl = document.getElementById('interaction-prompt');
    this.promptText = document.getElementById('prompt-action-text');

    this.initThree();
    this.initLights();
    this.initStarfield();
    this.initGameObjects();
    this.initIntroScreen();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1220); // Deep twilight blue
    this.scene.fog = new THREE.FogExp2(0x0c1220, 0.007);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.container.appendChild(this.renderer.domElement);
    this.controls = new ControlsManager(this.renderer.domElement);
  }

  initLights() {
    // Soft sky and ground bounce
    const hemiLight = new THREE.HemisphereLight(0xfff8ee, 0x1e293b, 0.75);
    this.scene.add(hemiLight);

    // Warm Sun
    this.sunLight = new THREE.DirectionalLight(0xfffaf0, 1.25);
    this.sunLight.position.set(60, 80, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 200;
    const d = 50;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Cool rim light for space contrast
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-60, -40, -50);
    this.scene.add(rimLight);
  }

  initStarfield() {
    const starGeom = new THREE.BufferGeometry();
    const count = 750;
    const positions = [];
    const colors = [];

    const starColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const radius = 220 + Math.random() * 80;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * radius;
      const sinPhi = Math.sin(phi);

      positions.push(
        r * sinPhi * Math.cos(theta),
        r * sinPhi * Math.sin(theta),
        r * Math.cos(phi)
      );

      starColor.setHSL(0.6 + Math.random() * 0.15, 0.6, 0.8 + Math.random() * 0.2);
      colors.push(starColor.r, starColor.g, starColor.b);
    }

    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const starPoints = new THREE.Points(starGeom, starMat);
    this.scene.add(starPoints);
  }

  initGameObjects() {
    // 1. Spherical Planet
    this.planet = new Planet(this.scene);

    // 2. Player
    this.player = new Player(this.planet);
    this.scene.add(this.player.group);
    window.player = this.player;

    // 3. Citizens / NPCs
    this.npcManager = new NPCManager(this.planet);

    // 4. Quests & Delivery Manager
    this.questManager = new QuestManager(this.player, this.npcManager);
  }

  initIntroScreen() {
    const startBtn = document.getElementById('start-game-btn');
    const introScreen = document.getElementById('intro-screen');

    startBtn?.addEventListener('click', () => {
      // Start official music and audio context on user gesture
      window.audioManager?.init();

      introScreen.style.opacity = '0';
      setTimeout(() => {
        introScreen.classList.add('hidden');
        this.isRunning = true;
      }, 400);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Camera tracking relative to spherical player surface
  updateCamera(delta) {
    const playerPos = this.player.getWorldPosition();
    const up = playerPos.clone().normalize();

    // Tangent reference vectors on sphere surface
    let forwardRef = new THREE.Vector3(0, 0, 1);
    if (Math.abs(up.dot(forwardRef)) > 0.95) {
      forwardRef.set(1, 0, 0);
    }
    const right = new THREE.Vector3().crossVectors(up, forwardRef).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    // Rotate camera offset by azimuth around UP and elevation above surface
    const camDist = this.controls.camDistance;
    const az = this.controls.camAzimuth;
    const el = this.controls.camElevation;

    // Vector in local tangent space
    const horizDist = camDist * Math.cos(el);
    const vertDist = camDist * Math.sin(el);

    const localCamOffset = forward.clone().multiplyScalar(Math.cos(az) * horizDist)
      .add(right.clone().multiplyScalar(Math.sin(az) * horizDist))
      .add(up.clone().multiplyScalar(vertDist));

    const targetCamPos = playerPos.clone().add(localCamOffset);
    
    // Smooth camera lerp
    this.camera.position.lerp(targetCamPos, 0.12);
    
    // Look at player slightly above feet
    const lookTarget = playerPos.clone().add(up.clone().multiplyScalar(1.2));
    this.camera.lookAt(lookTarget);
    this.camera.up.copy(up);
  }

  // Check closest citizen for interaction prompt
  checkInteractions() {
    if (this.questManager.isDialogueActive) {
      this.promptEl.classList.add('hidden');
      return;
    }

    const playerPos = this.player.getWorldPosition();
    const closestNPC = this.npcManager.getClosestNPC(playerPos, 3.8);

    if (closestNPC) {
      this.promptEl.classList.remove('hidden');
      this.promptText.textContent = `Talk to ${closestNPC.name}`;

      if (this.controls.interactPressed) {
        this.controls.interactPressed = false;
        this.questManager.interactWithNPC(closestNPC);
      }
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  start() {
    this.renderer.setAnimationLoop(() => this.loop());
  }

  loop() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    this.controls.updateInput();

    // Only update player movement if not currently locked in dialogue
    if (!this.questManager.isDialogueActive) {
      this.player.update(
        delta,
        this.controls.moveVector,
        this.controls.isJumping,
        this.controls.isSprinting,
        this.camera
      );
    }

    this.updateCamera(delta);
    this.checkInteractions();

    this.planet.update(delta);
    this.npcManager.update(delta, elapsedTime);
    this.questManager.updateCompass(this.player.getWorldPosition(), this.camera);

    this.renderer.render(this.scene, this.camera);
  }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  const game = new MessengerGame();
  game.start();
});
