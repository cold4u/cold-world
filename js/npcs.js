// NPCs Manager for Messenger Planet
// Spawns and manages citizens across the sphere:
// Office Worker, The Boss, Caveman, Flower Lady, Dr. Frieb, Dr. Frebi,
// Old Woman, Mountain Man, Diver, Dave the Musician

class NPCManager {
  constructor(planet) {
    this.planet = planet;
    this.npcs = [];
    this.group = new THREE.Group();
    this.initNPCs();
  }

  initNPCs() {
    const list = [
      {
        id: 'office-worker-2',
        name: 'Office Worker',
        role: 'Capital Corp Clerk',
        avatar: '👔',
        biomeDir: this.planet.biomes.town.clone().add(new THREE.Vector3(-0.06, 0, 0.08)).normalize(),
        color: 0x475569,
        hairColor: 0x1e293b,
        accessory: 'tie',
        pitch: 1.2
      },
      {
        id: 'flower-lady',
        name: 'Flower Lady',
        role: 'Town Florist',
        avatar: '🌸',
        biomeDir: this.planet.biomes.town.clone().add(new THREE.Vector3(0.12, 0, 0.05)).normalize(),
        color: 0xf472b6,
        hairColor: 0xd97706,
        accessory: 'apron',
        pitch: 1.4
      },
      {
        id: 'boss',
        name: 'The Boss',
        role: 'Capital Corp CEO',
        avatar: '💼',
        biomeDir: this.planet.biomes.redCliffs.clone().add(new THREE.Vector3(0.06, 0, -0.05)).normalize(),
        color: 0x1e1b4b,
        hairColor: 0x64748b,
        accessory: 'suit',
        pitch: 0.8
      },
      {
        id: 'caveman',
        name: 'Caveman',
        role: 'Midlife Crisis Hermit',
        avatar: '🍖',
        biomeDir: this.planet.biomes.forest.clone().add(new THREE.Vector3(0.04, 0, 0.05)).normalize(),
        color: 0xd97706,
        hairColor: 0x451a03,
        accessory: 'boxers',
        pitch: 0.7
      },
      {
        id: 'male-scientist',
        name: 'Dr. Frieb',
        role: 'Astrophysicist',
        avatar: '🔬',
        biomeDir: this.planet.biomes.mountain.clone().add(new THREE.Vector3(-0.12, -0.15, 0)).normalize(),
        color: 0x0284c7,
        hairColor: 0x94a3b8,
        accessory: 'goggles',
        pitch: 1.1
      },
      {
        id: 'female-scientist',
        name: 'Dr. Frebi',
        role: 'Lead Researcher',
        avatar: '🧪',
        biomeDir: this.planet.biomes.capitalCorp.clone().add(new THREE.Vector3(0.06, 0, 0.05)).normalize(),
        color: 0x9333ea,
        hairColor: 0x7c2d12,
        accessory: 'labcoat',
        pitch: 1.3
      },
      {
        id: 'oldwoman',
        name: 'Old Woman',
        role: 'Temple Devotee',
        avatar: '👵',
        biomeDir: this.planet.biomes.mountain.clone().add(new THREE.Vector3(-0.06, -0.08, 0.08)).normalize(),
        color: 0x65a30d,
        hairColor: 0xf1f5f9,
        accessory: 'basket',
        pitch: 1.5
      },
      {
        id: 'mountainman',
        name: 'Mountain Man',
        role: 'Shrine Caretaker',
        avatar: '🍵',
        biomeDir: this.planet.biomes.mountain.clone().add(new THREE.Vector3(0.08, 0.05, 0)).normalize(),
        color: 0xb45309,
        hairColor: 0x27272a,
        accessory: 'monk',
        pitch: 0.75
      },
      {
        id: 'diver',
        name: 'The Diver',
        role: 'Oyster Hunter',
        avatar: '🤿',
        biomeDir: this.planet.biomes.beach.clone().add(new THREE.Vector3(0.06, 0, 0.08)).normalize(),
        color: 0x06b6d4,
        hairColor: 0x1e293b,
        accessory: 'snorkel',
        pitch: 1.05
      },
      {
        id: 'musician',
        name: 'Dave the Musician',
        role: 'Waterfall Bard',
        avatar: '🎸',
        biomeDir: this.planet.biomes.waterfalls.clone().add(new THREE.Vector3(0.08, 0, 0.08)).normalize(),
        color: 0xec4899,
        hairColor: 0xf59e0b,
        accessory: 'guitar',
        pitch: 0.95
      }
    ];

    list.forEach(cfg => this.createNPC(cfg));
    this.planet.group.add(this.group);
  }

  createNPC(cfg) {
    const npcGroup = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdbac, flatShading: true });
    const outfitMat = new THREE.MeshLambertMaterial({ color: cfg.color, flatShading: true });
    const hairMat = new THREE.MeshLambertMaterial({ color: cfg.hairColor, flatShading: true });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), outfitMat);
    torso.position.y = 1.0;
    npcGroup.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), skinMat);
    head.position.y = 1.8;

    // Hair
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), hairMat);
    hair.position.y = 0.35;
    head.add(hair);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye1.position.set(-0.16, 0.05, 0.33);
    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye2.position.set(0.16, 0.05, 0.33);
    head.add(eye1, eye2);
    npcGroup.add(head);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.28, 0.7, 0.28);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x334155, flatShading: true });
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-0.24, 0.35, 0);
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(0.24, 0.35, 0);
    npcGroup.add(leg1, leg2);

    // Unique Accessory
    if (cfg.accessory === 'guitar') {
      const guitarBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8),
        new THREE.MeshLambertMaterial({ color: 0xd97706, flatShading: true })
      );
      guitarBody.position.set(0.45, 1.0, 0.35);
      guitarBody.rotation.z = 0.4;
      npcGroup.add(guitarBody);
    } else if (cfg.accessory === 'snorkel') {
      const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.15),
        new THREE.MeshLambertMaterial({ color: 0x06b6d4 })
      );
      mask.position.set(0, 1.85, 0.35);
      npcGroup.add(mask);
    } else if (cfg.accessory === 'basket') {
      const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.2, 0.3, 6),
        new THREE.MeshLambertMaterial({ color: 0x78350f, flatShading: true })
      );
      basket.position.set(0.45, 0.8, 0.2);
      npcGroup.add(basket);
    }

    // Floating Speech Bubble Icon
    const promptBubble = this.createFloatingIndicator();
    promptBubble.position.y = 2.6;
    npcGroup.add(promptBubble);

    // Place on spherical surface
    this.planet.placeOnSurface(npcGroup, cfg.biomeDir);

    const npcData = {
      id: cfg.id,
      name: cfg.name,
      role: cfg.role,
      avatar: cfg.avatar,
      group: npcGroup,
      promptBubble: promptBubble,
      pitch: cfg.pitch,
      direction: cfg.biomeDir,
      hasActiveQuest: false
    };

    this.npcs.push(npcData);
  }

  createFloatingIndicator() {
    const group = new THREE.Group();
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x38bdf8, emissiveIntensity: 0.3 })
    );
    const dot = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.2, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    dot.position.y = -0.25;
    dot.rotation.x = Math.PI;

    group.add(balloon, dot);
    return group;
  }

  getClosestNPC(playerPos, maxDistance = 3.8) {
    let closest = null;
    let minDst = maxDistance;

    for (const npc of this.npcs) {
      const dst = npc.group.position.distanceTo(playerPos);
      if (dst < minDst) {
        minDst = dst;
        closest = npc;
      }
    }
    return closest;
  }

  getNPCById(id) {
    return this.npcs.find(n => n.id === id);
  }

  update(delta, time) {
    // Gentle bobbing animation for all NPCs
    for (const npc of this.npcs) {
      const bob = Math.sin(time * 2.5 + npc.pitch * 5) * 0.05;
      npc.group.children[0].position.y = 1.0 + bob; // torso
      npc.group.children[1].position.y = 1.8 + bob; // head
      
      // Floating indicator bounce & spin
      if (npc.promptBubble) {
        npc.promptBubble.position.y = 2.7 + Math.sin(time * 3 + npc.pitch * 3) * 0.12;
        npc.promptBubble.rotation.y = time * 1.5;
      }
    }
  }
}

window.NPCManager = NPCManager;
