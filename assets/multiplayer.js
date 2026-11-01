// ============================================================================
// Cold World - Universal Cross-Device Real-Time Multiplayer & Spatial Voice Engine
// Designed for seamless synchronization across Phone (iOS/Android), PC, and Laptop
// Powered by Secure WebSocket Mesh (HiveMQ) + WebRTC (PeerJS) for Zero-Backend GitHub Pages
// ============================================================================

(function() {
  console.log("[Cold World Multiplayer] Initializing Universal Cross-Device Engine...");

  class UniversalMultiplayerEngine {
    constructor() {
      this.maxPlayers = 10;
      this.peers = new Map(); // id -> { name, avatar, audioElement, analyser, pos, quat, isMoving, lastSeen }
      this.myId = "cw_" + Math.random().toString(36).substring(2, 10);
      this.playerName = localStorage.getItem("cw_player_name") || ("Courier_" + Math.floor(100 + Math.random() * 900));
      
      // Networking & MQTT
      this.mqttClient = null;
      this.isMqttConnected = false;
      this.lastBroadcast = 0;
      this.broadcastInterval = 45; // ~22 Hz

      // WebRTC Voice Chat
      this.peer = null;
      this.localStream = null;
      this.isMicMuted = true;
      this.audioCtx = null;
      this.localAnalyser = null;
      this.localVolumeData = new Uint8Array(32);
      this.activeCalls = new Map(); // id -> call
      this.audioElements = new Map(); // id -> HTMLAudioElement

      this.initUI();
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
          console.log("[Cold World Multiplayer] 3D world connected! Starting cross-device network...");
          this.initMqttNetwork();
          this.initPeerVoice();
          this.startRenderLoop();
        }
      }, 500);
    }

    // --- Real-Time Universal Network (Phone + PC + Laptop Sync) ---
    initMqttNetwork() {
      if (typeof mqtt === "undefined") {
        console.warn("[Cold World Multiplayer] MQTT client loading, retrying in 1s...");
        setTimeout(() => this.initMqttNetwork(), 1000);
        return;
      }

      this.updateStatusUI("Connecting to Live World...", "#f59e0b");

      // Connect to HiveMQ Public WebSocket broker (TLS port 8884)
      // Works across every mobile carrier 4G/5G, home broadband, WiFi, and school firewalls
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

          // Subscribe to global world channels
          this.mqttClient.subscribe(["coldworld/global/presence", "coldworld/global/state"], (err) => {
            if (!err) {
              console.log("[Cold World Multiplayer] Joined global world channels!");
              // Announce our presence to everyone in the world
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

        // Periodic presence heartbeat every 4 seconds to sync newly loaded players
        setInterval(() => {
          if (this.isMqttConnected) {
            this.publishPresence("heartbeat");
            this.purgeStalePeers();
          }
        }, 4000);

      } catch (err) {
        console.error("[Cold World Multiplayer] Connection initialization error:", err);
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

      if (!data || data.id === this.myId) return; // Ignore own messages

      if (topic === "coldworld/global/presence") {
        if (data.type === "join" || data.type === "hello" || data.type === "heartbeat") {
          let p = this.peers.get(data.id);
          if (!p) {
            console.log(`[Cold World Multiplayer] Player joined world: ${data.name} (${data.id})`);
            p = this.createPeerRecord(data.id, data.name, data.pos, data.quat);
            this.peers.set(data.id, p);
            this.updatePlayerListUI();

            // Reply back if they just joined so they instantly see us too
            if (data.type === "join") {
              this.publishPresence("hello");
            }

            // If local mic is active, initiate WebRTC voice call to this peer
            if (this.localStream && !this.activeCalls.has(data.id)) {
              this.callPeer(data.id);
            }
          } else {
            p.lastSeen = performance.now();
            if (data.name && data.name !== p.name) {
              p.name = data.name;
              this.updateAvatarNameTag(p.avatar, p.name);
            }
          }
        } else if (data.type === "leave") {
          this.removePeer(data.id);
        }
      } else if (topic === "coldworld/global/state") {
        let p = this.peers.get(data.id);
        if (!p) {
          // Player wasn't recorded yet, auto-create
          p = this.createPeerRecord(data.id, data.name || "Courier", data.pos, data.quat);
          this.peers.set(data.id, p);
          this.updatePlayerListUI();
        }

        p.lastSeen = performance.now();
        if (data.pos && data.pos.length === 3) {
          p.pos.set(data.pos[0], data.pos[1], data.pos[2]);
          if (!p.avatar.visible) {
            p.avatar.position.copy(p.pos);
            p.avatar.visible = true;
          }
        }
        if (data.quat && data.quat.length === 4) {
          p.quat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
        }
        if (typeof data.isMoving === "boolean") {
          p.isMoving = data.isMoving;
        }
        if (data.name && data.name !== p.name) {
          p.name = data.name;
          this.updateAvatarNameTag(p.avatar, p.name);
        }
      }
    }

    createPeerRecord(id, name, initialPos = null, initialQuat = null) {
      const THREE = window.THREE;
      const pos = new THREE.Vector3(0, 30, 0);
      const quat = new THREE.Quaternion();

      if (initialPos && initialPos.length === 3) pos.set(initialPos[0], initialPos[1], initialPos[2]);
      if (initialQuat && initialQuat.length === 4) quat.set(initialQuat[0], initialQuat[1], initialQuat[2], initialQuat[3]);

      const avatar = this.createRemoteAvatar(name);
      if (initialPos) {
        avatar.position.copy(pos);
        avatar.quaternion.copy(quat);
        avatar.visible = true;
      }

      return {
        id: id,
        name: name,
        avatar: avatar,
        audioElement: this.audioElements.get(id) || null,
        analyser: null,
        pos: pos,
        quat: quat,
        isMoving: false,
        isSpeaking: false,
        animTime: 0,
        lastSeen: performance.now()
      };
    }

    purgeStalePeers() {
      const now = performance.now();
      this.peers.forEach((p, id) => {
        // If no packet received for 10 seconds, player left or closed tab
        if (now - p.lastSeen > 10000) {
          console.log(`[Cold World Multiplayer] Player timed out: ${p.name} (${id})`);
          this.removePeer(id);
        }
      });
    }

    removePeer(id) {
      const p = this.peers.get(id);
      if (p) {
        if (p.avatar && p.avatar.parent) {
          p.avatar.parent.remove(p.avatar);
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
        console.log("[Cold World Voice] Received incoming voice call from:", call.peer);
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

        // Voice Activity Detection for speaker icon
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

          // Local Voice Activity Detection Analyser
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

          // Call all currently active peers
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

    // --- 3D Avatar Creation & Rendering ---
    // Uses MeshBasicMaterial so avatars are 100% brightly visible everywhere on the planet
    createRemoteAvatar(name = "Courier") {
      const THREE = window.THREE;
      const g = new THREE.Group();
      g.name = "RemotePlayer_" + name;
      g.visible = false; // Hidden until first position packet arrives

      // Vibrant Courier Jacket
      const bodyMat = new THREE.MeshBasicMaterial({ color: "#2563eb" });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), bodyMat);
      body.position.y = 0.85;
      g.add(body);

      // Head & Cap
      const skinMat = new THREE.MeshBasicMaterial({ color: "#fbbf24" });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
      head.position.y = 1.35;

      const capMat = new THREE.MeshBasicMaterial({ color: "#1d4ed8" });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.42), capMat);
      cap.position.set(0, 1.5, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.22), capMat);
      visor.position.set(0, 1.45, 0.22);
      g.add(head, cap, visor);

      // Delivery Backpack & Parcel
      const packMat = new THREE.MeshBasicMaterial({ color: "#b45309" });
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.25), packMat);
      backpack.position.set(0, 0.85, -0.28);

      const parcelMat = new THREE.MeshBasicMaterial({ color: "#f59e0b" });
      const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.25, 0.2), parcelMat);
      parcel.position.set(0, 0.85, -0.45);
      g.add(backpack, parcel);

      // Limbs for Walking Animation
      const pantsMat = new THREE.MeshBasicMaterial({ color: "#1e293b" });
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), pantsMat);
      legL.position.set(0.14, 0.3, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), pantsMat);
      legR.position.set(-0.14, 0.3, 0);
      g.add(legL, legR);
      g._legL = legL;
      g._legR = legR;

      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), bodyMat);
      armL.position.set(0.35, 0.8, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), bodyMat);
      armR.position.set(-0.35, 0.8, 0);
      g.add(armL, armR);
      g._armL = armL;
      g._armR = armR;

      // 3D Billboard Name Tag
      const nameTag = this.createNameTagSprite(name);
      nameTag.position.y = 2.05;
      g.add(nameTag);
      g._nameTag = nameTag;

      // 3D Speaking Indicator
      const voiceIcon = this.createVoiceIconSprite();
      voiceIcon.position.y = 2.5;
      voiceIcon.visible = false;
      g.add(voiceIcon);
      g._voiceIcon = voiceIcon;

      if (window._scene) {
        window._scene.add(g);
      }
      return g;
    }

    createNameTagSprite(name) {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      this.drawNameTagCanvas(ctx, name, canvas.width, canvas.height);

      const tex = new THREE.Texture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), mat);
      mesh._canvas = canvas;
      mesh._ctx = ctx;
      return mesh;
    }

    drawNameTagCanvas(ctx, name, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(8, 8, w - 16, h - 16, 16);
      } else {
        ctx.rect(8, 8, w - 16, h - 16);
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, w / 2, h / 2);
    }

    updateAvatarNameTag(avatar, newName) {
      if (avatar && avatar._nameTag && avatar._nameTag._ctx) {
        this.drawNameTagCanvas(avatar._nameTag._ctx, newName, avatar._nameTag._canvas.width, avatar._nameTag._canvas.height);
        avatar._nameTag.material.map.needsUpdate = true;
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
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), mat);
      return mesh;
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

      // 1. Broadcast local player position & orientation over WebSocket at ~22Hz
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

      // 2. Local Voice Activity Detection
      if (this.localAnalyser && !this.isMicMuted) {
        this.localAnalyser.getByteFrequencyData(this.localVolumeData);
        let sum = 0;
        for (let i = 0; i < this.localVolumeData.length; i++) sum += this.localVolumeData[i];
        const avg = sum / this.localVolumeData.length;
        this.isLocalSpeaking = avg > 14;
        this.updateLocalVoiceWave(avg);
      }

      // 3. Update remote avatars & proximity audio
      const localPos = localChar.position;

      this.peers.forEach((p) => {
        if (!p.avatar) return;

        // Smooth position & rotation interpolation
        if (p.avatar.visible) {
          p.avatar.position.lerp(p.pos, 0.2);
          p.avatar.quaternion.slerp(p.quat, 0.2);
        }

        // Billboard name tag & speaking icon to face camera
        if (window._camera) {
          if (p.avatar._nameTag) {
            p.avatar._nameTag.quaternion.copy(p.avatar.quaternion).invert().multiply(window._camera.quaternion);
          }
          if (p.avatar._voiceIcon) {
            p.avatar._voiceIcon.quaternion.copy(p.avatar.quaternion).invert().multiply(window._camera.quaternion);
          }
        }

        // Walk / run limb animation
        if (p.isMoving) {
          p.animTime += 0.2;
          const swing = Math.sin(p.animTime) * 0.45;
          if (p.avatar._legL) p.avatar._legL.rotation.x = swing;
          if (p.avatar._legR) p.avatar._legR.rotation.x = -swing;
          if (p.avatar._armL) p.avatar._armL.rotation.x = -swing;
          if (p.avatar._armR) p.avatar._armR.rotation.x = swing;
        } else {
          if (p.avatar._legL) p.avatar._legL.rotation.x = 0;
          if (p.avatar._legR) p.avatar._legR.rotation.x = 0;
          if (p.avatar._armL) p.avatar._armL.rotation.x = 0;
          if (p.avatar._armR) p.avatar._armR.rotation.x = 0;
        }

        // Proximity 3D Voice Volume Attenuation
        const audioEl = p.audioElement || this.audioElements.get(p.id);
        if (audioEl) {
          const dist = localPos.distanceTo(p.avatar.position);
          // Full volume up to 12m, smooth falloff up to 75m, with audible presence everywhere
          let vol = 1.0;
          if (dist > 12.0) {
            vol = Math.max(0.15, 1.0 - (dist - 12.0) / 63.0);
          }
          audioEl.volume = Math.min(1.0, Math.max(0.0, vol));
        }

        // Remote Voice Activity Detection
        if (p.analyser) {
          const freqData = new Uint8Array(16);
          p.analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const isSpeaking = (sum / freqData.length) > 12;
          if (p.avatar._voiceIcon) {
            p.avatar._voiceIcon.visible = isSpeaking;
          }
        }
      });
    }

    // --- HUD UI Overlay ---
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

      // Status Badge (Shows Live Players in World)
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

      // Mic Button
      const micBtn = document.createElement("button");
      micBtn.id = "cw-mic-btn";
      micBtn.title = "Toggle Proximity Voice Chat (Hotkey: M)";
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
      micBtn.innerHTML = `<span>🔇 Mic: OFF</span> <span style="font-size:10px;opacity:0.8;">[M]</span>`;
      micBtn.onclick = () => this.toggleMic();

      // Change Name Button
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

      // Keyboard hotkey 'M' for mic toggle
      window.addEventListener("keydown", (e) => {
        if (e.key === "m" || e.key === "M") {
          if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
            this.toggleMic();
          }
        }
      });
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
          btn.innerHTML = `<span>🔇 Mic: MUTED</span> <span style="font-size:10px;opacity:0.8;">[M]</span>`;
        } else {
          btn.style.background = "rgba(34, 197, 94, 0.9)";
          btn.innerHTML = `<span>🎙️ Mic: LIVE</span> <span style="font-size:10px;opacity:0.8;">[M]</span>`;
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
    }
  }

  // Auto-instantiate when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new UniversalMultiplayerEngine());
  } else {
    new UniversalMultiplayerEngine();
  }
})();
