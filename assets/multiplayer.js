
// ============================================================================
// Cold World - Real-Time 3D Multiplayer & Proximity Voice Chat Engine
// Powered by WebRTC & PeerJS for zero-backend static deployment (GitHub Pages)
// Supports up to 10 simultaneous players per room with 3D avatars & spatial audio
// ============================================================================

(function() {
  console.log("[Cold World Multiplayer] Initializing...");

  class MultiplayerEngine {
    constructor() {
      this.maxPlayers = 10;
      this.peers = new Map(); // peerId -> { conn, call, avatar, gainNode, analyser, stream, name, pos, quat, isMoving }
      this.peer = null;
      this.mySlot = -1;
      this.myPeerId = null;
      this.room = this.getRoomFromURL() || "cold-world-plaza";
      this.playerName = localStorage.getItem("cw_player_name") || ("Courier_" + Math.floor(100 + Math.random() * 900));
      this.localStream = null;
      this.isMicMuted = true;
      this.audioCtx = null;
      this.localAnalyser = null;
      this.localVolumeData = new Uint8Array(32);
      this.isLocalSpeaking = false;
      this.lastBroadcast = 0;
      this.broadcastInterval = 45; // ~22 Hz
      this.activeCalls = new Map(); // peerId -> call

      this.initUI();
      this.waitForThreeScene();
    }

    getRoomFromURL() {
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get("room") || null;
      } catch (e) {
        return null;
      }
    }

    waitForThreeScene() {
      const check = setInterval(() => {
        if (window._scene && window._characters && window.THREE) {
          clearInterval(check);
          console.log("[Cold World Multiplayer] Three.js scene & characters connected!");
          this.initNetwork();
          this.startRenderLoop();
        }
      }, 500);
    }

    // --- Networking (PeerJS Mesh Room) ---
    initNetwork() {
      if (typeof Peer === "undefined") {
        console.warn("[Cold World Multiplayer] PeerJS not loaded yet, retrying...");
        setTimeout(() => this.initNetwork(), 1000);
        return;
      }

      this.updateStatusUI("Connecting to room...", "#f59e0b");
      this.findAvailableSlot(0);
    }

    findAvailableSlot(slot) {
      if (slot >= this.maxPlayers) {
        this.updateStatusUI(`Room full (10/${this.maxPlayers})`, "#ef4444");
        return;
      }

      const testId = `cw_${this.cleanRoom(this.room)}_${slot}`;
      const tempPeer = new Peer(testId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" }
          ]
        }
      });

      tempPeer.on("open", (id) => {
        this.mySlot = slot;
        this.myPeerId = id;
        this.peer = tempPeer;
        console.log(`[Cold World Multiplayer] Connected as Slot #${slot} (${id}) in room '${this.room}'`);
        this.setupPeerEvents();
        this.connectToOtherSlots();
      });

      tempPeer.on("error", (err) => {
        if (err.type === "unavailable-id") {
          tempPeer.destroy();
          this.findAvailableSlot(slot + 1);
        } else {
          console.warn("[Cold World Multiplayer] Peer error:", err);
          this.updateStatusUI("Network error: " + err.type, "#ef4444");
        }
      });
    }

    cleanRoom(r) {
      return r.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    }

    setupPeerEvents() {
      this.updateStatusUI(`🟢 Online (${this.peers.size + 1}/${this.maxPlayers})`, "#22c55e");

      // Incoming data connections
      this.peer.on("connection", (conn) => {
        this.handleIncomingConnection(conn);
      });

      // Incoming audio voice calls
      this.peer.on("call", (call) => {
        console.log("[Cold World Voice] Incoming voice call from", call.peer);
        call.answer(this.localStream);
        this.handleVoiceCall(call);
      });

      this.peer.on("disconnected", () => {
        this.updateStatusUI("Reconnecting...", "#f59e0b");
        this.peer.reconnect();
      });
    }

    connectToOtherSlots() {
      for (let s = 0; s < this.maxPlayers; s++) {
        if (s === this.mySlot) continue;
        const targetId = `cw_${this.cleanRoom(this.room)}_${s}`;
        const conn = this.peer.connect(targetId, {
          reliable: false,
          metadata: { name: this.playerName, slot: this.mySlot }
        });
        this.setupConnectionHandlers(conn);
      }
    }

    handleIncomingConnection(conn) {
      this.setupConnectionHandlers(conn);
    }

    setupConnectionHandlers(conn) {
      conn.on("open", () => {
        console.log("[Cold World Multiplayer] Connected to peer:", conn.peer);
        const remotePeerData = {
          conn: conn,
          name: conn.metadata?.name || ("Courier_" + conn.peer.slice(-3)),
          avatar: this.createRemoteAvatar(conn.metadata?.name),
          pos: new window.THREE.Vector3(0, 30, 0),
          quat: new window.THREE.Quaternion(),
          isMoving: false,
          isSpeaking: false,
          animTime: 0
        };
        this.peers.set(conn.peer, remotePeerData);
        this.updatePlayerListUI();

        // If local mic is active, initiate WebRTC voice call
        if (this.localStream && !this.activeCalls.has(conn.peer)) {
          const call = this.peer.call(conn.peer, this.localStream);
          this.activeCalls.set(conn.peer, call);
          this.handleVoiceCall(call);
        }
      });

      conn.on("data", (data) => {
        this.handlePeerData(conn.peer, data);
      });

      conn.on("close", () => {
        this.removePeer(conn.peer);
      });

      conn.on("error", () => {
        this.removePeer(conn.peer);
      });
    }

    handlePeerData(peerId, data) {
      const p = this.peers.get(peerId);
      if (!p) return;

      if (data.type === "state") {
        if (data.pos) p.pos.set(data.pos[0], data.pos[1], data.pos[2]);
        if (data.quat) p.quat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
        if (typeof data.isMoving === "boolean") p.isMoving = data.isMoving;
        if (data.name && data.name !== p.name) {
          p.name = data.name;
          this.updateAvatarNameTag(p.avatar, p.name);
          this.updatePlayerListUI();
        }
      }
    }

    removePeer(peerId) {
      const p = this.peers.get(peerId);
      if (p) {
        if (p.avatar && p.avatar.parent) {
          p.avatar.parent.remove(p.avatar);
        }
        if (p.audioElement) {
          p.audioElement.srcObject = null;
          p.audioElement.remove();
        }
        this.activeCalls.delete(peerId);
        this.peers.delete(peerId);
        this.updatePlayerListUI();
      }
    }

    // --- 3D Avatar Creation & Rendering ---
    createRemoteAvatar(name = "Courier") {
      const THREE = window.THREE;
      const g = new THREE.Group();
      g.name = "RemotePlayer_" + name;

      // Courier jacket body
      const bodyMat = new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.8, metalness: 0.1, flatShading: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), bodyMat);
      body.position.y = 0.85;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // Head with courier cap
      const skinMat = new THREE.MeshStandardMaterial({ color: "#fcd34d", roughness: 0.8, metalness: 0.1, flatShading: true });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
      head.position.y = 1.35;
      head.castShadow = true;
      const capMat = new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.8, metalness: 0.1, flatShading: true });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.42), capMat);
      cap.position.set(0, 1.5, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.22), capMat);
      visor.position.set(0, 1.45, 0.22);
      g.add(head, cap, visor);

      // Delivery parcel backpack
      const packMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.9, metalness: 0.1, flatShading: true });
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.25), packMat);
      backpack.position.set(0, 0.85, -0.28);
      const parcelMat = new THREE.MeshStandardMaterial({ color: "#d97706", roughness: 0.9, metalness: 0.1, flatShading: true });
      const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.25, 0.2), parcelMat);
      parcel.position.set(0, 0.85, -0.45);
      g.add(backpack, parcel);

      // Limbs (Legs & Arms for walk animation)
      const pantsMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.9, metalness: 0.1, flatShading: true });
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
      const nameTagSprite = this.createNameTagSprite(name);
      nameTagSprite.position.y = 1.95;
      g.add(nameTagSprite);
      g._nameTag = nameTagSprite;

      // 3D Speaking Indicator Icon
      const voiceIconSprite = this.createVoiceIconSprite();
      voiceIconSprite.position.y = 2.45;
      voiceIconSprite.visible = false;
      g.add(voiceIconSprite);
      g._voiceIcon = voiceIconSprite;

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
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.4, 0.35, 1);
      sprite._canvas = canvas;
      sprite._ctx = ctx;
      return sprite;
    }

    drawNameTagCanvas(ctx, name, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(8, 8, w - 16, h - 16, 16);
      } else {
        ctx.rect(8, 8, w - 16, h - 16);
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
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

      ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
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
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.45, 0.45, 1);
      return sprite;
    }

    // --- Real-Time Proximity Voice Chat ---
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

          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          this.audioCtx = this.audioCtx || new AudioContextClass();
          if (this.audioCtx.state === "suspended") {
            await this.audioCtx.resume();
          }

          const src = this.audioCtx.createMediaStreamSource(stream);
          this.localAnalyser = this.audioCtx.createAnalyser();
          this.localAnalyser.fftSize = 64;
          src.connect(this.localAnalyser);

          // Call all connected peers with audio stream
          this.peers.forEach((p, peerId) => {
            if (!this.activeCalls.has(peerId)) {
              const call = this.peer.call(peerId, this.localStream);
              this.activeCalls.set(peerId, call);
              this.handleVoiceCall(call);
            }
          });
        } else {
          this.localStream.getAudioTracks().forEach(t => t.enabled = true);
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

    handleVoiceCall(call) {
      call.on("stream", (remoteStream) => {
        console.log("[Cold World Voice] Received remote audio stream from", call.peer);
        const p = this.peers.get(call.peer);
        if (!p) return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = this.audioCtx || new AudioContextClass();

        const src = this.audioCtx.createMediaStreamSource(remoteStream);
        const gainNode = this.audioCtx.createGain();
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 64;

        src.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        p.gainNode = gainNode;
        p.analyser = analyser;
        p.audioStream = remoteStream;

        const audioEl = document.createElement("audio");
        audioEl.srcObject = remoteStream;
        audioEl.muted = true;
        audioEl.play().catch(() => {});
        p.audioElement = audioEl;
      });
    }

    // --- Main Update Loop (Frame by Frame) ---
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

      // 1. Broadcast local player state at ~22Hz
      if (now - this.lastBroadcast > this.broadcastInterval && this.peers.size > 0) {
        this.lastBroadcast = now;
        const isMoving = (localChar.animationProps?.weights[1] || 0) > 0.1 || (localChar.animationProps?.weights[2] || 0) > 0.1;
        const msg = {
          type: "state",
          name: this.playerName,
          pos: [localChar.position.x, localChar.position.y, localChar.position.z],
          quat: [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w],
          isMoving: isMoving
        };
        this.peers.forEach((p) => {
          if (p.conn && p.conn.open) {
            p.conn.send(msg);
          }
        });
      }

      // 2. Check local Voice Activity Detection (VAD)
      if (this.localAnalyser && !this.isMicMuted) {
        this.localAnalyser.getByteFrequencyData(this.localVolumeData);
        let sum = 0;
        for (let i = 0; i < this.localVolumeData.length; i++) sum += this.localVolumeData[i];
        const avg = sum / this.localVolumeData.length;
        this.isLocalSpeaking = avg > 14;
        this.updateLocalVoiceWave(avg);
      }

      // 3. Update remote avatars & proximity 3D audio attenuation
      const localPos = localChar.position;
      const maxAudioDist = 32.0;

      this.peers.forEach((p) => {
        if (!p.avatar) return;

        // Smooth position & rotation interpolation
        p.avatar.position.lerp(p.pos, 0.15);
        p.avatar.quaternion.slerp(p.quat, 0.15);

        // Walk / run limb animation
        if (p.isMoving) {
          p.animTime += 0.18;
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

        // Proximity Voice Attenuation
        const dist = localPos.distanceTo(p.avatar.position);
        if (p.gainNode && this.audioCtx) {
          let vol = 0;
          if (dist < 4.0) {
            vol = 1.0;
          } else if (dist < maxAudioDist) {
            vol = Math.max(0, 1.0 - (dist - 4.0) / (maxAudioDist - 4.0));
            vol = vol * vol; // Quadratic smooth falloff
          }
          p.gainNode.gain.setTargetAtTime(vol, this.audioCtx.currentTime, 0.05);
        }

        // Remote Voice Activity Detection (Speaker Icon over head)
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

    // --- UI Overlay ---
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

      // Status Badge (Shows online player count)
      const statusBadge = document.createElement("div");
      statusBadge.id = "cw-status-badge";
      statusBadge.title = "Multiplayer status: You are connected to the live planet!";
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
      statusBadge.innerHTML = `<span id="cw-status-text">🟡 Joining Planet...</span>`;

      // Mic Button (Voice Chat Mute/Unmute)
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

      // Invite Friends Button (Copies invite link to clipboard)
      const roomBtn = document.createElement("button");
      roomBtn.id = "cw-room-btn";
      roomBtn.title = "Click to copy your multiplayer invite link to share with friends!";
      roomBtn.style.cssText = `
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(10px);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.4);
        padding: 6px 13px;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transition: transform 0.1s, background 0.2s;
      `;
      roomBtn.innerHTML = `<span>🔗 Invite Friends</span> <span style="font-size:11px;opacity:0.85;">(${this.room})</span>`;
      roomBtn.onclick = () => this.copyInviteLink();

      // Change Name / Room Button
      const settingsBtn = document.createElement("button");
      settingsBtn.id = "cw-settings-btn";
      settingsBtn.title = "Change your courier name or room";
      settingsBtn.style.cssText = `
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 6px 10px;
        border-radius: 20px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;
      settingsBtn.innerHTML = `⚙️`;
      settingsBtn.onclick = () => this.openSettings();

      container.appendChild(statusBadge);
      container.appendChild(micBtn);
      container.appendChild(roomBtn);
      container.appendChild(settingsBtn);
      document.body.appendChild(container);

      // Keyboard hotkey 'M' for microphone toggle
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
      }
      const newRoom = prompt("Enter Room Name (e.g. cold-world-plaza, secret-peaks):", this.room);
      if (newRoom && newRoom.trim() && newRoom.trim() !== this.room) {
        window.location.search = "?room=" + encodeURIComponent(newRoom.trim());
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
      this.updateStatusUI(`🟢 Online (${this.peers.size + 1}/${this.maxPlayers})`, "#22c55e");
    }

    copyInviteLink() {
      const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(this.room)}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById("cw-room-btn");
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = `<span style="color:#22c55e;">Copied Link!</span>`;
          setTimeout(() => { btn.innerHTML = original; }, 2000);
        }
      }).catch(() => {
        prompt("Copy multiplayer invite link to share with friends:", url);
      });
    }
  }

  // Auto-instantiate when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new MultiplayerEngine());
  } else {
    new MultiplayerEngine();
  }
})();
