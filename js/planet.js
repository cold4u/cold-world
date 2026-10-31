// Planet Generator for Messenger Planet
// Generates a 3D spherical low-poly planet with biomes:
// Main Town, Mountain Temple, Red Cliffs, Forest & Cave, Waterfalls, Beach, Capital Corp

class Planet {
  constructor(scene) {
    this.scene = scene;
    this.baseRadius = 35;
    this.group = new THREE.Group();
    this.clouds = [];
    this.waterMesh = null;
    this.planetMesh = null;

    // Biome center coordinates (unit vectors on sphere)
    this.biomes = {
      town: new THREE.Vector3(0, 1, 0).normalize(),                     // North Pole: Main Square
      mountain: new THREE.Vector3(0.7, 0.4, 0.5).normalize(),           // Mountain Temple
      redCliffs: new THREE.Vector3(-0.7, 0.5, 0.3).normalize(),         // Red Cliff House
      forest: new THREE.Vector3(0.2, 0.3, -0.9).normalize(),            // Forest & Cave
      waterfalls: new THREE.Vector3(-0.6, 0.1, -0.7).normalize(),       // Smelly Falls
      capitalCorp: new THREE.Vector3(0.8, -0.3, -0.4).normalize(),      // Capital Corp Tech Labs
      beach: new THREE.Vector3(-0.3, -0.4, 0.8).normalize()             // Tropical Beach Cove
    };

    this.init();
  }

  // Returns terrain height displacement for any normalized direction
  getElevation(dir) {
    let elevation = 0;

    // Mountain biome: high steep peak
    const distMountain = dir.distanceTo(this.biomes.mountain);
    if (distMountain < 0.8) {
      const factor = 1 - distMountain / 0.8;
      elevation += Math.pow(factor, 2) * 9.5;
    }

    // Red Cliffs: rugged elevated terraces
    const distCliffs = dir.distanceTo(this.biomes.redCliffs);
    if (distCliffs < 0.7) {
      const factor = 1 - distCliffs / 0.7;
      elevation += Math.pow(factor, 1.5) * 5.2;
    }

    // Town: gentle leveled plateau
    const distTown = dir.distanceTo(this.biomes.town);
    if (distTown < 0.6) {
      const factor = 1 - distTown / 0.6;
      elevation += factor * 1.5;
    }

    // Forest: undulating rolling hills
    const distForest = dir.distanceTo(this.biomes.forest);
    if (distForest < 0.75) {
      elevation += Math.sin(dir.x * 12) * Math.cos(dir.z * 12) * 1.2;
    }

    // Waterfalls / River canyon (carved indentation)
    const distWaterfalls = dir.distanceTo(this.biomes.waterfalls);
    if (distWaterfalls < 0.55) {
      const factor = 1 - distWaterfalls / 0.55;
      elevation -= factor * 2.8;
    }

    // Beach: gentle slope down into ocean
    const distBeach = dir.distanceTo(this.biomes.beach);
    if (distBeach < 0.6) {
      const factor = 1 - distBeach / 0.6;
      elevation -= factor * 2.2;
    }

    // Subtle global low-poly noise
    elevation += (Math.sin(dir.x * 7) + Math.cos(dir.y * 7) + Math.sin(dir.z * 7)) * 0.4;

    return elevation;
  }

  getRadiusAt(dir) {
    return this.baseRadius + this.getElevation(dir.clone().normalize());
  }

  getSurfacePoint(dir, offset = 0) {
    const norm = dir.clone().normalize();
    const r = this.getRadiusAt(norm) + offset;
    return norm.multiplyScalar(r);
  }

  init() {
    this.createTerrainMesh();
    this.createWaterMesh();
    this.populateBiomes();
    this.createClouds();
    this.scene.add(this.group);
  }

  createTerrainMesh() {
    // Generate an icosahedron or sphere geometry with subdivided faces
    const detail = 38;
    const geom = new THREE.SphereGeometry(this.baseRadius, detail * 2, detail);
    const pos = geom.attributes.position;
    const colors = [];

    const colGrass = new THREE.Color('#55a045');
    const colForest = new THREE.Color('#387730');
    const colMountainRock = new THREE.Color('#78716c');
    const colSnow = new THREE.Color('#f8fafc');
    const colRedCliff = new THREE.Color('#c25959');
    const colSand = new THREE.Color('#fde047');
    const colTownPlaza = new THREE.Color('#a8a29e');
    const colTech = new THREE.Color('#94a3b8');

    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const dir = v.clone().normalize();
      const elev = this.getElevation(dir);
      const newRadius = this.baseRadius + elev;
      v.copy(dir.clone().multiplyScalar(newRadius));
      pos.setXYZ(i, v.x, v.y, v.z);

      // Determine vertex color based on biome and elevation
      let c = colGrass.clone();

      // Mountain snow & rock
      const dMountain = dir.distanceTo(this.biomes.mountain);
      if (dMountain < 0.75) {
        if (elev > 6.0) {
          c = colSnow.clone();
        } else {
          c = colMountainRock.clone().lerp(colSnow, (elev - 3) / 4);
        }
      } else if (dir.distanceTo(this.biomes.redCliffs) < 0.6) {
        c = colRedCliff.clone().lerp(colMountainRock, 0.2);
      } else if (dir.distanceTo(this.biomes.beach) < 0.5) {
        c = colSand.clone();
      } else if (dir.distanceTo(this.biomes.forest) < 0.6) {
        c = colForest.clone();
      } else if (dir.distanceTo(this.biomes.town) < 0.35) {
        c = colTownPlaza.clone();
      } else if (dir.distanceTo(this.biomes.capitalCorp) < 0.4) {
        c = colTech.clone();
      } else if (elev < -1.0) {
        c = colSand.clone();
      }

      colors.push(c.r, c.g, c.b);
    }

    geom.computeVertexNormals();
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true
    });

    this.planetMesh = new THREE.Mesh(geom, mat);
    this.planetMesh.receiveShadow = true;
    this.group.add(this.planetMesh);
  }

  createWaterMesh() {
    // Water sphere slightly below average sea level
    const waterGeom = new THREE.SphereGeometry(this.baseRadius - 0.4, 48, 36);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
      flatShading: true
    });
    this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
    this.group.add(this.waterMesh);
  }

  // Place object on planet surface with correct surface normal orientation
  placeOnSurface(obj, dir, heightOffset = 0) {
    const pos = this.getSurfacePoint(dir, heightOffset);
    obj.position.copy(pos);

    const up = dir.clone().normalize();
    const currentUp = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(currentUp, up);
    obj.quaternion.copy(q);

    this.group.add(obj);
    return obj;
  }

  // Populate biomes with low-poly stylized props
  populateBiomes() {
    this.buildTownSquare();
    this.buildMountainTemple();
    this.buildRedCliffs();
    this.buildForestAndCave();
    this.buildWaterfalls();
    this.buildBeach();
    this.buildCapitalCorp();
    this.scatterWildernessProps();
  }

  buildTownSquare() {
    const center = this.biomes.town;

    // Town Plaza Fountain / Bell monument
    const fountain = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.3, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8, flatShading: true })
    );
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 2.5, 6),
      new THREE.MeshLambertMaterial({ color: 0xcbd5e1, flatShading: true })
    );
    pillar.position.y = 1.3;
    const orb = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.7),
      new THREE.MeshLambertMaterial({ color: 0x38bdf8, flatShading: true })
    );
    orb.position.y = 2.8;
    fountain.add(base, pillar, orb);
    this.placeOnSurface(fountain, center);

    // Cozy Town Houses around the square
    const houseColors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(angle) * 0.18, 0, Math.sin(angle) * 0.18);
      const houseDir = center.clone().add(offset).normalize();

      const house = this.createLowPolyHouse(houseColors[i % houseColors.length]);
      this.placeOnSurface(house, houseDir);
    }

    // Flower cart for Flower Lady
    const flowerCart = new THREE.Group();
    const cartBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.8, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x78350f, flatShading: true })
    );
    const cartAwning = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.2, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xf43f5e, flatShading: true })
    );
    cartAwning.position.y = 1.2;
    flowerCart.add(cartBase, cartAwning);
    const cartDir = center.clone().add(new THREE.Vector3(0.08, 0, 0.08)).normalize();
    this.placeOnSurface(flowerCart, cartDir);
  }

  createLowPolyHouse(roofColor) {
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf1f5f9, flatShading: true })
    );
    walls.position.y = 1.1;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.6, 4),
      new THREE.MeshLambertMaterial({ color: roofColor, flatShading: true })
    );
    roof.position.y = 2.8;
    roof.rotation.y = Math.PI / 4;

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.1, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x475569, flatShading: true })
    );
    door.position.set(0, 0.6, 1.22);

    house.add(walls, roof, door);
    return house;
  }

  buildMountainTemple() {
    const center = this.biomes.mountain;

    // Torii Gate at the ascent
    const torii = new THREE.Group();
    const colMat = new THREE.MeshLambertMaterial({ color: 0xd97706, flatShading: true });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3, 6), colMat);
    p1.position.x = -1.2;
    p1.position.y = 1.5;
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3, 6), colMat);
    p2.position.x = 1.2;
    p2.position.y = 1.5;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.35), colMat);
    beam.position.y = 3;
    torii.add(p1, p2, beam);

    const toriiDir = center.clone().add(new THREE.Vector3(-0.15, -0.1, 0)).normalize();
    this.placeOnSurface(torii, toriiDir);

    // Mountain Shrine at the peak
    const shrine = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.2, 3),
      new THREE.MeshLambertMaterial({ color: 0x44403c, flatShading: true })
    );
    base.position.y = 0.6;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3, 1.4, 4),
      new THREE.MeshLambertMaterial({ color: 0xb91c1c, flatShading: true })
    );
    roof.position.y = 1.9;
    roof.rotation.y = Math.PI / 4;
    shrine.add(base, roof);
    this.placeOnSurface(shrine, center);

    // Cherry blossom trees around temple
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const off = new THREE.Vector3(Math.cos(angle) * 0.12, Math.sin(angle) * 0.08, 0.08);
      const treeDir = center.clone().add(off).normalize();
      const sakura = this.createTree(0xf472b6, 0x78350f);
      this.placeOnSurface(sakura, treeDir);
    }
  }

  buildRedCliffs() {
    const center = this.biomes.redCliffs;

    // Modern Executive Cliff House for The Boss
    const villa = new THREE.Group();
    const body1 = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 2.0, 3.0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    );
    body1.position.y = 1.0;

    const body2 = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.6, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true })
    );
    body2.position.set(0.6, 2.4, 0.4);

    // Sun deck & flagpole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xd4d4d8 })
    );
    pole.position.set(-1.4, 2.5, 1.2);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.4, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xef4444 })
    );
    flag.position.set(-1.0, 3.6, 1.2);

    villa.add(body1, body2, pole, flag);
    this.placeOnSurface(villa, center);
  }

  buildForestAndCave() {
    const center = this.biomes.forest;

    // Stone Cave entrance for Caveman
    const cave = new THREE.Group();
    const caveRock1 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.8),
      new THREE.MeshLambertMaterial({ color: 0x3f3f46, flatShading: true })
    );
    caveRock1.position.set(-1.2, 0.8, 0);

    const caveRock2 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.8),
      new THREE.MeshLambertMaterial({ color: 0x27272a, flatShading: true })
    );
    caveRock2.position.set(1.2, 0.8, 0);

    const caveRoof = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.0),
      new THREE.MeshLambertMaterial({ color: 0x18181b, flatShading: true })
    );
    caveRoof.position.set(0, 2.2, 0);

    // Cozy Campfire inside cave
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.8, 5),
      new THREE.MeshLambertMaterial({ color: 0xf97316, emissive: 0xea580c, flatShading: true })
    );
    fire.position.set(0, 0.3, -0.6);

    cave.add(caveRock1, caveRock2, caveRoof, fire);
    this.placeOnSurface(cave, center);

    // Dense pine trees in forest
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const off = new THREE.Vector3(Math.cos(angle) * 0.18, 0, Math.sin(angle) * 0.18);
      const treeDir = center.clone().add(off).normalize();
      const pine = this.createPineTree();
      this.placeOnSurface(pine, treeDir);
    }
  }

  buildWaterfalls() {
    const center = this.biomes.waterfalls;

    // Cascading water stream
    const falls = new THREE.Group();
    const stream = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 4.5, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        flatShading: true
      })
    );
    stream.position.y = 1.8;

    // Wooden dock where Dave plays guitar
    const dock = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.25, 2.8),
      new THREE.MeshLambertMaterial({ color: 0x78350f, flatShading: true })
    );
    dock.position.set(0.8, 0.2, 1.8);

    falls.add(stream, dock);
    this.placeOnSurface(falls, center);
  }

  buildBeach() {
    const center = this.biomes.beach;

    // Wooden pier & diving bell
    const pier = new THREE.Group();
    const planks = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.2, 3.6),
      new THREE.MeshLambertMaterial({ color: 0x92400e, flatShading: true })
    );
    planks.position.y = 0.2;

    // Palm tree
    const palm = this.createPalmTree();
    palm.position.set(-1.8, 0, 0);

    pier.add(planks, palm);
    this.placeOnSurface(pier, center);
  }

  buildCapitalCorp() {
    const center = this.biomes.capitalCorp;

    // High tech futuristic laboratory towers
    const techLab = new THREE.Group();
    const tower1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 4.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0, flatShading: true })
    );
    tower1.position.y = 2.2;

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x38bdf8, flatShading: true })
    );
    dome.position.y = 4.5;

    // Radar dish
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.1, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true })
    );
    dish.position.set(1.5, 2.5, 0);
    dish.rotation.z = Math.PI / 4;

    techLab.add(tower1, dome, dish);
    this.placeOnSurface(techLab, center);
  }

  createTree(foliageColor = 0x22c55e, trunkColor = 0x78350f) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6),
      new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true })
    );
    trunk.position.y = 0.9;

    const foliage = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2),
      new THREE.MeshLambertMaterial({ color: foliageColor, flatShading: true })
    );
    foliage.position.y = 2.2;
    tree.add(trunk, foliage);
    return tree;
  }

  createPineTree() {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x451a03, flatShading: true })
    );
    trunk.position.y = 0.7;

    const cone1 = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 1.6, 5),
      new THREE.MeshLambertMaterial({ color: 0x166534, flatShading: true })
    );
    cone1.position.y = 1.8;

    const cone2 = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x15803d, flatShading: true })
    );
    cone2.position.y = 2.6;

    tree.add(trunk, cone1, cone2);
    return tree;
  }

  createPalmTree() {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.35, 3.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x78350f, flatShading: true })
    );
    trunk.position.y = 1.6;
    trunk.rotation.z = 0.15;

    const frondMat = new THREE.MeshLambertMaterial({ color: 0x4ade80, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), frondMat);
      frond.position.set(0, 3.1, 0);
      frond.rotation.y = (i / 5) * Math.PI * 2;
      frond.rotation.z = 0.4;
      palm.add(frond);
    }
    palm.add(trunk);
    return palm;
  }

  scatterWildernessProps() {
    // Scatter rocks and wild trees across open areas
    for (let i = 0; i < 35; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();

      if (i % 2 === 0) {
        // Rock
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.6),
          new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true })
        );
        this.placeOnSurface(rock, dir, 0.3);
      } else {
        // Wild Tree
        const tree = this.createTree(0x16a34a);
        this.placeOnSurface(tree, dir);
      }
    }
  }

  createClouds() {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      flatShading: true
    });

    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numPuffs; j++) {
        const puff = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.2 + Math.random() * 0.8),
          cloudMat
        );
        puff.position.set((j - numPuffs / 2) * 1.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8);
        cloud.add(puff);
      }

      // Position in orbit (altitude ~ baseRadius + 14)
      const alt = this.baseRadius + 12 + Math.random() * 4;
      const angle = (i / 10) * Math.PI * 2;
      const y = (Math.random() - 0.5) * 20;
      cloud.position.set(Math.cos(angle) * alt, y, Math.sin(angle) * alt);
      cloud.userData = {
        orbitSpeed: 0.001 + Math.random() * 0.002,
        axis: new THREE.Vector3(0, 1, 0)
      };

      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  update(delta) {
    // Slowly orbit clouds around planet
    for (const cloud of this.clouds) {
      cloud.position.applyAxisAngle(cloud.userData.axis, cloud.userData.orbitSpeed);
    }
  }
}

window.Planet = Planet;
