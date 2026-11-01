// ============================================================================
// Cold World - Universal Cross-Device Real-Time Multiplayer, Radar Map & Spatial Voice
// Features: Automatic Host World Synchronization, Native Character Mesh,
//           High-Altitude Sky Beacons, Live Radar HUD & Holographic World Map
// ============================================================================

(function() {
  console.log("[Cold World Multiplayer] Initializing Universal Engine with Host World Synchronization...");

  // Pure-math Quaternion to Euler [x, y, z] in radians (Zero-dependency)
  function quatToEulerArray(q) {
    const x = q.x || 0, y = q.y || 0, z = q.z || 0, w = (typeof q.w === "number") ? q.w : 1;
    const sinPitch = 2 * (w * x - y * z);
    let pitch, yaw, roll;
    if (Math.abs(sinPitch) >= 0.9999) {
      pitch = Math.sign(sinPitch) * (Math.PI / 2);
      yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
      roll = 0;
    } else {
      pitch = Math.asin(sinPitch);
      yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
      roll = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
    }
    return [pitch, yaw, roll];
  }

  // Known NPC Coordinates & Metadata across Cold World Biomes
  const KNOWN_NPCS = [
    { id: "office-worker", name: "Walking Man", biome: "Town Plaza", pos: [27.97, 1.41, 0.54], color: "#66bde6", icon: "🚶" },
    { id: "office-worker-2", name: "Office Worker", biome: "Town Plaza", pos: [26.25, 9.71, 1.40], color: "#c25959", icon: "💼" },
    { id: "chef", name: "Shop Keeper (Pierre)", biome: "Beach Boardwalk", pos: [20.36, 19.17, 2.20], color: "#66bde6", icon: "👨‍🍳" },
    { id: "flower-lady", name: "Flower Lady", biome: "Town Garden", pos: [27.43, 4.66, 3.58], color: "#f3c258", icon: "🌸" },
    { id: "threekid", name: "Toby the Kid", biome: "Town Plaza", pos: [27.60, 5.20, 1.40], color: "#66bde6", icon: "🧒" },
    { id: "diver", name: "Captain Steve", biome: "Coral Jetty", pos: [15.88, 16.90, 11.25], color: "#de794e", icon: "🤿" },
    { id: "musician", name: "Dave the Musician", biome: "Waterfalls", pos: [15.03, -14.79, -7.10], color: "#de794e", icon: "🎸" },
    { id: "scout", name: "Scout Oliver", biome: "Pine Forest", pos: [-7.80, -21.20, 7.80], color: "#8cc48c", icon: "🏕️" },
    { id: "caveman", name: "Cave Man", biome: "Ancient Cavern", pos: [-22.98, -3.73, 4.72], color: "#f3c258", icon: "🍖" },
    { id: "boss", name: "The Boss", biome: "High Cliffs", pos: [-4.05, 1.06, 25.45], color: "#c25959", icon: "👔" },
    { id: "mountainman", name: "Mountain Guy", biome: "Sacred Pagoda", pos: [-8.17, 32.35, -1.77], color: "#8cc48c", icon: "⛩️" },
    { id: "female-scientist", name: "Dr. Frebi", biome: "Research Lab", pos: [-7.46, -7.61, -19.69], color: "#66bde6", icon: "🔬" },
    { id: "male-scientist", name: "Dr. Frieb", biome: "Observatory", pos: [10.85, 23.34, -7.73], color: "#66bde6", icon: "🔭" },
    { id: "oldwoman", name: "Old Woman", biome: "Shrine Grove", pos: [23.37, -16.51, 12.46], color: "#8cc48c", icon: "👵" },
    { id: "fox", name: "Sneaky Fox", biome: "Pine Forest", pos: [-8.37, -20.37, 10.03], color: "#f97316", icon: "🦊" },
    { id: "owl", name: "Cliff Owl", biome: "Rocky Crags", pos: [-12.60, -22.75, -2.19], color: "#94a3b8", icon: "🦉" }
  ];

  class UniversalMultiplayerEngine {
    constructor() {
      this.peers = new Map(); // id -> peerData
      this.myId = "cw_" + Math.random().toString(36).substring(2, 10);
      this.playerName = localStorage.getItem("cw_player_name") || ("Courier_" + Math.floor(100 + Math.random() * 900));
      this.connectedAt = Date.now();
      this.hasSpawnSynced = false;

      // Networking & MQTT
      this.mqttClient = null;
      this.isMqttConnected = false;
      this.lastBroadcast = 0;
      this.broadcastInterval = 40; // ~25 Hz

      // WebRTC Voice Chat
      this.peer = null;
      this.localStream = null;
      this.isMicMuted = true;
      this.audioCtx = null;
      this.localAnalyser = null;
      this.localVolumeData = new Uint8Array(32);
      this.activeCalls = new Map();
      this.audioElements = new Map();

      // Radar & Map state
      this.radarAngle = 0;
      this.isMapOpen = false;
      this.nearestPeer = null;

      this.initUI();
      this.initRadarUI();
      this.initWorldMapModal();
      this.setupCleanup();
      this.waitForThreeScene();
    }

    setupCleanup() {
      const cleanup = () => {
        if (this.mqttClient && this.isMqttConnected) {
          try {
            this.mqttClient.publish("coldworld/global/presence", JSON.stringify({ type: "leave", id: this.myId }), { qos: 0 });
            this.mqttClient.end(true);
          } catch(e) {}
        }
        if (this.peer && !this.peer.destroyed) {
          try { this.peer.destroy(); } catch(e) {}
        }
      };
      window.addEventListener("beforeunload", cleanup);
      window.addEventListener("pagehide", cleanup);
    }

    waitForThreeScene() {
      const check = setInterval(() => {
        if (window._scene && window._characters && window.THREE) {
          clearInterval(check);
          console.log("[Cold World Multiplayer] 3D world ready! Starting network & world synchronization...");
          this.initMqttNetwork();
          this.initPeerVoice();
          this.startRenderLoop();
        }
      }, 500);
    }

    // --- Real-Time Universal Network (Phone + PC + Laptop Sync) ---
    initMqttNetwork() {
      if (typeof mqtt === "undefined") {
        setTimeout(() => this.initMqttNetwork(), 1000);
        return;
      }

      this.updateStatusUI("Connecting to Live World...", "#f59e0b");

      try {
        this.mqttClient = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
          clientId: this.myId,
          clean: true,
          connectTimeout: 8000,
          reconnectPeriod: 2500,
          keepalive: 20,
          will: {
            topic: "coldworld/global/presence",
            payload: JSON.stringify({ type: "leave", id: this.myId }),
            qos: 0,
            retain: false
          }
        });

        this.mqttClient.on("connect", () => {
          console.log("[Cold World Multiplayer] Connected to global WebSocket server!");
          this.isMqttConnected = true;
          this.updatePlayerListUI();

          this.mqttClient.subscribe(["coldworld/global/presence", "coldworld/global/state"], (err) => {
            if (!err) {
              console.log("[Cold World Multiplayer] Joined global channels! Announcing presence...");
              this.publishPresence("join");
            }
          });
        });

        this.mqttClient.on("message", (topic, payload) => {
          this.handleNetworkMessage(topic, payload);
        });

        this.mqttClient.on("offline", () => {
          this.isMqttConnected = false;
          this.updateStatusUI("Reconnecting to World...", "#f59e0b");
        });

        this.mqttClient.on("error", (err) => {
          console.warn("[Cold World Multiplayer] Network notice:", err);
        });

        setInterval(() => {
          if (this.isMqttConnected) {
            this.publishPresence("heartbeat");
            this.purgeStalePeers();
          }
        }, 4000);

      } catch (err) {
        console.error("[Cold World Multiplayer] Connection error:", err);
      }
    }

    publishPresence(type = "heartbeat") {
      if (!this.mqttClient || !this.isMqttConnected) return;
      const localChar = window._characters?.mesh?._localObject;
      const pos = localChar ? [localChar.position.x, localChar.position.y, localChar.position.z] : [0, 30, 0];
      const quat = localChar ? [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w] : [0, 0, 0, 1];

      const data = {
        type: type,
        id: this.myId,
        name: this.playerName,
        connectedAt: this.connectedAt,
        pos: pos,
        quat: quat
      };
      this.mqttClient.publish("coldworld/global/presence", JSON.stringify(data), { qos: 0 });
    }

    handleNetworkMessage(topic, payload) {
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch (e) {
        return;
      }

      if (!data || data.id === this.myId) return;

      if (topic === "coldworld/global/presence") {
        // --- 1. Automatic Host World Synchronization ---
        if (data.type === "join") {
          let p = this.peers.get(data.id);
          if (!p) {
            console.log(`[Cold World Multiplayer] Player joined: ${data.name} (${data.id})`);
            p = this.createPeerRecord(data.id, data.name, data.pos, data.quat);
            this.peers.set(data.id, p);
            this.updatePlayerListUI();
          }

          // If we were connected before this joining player, we act as the Host Anchor!
          // We transfer our exact world location so the joiner automatically spawns right next to us!
          const localChar = window._characters?.mesh?._localObject;
          if (localChar) {
            console.log(`[Cold World] Transferring host world location to new joiner: ${data.name}`);
            const syncMsg = {
              type: "world_sync",
              targetId: data.id,
              hostId: this.myId,
              hostName: this.playerName,
              hostPos: [localChar.position.x, localChar.position.y, localChar.position.z],
              hostQuat: [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w]
            };
            this.mqttClient.publish("coldworld/global/presence", JSON.stringify(syncMsg), { qos: 0 });
          }

          if (this.localStream && !this.activeCalls.has(data.id)) {
            this.callPeer(data.id);
          }
        }
        else if (data.type === "world_sync") {
          // Received world synchronization from the host!
          if (data.targetId === this.myId && !this.hasSpawnSynced) {
            this.hasSpawnSynced = true;
            console.log(`[Cold World] Received Host World Sync from ${data.hostName}! Teleporting to host location...`);
            this.showNotification(`🌍 Joined ${data.hostName}'s world!`);

            if (data.hostPos && data.hostPos.length === 3 && window._characters?.mesh) {
              const THREE = window.THREE;
              const hPos = new THREE.Vector3(...data.hostPos);
              const up = hPos.clone().normalize();
              // Spawn 2.2 meters to the side of the host
              const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, Math.random() * Math.PI * 2).multiplyScalar(2.2);
              const spawnTarget = hPos.clone().add(side);

              setTimeout(() => {
                try {
                  window._characters.mesh.setInitialPosition(
                    [spawnTarget.x, spawnTarget.y, spawnTarget.z],
                    2.0,
                    0,
                    up.toArray()
                  );
                  console.log("[Cold World] Spawn successfully aligned with Host!");
                  this.publishPresence("heartbeat");
                } catch(e) {
                  console.warn("[Multiplayer] Host alignment notice:", e);
                }
              }, 600);
            }
          }
        }
        else if (data.type === "hello" || data.type === "heartbeat") {
          let p = this.peers.get(data.id);
          if (!p) {
            p = this.createPeerRecord(data.id, data.name, data.pos, data.quat);
            this.peers.set(data.id, p);
            this.updatePlayerListUI();
          } else {
            p.lastSeen = performance.now();
            if (data.name && data.name !== p.name) {
              p.name = data.name;
              this.updateBeaconNameTag(p.beaconGroup, p.name);
            }
          }
        }
        else if (data.type === "leave") {
          this.removePeer(data.id);
        }
      }
      else if (topic === "coldworld/global/state") {
        let p = this.peers.get(data.id);
        if (!p) {
          p = this.createPeerRecord(data.id, data.name || "Courier", data.pos, data.quat);
          this.peers.set(data.id, p);
          this.updatePlayerListUI();
        }

        p.lastSeen = performance.now();
        if (data.pos && data.pos.length === 3) {
          p.pos.set(data.pos[0], data.pos[1], data.pos[2]);
        }
        if (data.quat && data.quat.length === 4) {
          p.quat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
        }
        if (typeof data.isMoving === "boolean") {
          p.isMoving = data.isMoving;
        }
        if (data.name && data.name !== p.name) {
          p.name = data.name;
          this.updateBeaconNameTag(p.beaconGroup, p.name);
        }

        this.updateNativeCharacter(p);
      }
    }

    createPeerRecord(id, name, initialPos = null, initialQuat = null) {
      const THREE = window.THREE;
      const pos = new THREE.Vector3(0, 30, 0);
      const quat = new THREE.Quaternion();

      if (initialPos && initialPos.length === 3) pos.set(initialPos[0], initialPos[1], initialPos[2]);
      if (initialQuat && initialQuat.length === 4) quat.set(initialQuat[0], initialQuat[1], initialQuat[2], initialQuat[3]);

      // 1. Create High-Altitude Sky Beacon (Visible across planet curvature)
      const beaconGroup = this.createSkyBeacon(name, pos);

      // 2. Create High-Fidelity 3D Courier Model
      const avatarGroup = this.createCustomAvatar(name);
      if (window._scene) {
        window._scene.add(avatarGroup);
      }

      const record = {
        id: id,
        name: name,
        pos: pos,
        quat: quat,
        currentPos: pos.clone(),
        currentQuat: quat.clone(),
        beaconGroup: beaconGroup,
        avatarGroup: avatarGroup,
        audioElement: this.audioElements.get(id) || null,
        analyser: null,
        isMoving: false,
        isSpeaking: false,
        distanceToLocal: 999,
        animTime: 0,
        lastSeen: performance.now()
      };

      // 3. Spawn native engine character
      this.spawnNativeCharacter(record);

      return record;
    }

    spawnNativeCharacter(peer) {
      if (!window._characters || !window._characters.mesh) return;
      const mesh = window._characters.mesh;

      if (!mesh._connection) {
        mesh._connection = { _clients: new Map() };
      }

      if (!mesh._charactersObjects.has(peer.id)) {
        const charData = {
          bonesFile: "avatar/avatar-bones",
          modelFiles: ["avatar/accessories/base"],
          animationFiles: [
            "avatar/avatar-idle",
            "avatar/avatar-run",
            "avatar/avatar-sprint",
            "avatar/avatar-air",
            "avatar/avatar-afk1",
            "avatar/avatar-afk2",
            "avatar/avatar-afk3"
          ],
          p: [peer.pos.x, peer.pos.y, peer.pos.z],
          r: [0, 0, 0],
          tag: peer.name
        };

        try {
          mesh._addCharacter(peer.id, charData);
          const obj = mesh._charactersObjects.get(peer.id);
          if (obj) {
            obj.scale.setScalar(1);
          }
        } catch (e) {
          console.warn("[Multiplayer] Native character spawn notice:", e);
        }
      }

      mesh._connection._clients.set(peer.id, {
        p: [peer.pos.x, peer.pos.y, peer.pos.z],
        r: [0, 0, 0],
        animation: 0
      });
    }

    updateNativeCharacter(peer) {
      if (!window._characters || !window._characters.mesh) return;
      const mesh = window._characters.mesh;
      if (!mesh._connection) {
        mesh._connection = { _clients: new Map() };
      }

      if (!mesh._charactersObjects.has(peer.id)) {
        this.spawnNativeCharacter(peer);
      } else {
        const obj = mesh._charactersObjects.get(peer.id);
        if (obj) {
          obj.scale.setScalar(1);
          obj.position.copy(peer.currentPos);
          obj.quaternion.copy(peer.currentQuat);
          obj.targetPosition.copy(peer.currentPos);
          obj.prevPosition.copy(peer.currentPos);
          obj.nextPosition.copy(peer.currentPos);
          obj.targetRotation.copy(peer.currentQuat);
          obj.prevRotation.copy(peer.currentQuat);
          obj.nextRotation.copy(peer.currentQuat);
        }
      }

      const euler = quatToEulerArray(peer.quat);
      mesh._connection._clients.set(peer.id, {
        p: [peer.pos.x, peer.pos.y, peer.pos.z],
        r: euler,
        animation: peer.isMoving ? 1 : 0
      });
    }

    // --- High-Fidelity 3D Courier Avatar (Always Visible Everywhere) ---
    createCustomAvatar(name) {
      const THREE = window.THREE;
      const g = new THREE.Group();
      g.name = "CustomAvatar_" + name;

      // Jacket (Courier Blue)
      const jacketMat = new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.7, metalness: 0.1 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.36), jacketMat);
      body.position.y = 0.85;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // Head & Cap
      const skinMat = new THREE.MeshStandardMaterial({ color: "#fcd34d", roughness: 0.8, metalness: 0.05 });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
      head.position.y = 1.36;
      head.castShadow = true;

      const capMat = new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.6, metalness: 0.1 });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.42), capMat);
      cap.position.set(0, 1.51, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.22), capMat);
      visor.position.set(0, 1.46, 0.22);
      g.add(head, cap, visor);

      // Backpack & Parcel
      const packMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.85, metalness: 0.1 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.26), packMat);
      pack.position.set(0, 0.85, -0.28);

      const parcelMat = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.8, metalness: 0.05 });
      const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.2), parcelMat);
      parcel.position.set(0, 0.85, -0.45);
      g.add(pack, parcel);

      // Animated Limbs
      const pantsMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.8, metalness: 0.1 });
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), pantsMat);
      legL.position.set(0.13, 0.3, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), pantsMat);
      legR.position.set(-0.13, 0.3, 0);
      g.add(legL, legR);
      g._legL = legL;
      g._legR = legR;

      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), jacketMat);
      armL.position.set(0.34, 0.8, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), jacketMat);
      armR.position.set(-0.34, 0.8, 0);
      g.add(armL, armR);
      g._armL = armL;
      g._armR = armR;

      return g;
    }

    // --- High-Altitude Sky Beacon (Visible over the planet horizon) ---
    createSkyBeacon(name, pos) {
      const THREE = window.THREE;
      const g = new THREE.Group();
      g.name = "SkyBeacon_" + name;

      // 1. Vertical Light Pillar (35 units tall, reaching into stratosphere)
      const beamGeo = new THREE.BoxGeometry(0.32, 35, 0.32);
      const beamMat = new THREE.MeshBasicMaterial({
        color: "#38bdf8",
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 17.5;
      g.add(beam);

      // 2. Glowing Apex Crystal at top of pillar
      const apexGeo = new THREE.SphereGeometry(0.85, 6, 6);
      const apexMat = new THREE.MeshBasicMaterial({ color: "#67e8f9" });
      const apex = new THREE.Mesh(apexGeo, apexMat);
      apex.position.y = 35;
      g.add(apex);

      // 3. Ground Landing Ring
      const ringGeo = new THREE.PlaneGeometry(2.6, 2.6);
      const ringMat = new THREE.MeshBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.6, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);

      // 4. 3D Billboard Name Tag & Live Distance Badge
      const nameTag = this.createNameTagSprite(name, "0m");
      nameTag.position.y = 2.4;
      g.add(nameTag);
      g._nameTag = nameTag;

      // 5. 3D Speaker Icon
      const voiceIcon = this.createVoiceIconSprite();
      voiceIcon.position.y = 2.9;
      voiceIcon.visible = false;
      g.add(voiceIcon);
      g._voiceIcon = voiceIcon;

      g.position.copy(pos);
      const up = pos.clone().normalize();
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

      if (window._scene) {
        window._scene.add(g);
      }
      return g;
    }

    createNameTagSprite(name, distText = "") {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 72;
      const ctx = canvas.getContext("2d");
      this.drawNameTagCanvas(ctx, name, distText, canvas.width, canvas.height);

      const tex = new THREE.Texture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), mat);
      mesh._canvas = canvas;
      mesh._ctx = ctx;
      mesh._name = name;
      return mesh;
    }

    drawNameTagCanvas(ctx, name, distText, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(6, 6, w - 12, h - 12, 16);
      } else {
        ctx.rect(6, 6, w - 12, h - 12);
      }
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, w / 2, distText ? 26 : h / 2);

      if (distText) {
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 16px monospace";
        ctx.fillText(distText, w / 2, 50);
      }
    }

    updateBeaconNameTag(beaconGroup, newName, distText = "") {
      if (beaconGroup && beaconGroup._nameTag && beaconGroup._nameTag._ctx) {
        const nt = beaconGroup._nameTag;
        nt._name = newName || nt._name;
        this.drawNameTagCanvas(nt._ctx, nt._name, distText, nt._canvas.width, nt._canvas.height);
        nt.material.map.needsUpdate = true;
      }
    }

    createVoiceIconSprite() {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "rgba(34, 197, 94, 0.95)";
      ctx.beginPath();
      ctx.arc(64, 64, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔊", 64, 64);

      const tex = new THREE.Texture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
      return new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), mat);
    }

    purgeStalePeers() {
      const now = performance.now();
      this.peers.forEach((p, id) => {
        if (now - p.lastSeen > 12000) {
          console.log(`[Cold World Multiplayer] Player timed out: ${p.name} (${id})`);
          this.removePeer(id);
        }
      });
    }

    removePeer(id) {
      const p = this.peers.get(id);
      if (p) {
        if (p.beaconGroup && p.beaconGroup.parent) {
          p.beaconGroup.parent.remove(p.beaconGroup);
        }
        if (p.avatarGroup && p.avatarGroup.parent) {
          p.avatarGroup.parent.remove(p.avatarGroup);
        }
        if (window._characters?.mesh) {
          try {
            window._characters.mesh._removeCharacter(id);
            if (window._characters.mesh._connection?._clients) {
              window._characters.mesh._connection._clients.delete(id);
            }
          } catch(e) {}
        }
        this.peers.delete(id);
      }

      const audioEl = this.audioElements.get(id);
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
        this.audioElements.delete(id);
      }

      const call = this.activeCalls.get(id);
      if (call) {
        try { call.close(); } catch(e) {}
        this.activeCalls.delete(id);
      }

      this.updatePlayerListUI();
      this.updateTrackerUI();
    }

    // --- Teleport / Meet Up Action ---
    teleportToPlayer(targetPeer) {
      if (!targetPeer || !window._characters?.mesh) return;
      const targetPos = targetPeer.pos;
      console.log(`[Cold World] Teleporting to ${targetPeer.name} at:`, targetPos);

      try {
        const mesh = window._characters.mesh;
        const up = targetPos.clone().normalize().toArray();
        mesh.setInitialPosition([targetPos.x, targetPos.y, targetPos.z], 2.2, 0, up);
        this.closeWorldMap();
        this.showNotification(`🚀 Teleported to ${targetPeer.name}!`);
        this.publishPresence("heartbeat");
      } catch (e) {
        console.error("[Cold World] Teleport error:", e);
      }
    }

    teleportToCoords(x, y, z, biomeName = "") {
      if (!window._characters?.mesh) return;
      const THREE = window.THREE;
      const target = new THREE.Vector3(x, y, z);
      const up = target.clone().normalize().toArray();
      window._characters.mesh.setInitialPosition([x, y, z], 2.0, 0, up);
      this.closeWorldMap();
      if (biomeName) {
        this.showNotification(`✈️ Traveled to ${biomeName}!`);
      }
    }

    showNotification(text) {
      const el = document.createElement("div");
      el.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999999;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(12px);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.5);
        border-radius: 20px;
        padding: 8px 18px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        animation: fadeIn 0.3s ease;
      `;
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.5s ease";
        setTimeout(() => el.remove(), 500);
      }, 3500);
    }

    // --- WebRTC Spatial Voice Chat (PeerJS) ---
    initPeerVoice() {
      if (typeof Peer === "undefined") {
        setTimeout(() => this.initPeerVoice(), 1000);
        return;
      }

      this.peer = new Peer(this.myId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" }
          ]
        }
      });

      this.peer.on("open", (id) => {
        console.log("[Cold World Voice] Voice peer ready:", id);
      });

      this.peer.on("call", (call) => {
        console.log("[Cold World Voice] Incoming call from:", call.peer);
        if (this.localStream) {
          call.answer(this.localStream);
        } else {
          call.answer();
        }
        this.activeCalls.set(call.peer, call);
        this.setupCall(call);
      });

      this.peer.on("error", (err) => {
        if (err.type === "peer-unavailable" || err.type === "unavailable-id") return;
        console.warn("[Cold World Voice] Peer notice:", err.type);
      });
    }

    callPeer(targetId) {
      if (!this.localStream || !this.peer || this.peer.destroyed) return;
      const existingCall = this.activeCalls.get(targetId);
      if (existingCall) {
        try { existingCall.close(); } catch(e) {}
      }

      console.log("[Cold World Voice] Calling player:", targetId);
      const call = this.peer.call(targetId, this.localStream);
      if (call) {
        this.activeCalls.set(targetId, call);
        this.setupCall(call);
      }
    }

    setupCall(call) {
      call.on("stream", (remoteStream) => {
        console.log("[Cold World Voice] Audio stream received from:", call.peer);

        let audioEl = this.audioElements.get(call.peer);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          document.body.appendChild(audioEl);
          this.audioElements.set(call.peer, audioEl);
        }

        audioEl.srcObject = remoteStream;
        audioEl.play().catch(e => console.warn("[Voice Autoplay]", e));

        const p = this.peers.get(call.peer);
        if (p) p.audioElement = audioEl;

        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          this.audioCtx = this.audioCtx || new AudioCtx();
          if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume().catch(() => {});
          }
          const src = this.audioCtx.createMediaStreamSource(remoteStream);
          const analyser = this.audioCtx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          if (p) p.analyser = analyser;
        } catch(e) {}
      });

      call.on("close", () => {
        const audioEl = this.audioElements.get(call.peer);
        if (audioEl) {
          audioEl.srcObject = null;
          audioEl.remove();
          this.audioElements.delete(call.peer);
        }
        this.activeCalls.delete(call.peer);
      });
    }

    async toggleMic() {
      if (this.isMicMuted) {
        await this.enableMic();
      } else {
        this.disableMic();
      }
    }

    async enableMic() {
      try {
        if (!this.localStream) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          this.localStream = stream;

          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = this.audioCtx || new AudioCtx();
            if (this.audioCtx.state === "suspended") {
              this.audioCtx.resume().catch(() => {});
            }
            const src = this.audioCtx.createMediaStreamSource(stream);
            this.localAnalyser = this.audioCtx.createAnalyser();
            this.localAnalyser.fftSize = 64;
            src.connect(this.localAnalyser);
          } catch(e) {}

          this.peers.forEach((p, peerId) => {
            this.callPeer(peerId);
          });
        } else {
          this.localStream.getAudioTracks().forEach(t => t.enabled = true);
          this.peers.forEach((p, peerId) => {
            if (!this.activeCalls.has(peerId)) {
              this.callPeer(peerId);
            }
          });
        }

        this.isMicMuted = false;
        this.updateMicUI();
      } catch (err) {
        console.error("[Cold World Voice] Microphone access error:", err);
        alert("Microphone permission is required for voice chat. Please allow mic access!");
      }
    }

    disableMic() {
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(t => t.enabled = false);
      }
      this.isMicMuted = true;
      this.isLocalSpeaking = false;
      this.updateMicUI();
    }

    // --- Main Render & Update Loop ---
    startRenderLoop() {
      const tick = () => {
        requestAnimationFrame(tick);
        this.update();
      };
      requestAnimationFrame(tick);
    }

    update() {
      const now = performance.now();
      const localChar = window._characters?.mesh?._localObject;
      if (!localChar) return;

      const THREE = window.THREE;

      // 1. Broadcast state at ~25Hz
      if (now - this.lastBroadcast > this.broadcastInterval && this.isMqttConnected) {
        this.lastBroadcast = now;
        const isMoving = (localChar.animationProps?.weights[1] || 0) > 0.1 || (localChar.animationProps?.weights[2] || 0) > 0.1;
        const stateMsg = {
          id: this.myId,
          name: this.playerName,
          pos: [localChar.position.x, localChar.position.y, localChar.position.z],
          quat: [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w],
          isMoving: isMoving
        };
        this.mqttClient.publish("coldworld/global/state", JSON.stringify(stateMsg), { qos: 0 });
      }

      // 2. Voice Activity Detection
      if (this.localAnalyser && !this.isMicMuted) {
        this.localAnalyser.getByteFrequencyData(this.localVolumeData);
        let sum = 0;
        for (let i = 0; i < this.localVolumeData.length; i++) sum += this.localVolumeData[i];
        const avg = sum / this.localVolumeData.length;
        this.isLocalSpeaking = avg > 14;
        this.updateLocalVoiceWave(avg);
      }

      // 3. Update remote avatars & Sky Beacons
      const localPos = localChar.position;
      let closestPeer = null;
      let minDistance = 9999;

      this.peers.forEach((p) => {
        p.currentPos.lerp(p.pos, 0.25);
        p.currentQuat.slerp(p.quat, 0.25);

        const dist = Math.round(localPos.distanceTo(p.pos));
        p.distanceToLocal = dist;

        if (dist < minDistance) {
          minDistance = dist;
          closestPeer = p;
        }

        // Update Custom Avatar (Courier Mesh)
        if (p.avatarGroup) {
          p.avatarGroup.position.copy(p.currentPos);
          p.avatarGroup.quaternion.copy(p.currentQuat);

          if (p.isMoving) {
            p.animTime += 0.25;
            const swing = Math.sin(p.animTime) * 0.45;
            if (p.avatarGroup._legL) p.avatarGroup._legL.rotation.x = swing;
            if (p.avatarGroup._legR) p.avatarGroup._legR.rotation.x = -swing;
            if (p.avatarGroup._armL) p.avatarGroup._armL.rotation.x = -swing;
            if (p.avatarGroup._armR) p.avatarGroup._armR.rotation.x = swing;
          } else {
            if (p.avatarGroup._legL) p.avatarGroup._legL.rotation.x = 0;
            if (p.avatarGroup._legR) p.avatarGroup._legR.rotation.x = 0;
            if (p.avatarGroup._armL) p.avatarGroup._armL.rotation.x = 0;
            if (p.avatarGroup._armR) p.avatarGroup._armR.rotation.x = 0;
          }
        }

        // Position Sky Beacon
        if (p.beaconGroup) {
          p.beaconGroup.position.copy(p.currentPos);
          const up = p.currentPos.clone().normalize();
          p.beaconGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

          if (Math.random() < 0.1) {
            this.updateBeaconNameTag(p.beaconGroup, p.name, `${dist}m`);
          }

          if (window._camera) {
            if (p.beaconGroup._nameTag) {
              p.beaconGroup._nameTag.quaternion.copy(p.beaconGroup.quaternion).invert().multiply(window._camera.quaternion);
            }
            if (p.beaconGroup._voiceIcon) {
              p.beaconGroup._voiceIcon.quaternion.copy(p.beaconGroup.quaternion).invert().multiply(window._camera.quaternion);
            }
          }
        }

        // Proximity Audio Attenuation
        const audioEl = p.audioElement || this.audioElements.get(p.id);
        if (audioEl) {
          let vol = 1.0;
          if (dist > 10.0) {
            vol = Math.max(0.1, 1.0 - (dist - 10.0) / 60.0);
          }
          audioEl.volume = Math.min(1.0, Math.max(0.0, vol));
        }

        // Voice Activity Icon
        if (p.analyser && p.beaconGroup?._voiceIcon) {
          const freqData = new Uint8Array(16);
          p.analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          p.beaconGroup._voiceIcon.visible = (sum / freqData.length) > 12;
        }
      });

      this.nearestPeer = closestPeer;
      this.updateTrackerUI();
      this.renderRadar();
    }

    // --- Live Mini-Map & Radar UI ---
    initRadarUI() {
      const radarWrapper = document.createElement("div");
      radarWrapper.id = "cw-radar-container";
      radarWrapper.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      const canvas = document.createElement("canvas");
      canvas.id = "cw-radar-canvas";
      canvas.width = 136;
      canvas.height = 136;
      canvas.style.cssText = `
        width: 136px;
        height: 136px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(15, 23, 42, 0.92) 0%, rgba(3, 7, 18, 0.96) 100%);
        border: 2px solid rgba(56, 189, 248, 0.45);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6), inset 0 0 16px rgba(56, 189, 248, 0.15);
        cursor: pointer;
        transition: transform 0.15s, border-color 0.2s;
      `;
      canvas.title = "Cold World Radar: Click or Press [M] to Open World Map";
      canvas.onclick = () => this.toggleWorldMap();
      this.radarCanvas = canvas;
      this.radarCtx = canvas.getContext("2d");

      const tracker = document.createElement("div");
      tracker.id = "cw-tracker-card";
      tracker.style.cssText = `
        display: none;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 14px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 700;
        color: #f8fafc;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      `;
      this.trackerCard = tracker;

      const mapBtn = document.createElement("button");
      mapBtn.id = "cw-map-btn";
      mapBtn.style.cssText = `
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(8px);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 20px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        transition: background 0.2s, transform 0.1s;
      `;
      mapBtn.innerHTML = `<span>🗺️ World Map</span> <span style="opacity:0.75;font-size:9px;">[M]</span>`;
      mapBtn.onclick = () => this.toggleWorldMap();

      radarWrapper.appendChild(tracker);
      radarWrapper.appendChild(canvas);
      radarWrapper.appendChild(mapBtn);
      document.body.appendChild(radarWrapper);

      window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === "m" || e.key === "M") {
          this.toggleWorldMap();
        } else if (e.key === "v" || e.key === "V") {
          this.toggleMic();
        } else if (e.key === "Escape" && this.isMapOpen) {
          this.closeWorldMap();
        }
      });
    }

    renderRadar() {
      const ctx = this.radarCtx;
      if (!ctx) return;
      const w = this.radarCanvas.width;
      const h = this.radarCanvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = cx - 4;

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Range Rings (15m, 30m, 50m)
      ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
      ctx.lineWidth = 1;
      [0.35, 0.65, 0.95].forEach(scale => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      // Rotating sweep
      this.radarAngle = (this.radarAngle + 0.035) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.radarAngle);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      grad.addColorStop(0, "rgba(56, 189, 248, 0.25)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, 0, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const localChar = window._characters?.mesh?._localObject;
      const localPos = localChar?.position;
      const cam = window._camera;

      if (localPos && cam) {
        const forward = new window.THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const up = localPos.clone().normalize();
        const tangentForward = forward.clone().sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
        const tangentRight = new window.THREE.Vector3().crossVectors(tangentForward, up).normalize();

        const radarRange = 45;

        // Draw NPCs on Radar (Amber Diamonds)
        KNOWN_NPCS.forEach(npc => {
          const npcVec = new window.THREE.Vector3(...npc.pos);
          const diff = npcVec.clone().sub(localPos);
          const dist = diff.length();
          if (dist < radarRange) {
            const xProj = diff.dot(tangentRight);
            const zProj = -diff.dot(tangentForward);
            const px = cx + (xProj / radarRange) * (radius * 0.88);
            const py = cy + (zProj / radarRange) * (radius * 0.88);

            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Draw Remote Players on Radar (Bright Cyan Pulsing Dots)
        this.peers.forEach(peer => {
          const diff = peer.pos.clone().sub(localPos);
          const dist = diff.length();
          const xProj = diff.dot(tangentRight);
          const zProj = -diff.dot(tangentForward);
          const norm = Math.hypot(xProj, zProj) || 1;
          const displayDist = Math.min(radius * 0.85, (dist / radarRange) * (radius * 0.85));
          const px = cx + (xProj / norm) * displayDist;
          const py = cy + (zProj / norm) * displayDist;

          ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 8px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(peer.name.slice(0, 10), px, py - 6);
        });

        // Local Player Icon (Green Arrow pointing forward)
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx - 4, cy + 4);
        ctx.lineTo(cx, cy + 2);
        ctx.lineTo(cx + 4, cy + 4);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    updateTrackerUI() {
      if (!this.trackerCard) return;
      if (this.nearestPeer) {
        this.trackerCard.style.display = "flex";
        this.trackerCard.innerHTML = `
          <span>🎯 <span style="color:#38bdf8;">${this.nearestPeer.name}</span>: ${this.nearestPeer.distanceToLocal}m</span>
          <button id="cw-quick-meet" style="background:#2563eb;color:#fff;border:none;padding:2px 7px;border-radius:10px;cursor:pointer;font-size:10px;font-weight:700;">🚀 Meet</button>
        `;
        const meetBtn = document.getElementById("cw-quick-meet");
        if (meetBtn) {
          meetBtn.onclick = (e) => {
            e.stopPropagation();
            this.teleportToPlayer(this.nearestPeer);
          };
        }
      } else {
        this.trackerCard.style.display = "none";
      }
    }

    // --- Full-Screen Interactive World Map Modal ---
    initWorldMapModal() {
      const modal = document.createElement("div");
      modal.id = "cw-world-map-modal";
      modal.style.cssText = `
        display: none;
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: rgba(3, 7, 18, 0.88);
        backdrop-filter: blur(12px);
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc;
        user-select: none;
      `;

      const card = document.createElement("div");
      card.style.cssText = `
        width: 100%;
        max-width: 780px;
        max-height: 90vh;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 20px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `;

      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(30, 41, 59, 0.5);
      `;
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">🗺️</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#f8fafc;">Cold World Map & Live Synchronizer</div>
            <div style="font-size:11px;color:#94a3b8;">Spherical World Topography • All NPCs & Online Players</div>
          </div>
        </div>
        <button id="cw-close-map" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;font-weight:700;">✕</button>
      `;

      const body = document.createElement("div");
      body.style.cssText = `
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        padding: 16px;
        gap: 16px;
        overflow-y: auto;
      `;

      const mapCanvas = document.createElement("canvas");
      mapCanvas.id = "cw-map-big-canvas";
      mapCanvas.width = 460;
      mapCanvas.height = 360;
      mapCanvas.style.cssText = `
        width: 100%;
        max-width: 460px;
        height: 360px;
        border-radius: 14px;
        background: #090d16;
        border: 1px solid rgba(56, 189, 248, 0.25);
      `;
      this.bigMapCanvas = mapCanvas;
      this.bigMapCtx = mapCanvas.getContext("2d");

      const sidebar = document.createElement("div");
      sidebar.id = "cw-map-sidebar";
      sidebar.style.cssText = `
        flex: 1;
        min-width: 220px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;

      body.appendChild(mapCanvas);
      body.appendChild(sidebar);
      card.appendChild(header);
      card.appendChild(body);
      modal.appendChild(card);
      document.body.appendChild(modal);

      this.worldMapModal = modal;
      const closeBtn = document.getElementById("cw-close-map");
      if (closeBtn) closeBtn.onclick = () => this.closeWorldMap();
    }

    toggleWorldMap() {
      if (this.isMapOpen) {
        this.closeWorldMap();
      } else {
        this.openWorldMap();
      }
    }

    openWorldMap() {
      this.isMapOpen = true;
      if (this.worldMapModal) {
        this.worldMapModal.style.display = "flex";
        this.renderBigWorldMap();
      }
    }

    closeWorldMap() {
      this.isMapOpen = false;
      if (this.worldMapModal) {
        this.worldMapModal.style.display = "none";
      }
    }

    renderBigWorldMap() {
      const ctx = this.bigMapCtx;
      if (!ctx) return;
      const w = this.bigMapCanvas.width;
      const h = this.bigMapCanvas.height;

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "#0c1527";
      ctx.fillRect(0, 0, w, h);

      // Lat/Long Grid
      ctx.strokeStyle = "rgba(56, 189, 248, 0.1)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Biomes
      const biomes = [
        { name: "🏖️ Seaside Bay", x: 60, y: 80, rx: 55, ry: 40, col: "rgba(14, 165, 233, 0.25)" },
        { name: "🏙️ Town Plaza", x: 180, y: 120, rx: 65, ry: 50, col: "rgba(245, 158, 11, 0.2)" },
        { name: "🌲 Pine Forest", x: 320, y: 220, rx: 75, ry: 55, col: "rgba(34, 197, 94, 0.2)" },
        { name: "🌸 Sacred Pagoda", x: 340, y: 90, rx: 60, ry: 45, col: "rgba(244, 114, 182, 0.25)" },
        { name: "🔬 Research Strip", x: 140, y: 260, rx: 65, ry: 50, col: "rgba(168, 85, 247, 0.2)" }
      ];

      biomes.forEach(b => {
        ctx.fillStyle = b.col;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(b.name, b.x, b.y);
      });

      const projectCoords = (pos) => {
        const theta = Math.atan2(pos[0], pos[2]);
        const phi = Math.asin(Math.max(-1, Math.min(1, pos[1] / 28.0)));
        const cx = ((theta + Math.PI) / (Math.PI * 2)) * w;
        const cy = ((Math.PI / 2 - phi) / Math.PI) * h;
        return { x: cx, y: cy };
      };

      // Draw all NPCs
      KNOWN_NPCS.forEach(npc => {
        const p = projectCoords(npc.pos);
        ctx.fillStyle = npc.color || "#f59e0b";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(npc.name, p.x, p.y - 7);
      });

      // Draw Remote Players
      this.peers.forEach(peer => {
        const p = projectCoords([peer.pos.x, peer.pos.y, peer.pos.z]);

        ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🔷 ${peer.name}`, p.x, p.y - 11);
      });

      // Draw Local Player
      const localChar = window._characters?.mesh?._localObject;
      if (localChar) {
        const p = projectCoords([localChar.position.x, localChar.position.y, localChar.position.z]);

        ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🟢 YOU", p.x, p.y - 12);
      }

      // Sidebar
      const sidebar = document.getElementById("cw-map-sidebar");
      if (sidebar) {
        let playersHtml = `
          <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Active Players in World (${this.peers.size + 1})</div>
          <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(30,41,59,0.7);padding:8px 12px;border-radius:10px;border-left:3px solid #22c55e;">
            <div>
              <div style="font-weight:700;font-size:12px;color:#fff;">${this.playerName} (You)</div>
              <div style="font-size:10px;color:#94a3b8;">Local Courier</div>
            </div>
            <span style="font-size:11px;color:#22c55e;">🟢 Here</span>
          </div>
        `;

        if (this.peers.size === 0) {
          playersHtml += `
            <div style="padding:12px;background:rgba(15,23,42,0.6);border-radius:10px;font-size:11px;color:#94a3b8;line-height:1.4;">
              Waiting for other players to join! When someone opens the game on Phone or Laptop, their location automatically transfers and syncs right next to you!
            </div>
          `;
        } else {
          this.peers.forEach((peer) => {
            playersHtml += `
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(30,41,59,0.7);padding:8px 12px;border-radius:10px;border-left:3px solid #38bdf8;">
                <div>
                  <div style="font-weight:700;font-size:12px;color:#fff;">${peer.name}</div>
                  <div style="font-size:10px;color:#38bdf8;">Distance: ${peer.distanceToLocal}m</div>
                </div>
                <button class="cw-teleport-btn" data-peer-id="${peer.id}" style="background:#2563eb;color:#fff;border:none;padding:5px 12px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;transition:transform 0.1s;">🚀 Meet Up</button>
              </div>
            `;
          });
        }

        playersHtml += `
          <div style="margin-top:6px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Fast Travel Biomes</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button class="cw-travel-btn" data-loc="town" style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);color:#f8fafc;padding:6px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">🏙️ Town Plaza</button>
            <button class="cw-travel-btn" data-loc="beach" style="background:rgba(14,165,233,0.2);border:1px solid rgba(14,165,233,0.4);color:#f8fafc;padding:6px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">🏖️ Beach</button>
            <button class="cw-travel-btn" data-loc="forest" style="background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.4);color:#f8fafc;padding:6px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">🌲 Pine Forest</button>
            <button class="cw-travel-btn" data-loc="pagoda" style="background:rgba(244,114,182,0.2);border:1px solid rgba(244,114,182,0.4);color:#f8fafc;padding:6px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">🌸 Mountain</button>
          </div>
        `;

        sidebar.innerHTML = playersHtml;

        sidebar.querySelectorAll(".cw-teleport-btn").forEach(btn => {
          btn.onclick = () => {
            const pid = btn.getAttribute("data-peer-id");
            const targetPeer = this.peers.get(pid);
            if (targetPeer) this.teleportToPlayer(targetPeer);
          };
        });

        sidebar.querySelectorAll(".cw-travel-btn").forEach(btn => {
          btn.onclick = () => {
            const loc = btn.getAttribute("data-loc");
            if (loc === "town") this.teleportToCoords(27.6, 5.2, 1.4, "Town Plaza");
            else if (loc === "beach") this.teleportToCoords(18.5, 14.5, 13.8, "Beach");
            else if (loc === "forest") this.teleportToCoords(-7.8, -21.2, 7.8, "Pine Forest");
            else if (loc === "pagoda") this.teleportToCoords(-8.17, 32.35, -1.77, "Sacred Mountain");
          };
        });
      }
    }

    // --- HUD Status and Voice UI ---
    initUI() {
      const container = document.createElement("div");
      container.id = "cw-multiplayer-hud";
      container.style.cssText = `
        position: fixed;
        top: 14px;
        left: 16px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        user-select: none;
      `;

      const statusBadge = document.createElement("div");
      statusBadge.id = "cw-status-badge";
      statusBadge.title = "Universal Live World (Phone, PC & Laptop Cross-Play)";
      statusBadge.style.cssText = `
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(10px);
        color: #f8fafc;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      statusBadge.innerHTML = `<span id="cw-status-text">🟡 Connecting...</span>`;

      const micBtn = document.createElement("button");
      micBtn.id = "cw-mic-btn";
      micBtn.title = "Toggle Proximity Voice Chat (Hotkey: V)";
      micBtn.style.cssText = `
        background: rgba(239, 68, 68, 0.88);
        backdrop-filter: blur(10px);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 6px 13px;
        border-radius: 20px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transition: transform 0.1s, background 0.2s, box-shadow 0.2s;
      `;
      micBtn.innerHTML = `<span>🔇 Mic: OFF</span> <span style="font-size:10px;opacity:0.8;">[V]</span>`;
      micBtn.onclick = () => this.toggleMic();

      const settingsBtn = document.createElement("button");
      settingsBtn.id = "cw-settings-btn";
      settingsBtn.title = "Change your Courier Name";
      settingsBtn.style.cssText = `
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 6px 11px;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;
      settingsBtn.innerHTML = `<span>⚙️ Name</span>`;
      settingsBtn.onclick = () => this.openSettings();

      container.appendChild(statusBadge);
      container.appendChild(micBtn);
      container.appendChild(settingsBtn);
      document.body.appendChild(container);
    }

    openSettings() {
      const newName = prompt("Enter your Courier name:", this.playerName);
      if (newName && newName.trim()) {
        this.playerName = newName.trim().slice(0, 16);
        localStorage.setItem("cw_player_name", this.playerName);
        this.publishPresence("heartbeat");
      }
    }

    updateStatusUI(text, color = "#f8fafc") {
      const el = document.getElementById("cw-status-text");
      if (el) {
        el.textContent = text;
        el.style.color = color;
      }
    }

    updateMicUI() {
      const btn = document.getElementById("cw-mic-btn");
      if (btn) {
        if (this.isMicMuted) {
          btn.style.background = "rgba(239, 68, 68, 0.85)";
          btn.innerHTML = `<span>🔇 Mic: MUTED</span> <span style="font-size:10px;opacity:0.8;">[V]</span>`;
        } else {
          btn.style.background = "rgba(34, 197, 94, 0.9)";
          btn.innerHTML = `<span>🎙️ Mic: LIVE</span> <span style="font-size:10px;opacity:0.8;">[V]</span>`;
        }
      }
    }

    updateLocalVoiceWave(avgVolume) {
      const btn = document.getElementById("cw-mic-btn");
      if (btn && !this.isMicMuted) {
        if (avgVolume > 14) {
          btn.style.boxShadow = "0 0 16px rgba(34, 197, 94, 0.85)";
        } else {
          btn.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
        }
      }
    }

    updatePlayerListUI() {
      const count = this.peers.size + 1;
      this.updateStatusUI(`🟢 Live World (${count} Player${count > 1 ? "s" : ""})`, "#22c55e");
      if (this.isMapOpen) {
        this.renderBigWorldMap();
      }
    }
  }

  // Auto-instantiate
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new UniversalMultiplayerEngine());
  } else {
    new UniversalMultiplayerEngine();
  }
})();
