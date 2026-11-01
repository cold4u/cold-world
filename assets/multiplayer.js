// ============================================================================
// Cold World - Direct Seamless Global Multiplayer & Spatial Voice Chat Engine
// Powered by WebRTC & PeerJS for zero-backend static deployment (GitHub Pages)
// Everyone automatically and directly joins the same shared world without any links!
// ============================================================================

(function() {
  console.log("[Cold World Multiplayer] Initializing direct global multiplayer...");

  class MultiplayerEngine {
    constructor() {
      this.maxPlayers = 10;
      this.peers = new Map(); // peerId -> { conn, call, avatar, audioElement, analyser, name, pos, quat, isMoving }
      this.audioElements = new Map(); // peerId -> HTMLAudioElement
      this.peer = null;
      this.mySlot = -1;
      this.myPeerId = null;
      this.playerName = localStorage.getItem("cw_player_name") || ("Courier_" + Math.floor(100 + Math.random() * 900));
      this.localStream = null;
      this.isMicMuted = true;
      this.localAnalyser = null;
      this.localVolumeData = new Uint8Array(32);
      this.isLocalSpeaking = false;
      this.lastBroadcast = 0;
      this.broadcastInterval = 40; // 25 Hz
      this.activeCalls = new Map(); // peerId -> call
      this.scanInterval = null;

      this.initUI();
      this.setupCleanup();
      this.waitForThreeScene();
    }

    setupCleanup() {
      // Cleanly destroy PeerJS session on tab close or refresh to immediately free the slot
      window.addEventListener("beforeunload", () => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.destroy();
        }
      });
      window.addEventListener("pagehide", () => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.destroy();
        }
      });
    }

    waitForThreeScene() {
      const check = setInterval(() => {
        if (window._scene && window._characters && window.THREE) {
          clearInterval(check);
          console.log("[Cold World Multiplayer] 3D world ready! Connecting directly to global live world...");
          this.initNetwork();
          this.startRenderLoop();
        }
      }, 500);
    }

    // --- Direct Automatic Global Room Connection ---
    initNetwork() {
      if (typeof Peer === "undefined") {
        console.warn("[Cold World Multiplayer] PeerJS loading, retrying in 1s...");
        setTimeout(() => this.initNetwork(), 1000);
        return;
      }

      this.updateStatusUI("Joining Live World...", "#f59e0b");
      this.findAvailableSlot(0);
    }

    findAvailableSlot(slot = 0) {
      if (slot >= this.maxPlayers) {
        this.updateStatusUI("World Full (10/10 Players)", "#ef4444");
        // Retry slot 0 after 4s in case an existing player disconnected
        setTimeout(() => this.findAvailableSlot(0), 4000);
        return;
      }

      const slotId = `cw_world_courier_${slot}`;

      const tempPeer = new Peer(slotId, {
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
        console.log(`[Cold World Multiplayer] Directly connected to global world as Courier #${slot}`);
        this.setupPeerEvents();
        this.scanAllSlots();

        // Continuously scan for new players joining other slots every 3.5s
        if (this.scanInterval) clearInterval(this.scanInterval);
        this.scanInterval = setInterval(() => this.scanAllSlots(), 3500);
      });

      tempPeer.on("error", (err) => {
        if (err.type === "unavailable-id") {
          tempPeer.destroy();
          // Slot already in use by another active player, claim next slot
          this.findAvailableSlot(slot + 1);
        } else if (err.type === "peer-unavailable") {
          // Expected when probing slots that are currently empty
        } else {
          console.warn("[Cold World Multiplayer] Peer notice:", err.type);
        }
      });
    }

    setupPeerEvents() {
      this.updatePlayerListUI();

      // Handle incoming data connections from other players
      this.peer.on("connection", (conn) => {
        console.log("[Cold World Multiplayer] Incoming connection from:", conn.peer);
        this.setupConnectionHandlers(conn);
      });

      // Handle incoming voice calls
      this.peer.on("call", (call) => {
        console.log("[Cold World Voice] Incoming voice call from:", call.peer);
        if (this.localStream) {
          call.answer(this.localStream);
        } else {
          call.answer();
        }
        this.activeCalls.set(call.peer, call);
        this.setupCall(call);
      });

      this.peer.on("disconnected", () => {
        this.updateStatusUI("Reconnecting...", "#f59e0b");
        this.peer.reconnect();
      });

      this.peer.on("error", (err) => {
        if (err.type === "peer-unavailable" || err.type === "unavailable-id") {
          return;
        }
        console.warn("[Cold World Multiplayer] Network status:", err.type);
      });
    }

    scanAllSlots() {
      if (!this.peer || this.peer.destroyed) return;

      for (let s = 0; s < this.maxPlayers; s++) {
        if (s === this.mySlot) continue;
        const targetId = `cw_world_courier_${s}`;
        
        // Skip if already connected
        if (this.peers.has(targetId)) continue;

        const conn = this.peer.connect(targetId, {
          metadata: { name: this.playerName, slot: this.mySlot }
        });
        this.setupConnectionHandlers(conn);
      }
    }

    setupConnectionHandlers(conn) {
      const onOpen = () => {
        if (this.peers.has(conn.peer)) return;
        console.log("[Cold World Multiplayer] Established connection with:", conn.peer);

        const localChar = window._characters?.mesh?._localObject;
        const initialPos = localChar ? localChar.position.clone() : new window.THREE.Vector3(0, 30, 0);
        const initialQuat = localChar ? localChar.quaternion.clone() : new window.THREE.Quaternion();

        const remotePeerData = {
          conn: conn,
          name: conn.metadata?.name || ("Courier_" + conn.peer.slice(-3)),
          avatar: this.createRemoteAvatar(conn.metadata?.name),
          audioElement: this.audioElements.get(conn.peer) || null,
          analyser: null,
          pos: initialPos,
          quat: initialQuat,
          isMoving: false,
          isSpeaking: false,
          animTime: 0,
          hasReceivedFirstState: false
        };

        this.peers.set(conn.peer, remotePeerData);
        this.updatePlayerListUI();

        // Immediately send handshake with local player's position
        if (localChar) {
          conn.send({
            type: "handshake",
            name: this.playerName,
            pos: [localChar.position.x, localChar.position.y, localChar.position.z],
            quat: [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w]
          });
        }

        // If our microphone is live, call the peer
        if (this.localStream && !this.activeCalls.has(conn.peer)) {
          this.callPeer(conn.peer);
        }
      };

      // Support both immediate open and delayed open event
      if (conn.open) {
        onOpen();
      } else {
        conn.on("open", onOpen);
      }

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

    broadcastLocalState(targetConn = null) {
      const localChar = window._characters?.mesh?._localObject;
      if (!localChar) return;

      const isMoving = (localChar.animationProps?.weights[1] || 0) > 0.1 || (localChar.animationProps?.weights[2] || 0) > 0.1;
      const msg = {
        type: "state",
        name: this.playerName,
        pos: [localChar.position.x, localChar.position.y, localChar.position.z],
        quat: [localChar.quaternion.x, localChar.quaternion.y, localChar.quaternion.z, localChar.quaternion.w],
        isMoving: isMoving
      };

      if (targetConn && targetConn.open) {
        targetConn.send(msg);
      } else {
        this.peers.forEach((p) => {
          if (p.conn && p.conn.open) {
            p.conn.send(msg);
          }
        });
      }
    }

    handlePeerData(peerId, data) {
      const p = this.peers.get(peerId);
      if (!p) return;

      if (data.type === "handshake") {
        if (data.name) {
          p.name = data.name;
          this.updateAvatarNameTag(p.avatar, p.name);
          this.updatePlayerListUI();
        }
        if (data.pos && data.pos.length === 3) {
          p.pos.set(data.pos[0], data.pos[1], data.pos[2]);
          p.avatar.position.copy(p.pos);
          p.avatar.visible = true;
          p.hasReceivedFirstState = true;
        }
        if (data.quat && data.quat.length === 4) {
          p.quat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
          p.avatar.quaternion.copy(p.quat);
        }
        // Respond with our current state so both players are instantly synchronized
        this.broadcastLocalState(p.conn);
        return;
      }

      if (data.type === "state") {
        if (data.pos && data.pos.length === 3) {
          p.pos.set(data.pos[0], data.pos[1], data.pos[2]);
          if (!p.hasReceivedFirstState && p.avatar) {
            p.hasReceivedFirstState = true;
            p.avatar.position.copy(p.pos);
            p.avatar.visible = true;
          }
        }
        if (data.quat && data.quat.length === 4) {
          p.quat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
          if (!p.hasReceivedFirstState && p.avatar) {
            p.avatar.quaternion.copy(p.quat);
          }
        }
        if (typeof data.isMoving === "boolean") {
          p.isMoving = data.isMoving;
        }
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
        this.peers.delete(peerId);
      }
      const audioEl = this.audioElements.get(peerId);
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
        this.audioElements.delete(peerId);
      }
      const call = this.activeCalls.get(peerId);
      if (call) {
        try { call.close(); } catch(e) {}
        this.activeCalls.delete(peerId);
      }
      this.updatePlayerListUI();
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

    // --- High-Quality WebRTC Voice Chat ---
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
          } catch(e) {
            console.warn("[Voice VAD]", e);
          }

          // Call all connected peers
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

    callPeer(peerId) {
      if (!this.localStream || !this.peer) return;

      const existingCall = this.activeCalls.get(peerId);
      if (existingCall) {
        try { existingCall.close(); } catch(e) {}
      }

      console.log("[Cold World Voice] Calling player:", peerId);
      const call = this.peer.call(peerId, this.localStream);
      if (call) {
        this.activeCalls.set(peerId, call);
        this.setupCall(call);
      }
    }

    setupCall(call) {
      call.on("stream", (remoteStream) => {
        console.log("[Cold World Voice] Received voice stream from:", call.peer);

        let audioEl = this.audioElements.get(call.peer);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          document.body.appendChild(audioEl);
          this.audioElements.set(call.peer, audioEl);
        }

        audioEl.srcObject = remoteStream;
        audioEl.play().catch(e => {
          console.warn("[Voice Autoplay]", e);
        });

        const p = this.peers.get(call.peer);
        if (p) {
          p.audioElement = audioEl;
        }

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

      // 1. Broadcast local player position & orientation at ~25Hz
      if (now - this.lastBroadcast > this.broadcastInterval && this.peers.size > 0) {
        this.lastBroadcast = now;
        this.broadcastLocalState();
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
        if (p.hasReceivedFirstState) {
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
        const audioEl = p.audioElement || this.audioElements.get(p.conn?.peer);
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
      statusBadge.title = "Direct Live Multiplayer World";
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
      statusBadge.innerHTML = `<span id="cw-status-text">🟡 Joining Live World...</span>`;

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
        this.broadcastLocalState();
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
    document.addEventListener("DOMContentLoaded", () => new MultiplayerEngine());
  } else {
    new MultiplayerEngine();
  }
})();
