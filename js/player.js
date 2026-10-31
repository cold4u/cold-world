// Player Character for Messenger Planet
// Handles spherical gravity movement, jumping, running animations, customizable appearance,
// and holding the active delivery parcel in hands!

class Player {
  constructor(planet) {
    this.planet = planet;
    this.group = new THREE.Group();

    // Movement state
    this.speed = 10;
    this.sprintMultiplier = 1.6;
    this.jumpForce = 14;
    this.gravity = 35;
    this.velocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.heading = 0; // Local tangent yaw angle

    // Appearance options
    this.outfitColor = 0x2a6fdb; // Default blue courier uniform
    this.hatStyle = 'cap';
    this.bagStyle = 'satchel';

    // Model components
    this.bodyGroup = new THREE.Group();
    this.head = null;
    this.hat = null;
    this.satchel = null;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.packageMesh = null;

    // Animation timers
    this.walkCycle = 0;
    this.isMoving = false;
    this.footstepTimer = 0;

    // Start position: At Town Square (North Pole)
    this.position = new THREE.Vector3(0, 1, 0).normalize();
    this.initModel();
    this.group.add(this.bodyGroup);

    // Initial placement on planet surface
    this.updateSurfacePosition();
  }

  initModel() {
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdbac, flatShading: true });
    this.uniformMat = new THREE.MeshLambertMaterial({ color: this.outfitColor, flatShading: true });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true });
    const bagMat = new THREE.MeshLambertMaterial({ color: 0x854d0e, flatShading: true });

    // Torso / Jacket
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), this.uniformMat);
    torso.position.y = 1.0;
    this.bodyGroup.add(torso);

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), skinMat);
    this.head.position.y = 1.8;

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye1.position.set(-0.16, 0.05, 0.33);
    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye2.position.set(0.16, 0.05, 0.33);
    this.head.add(eye1, eye2);
    this.bodyGroup.add(this.head);

    // Courier Cap
    this.buildHat();

    // Satchel / Courier Bag
    this.buildBag(bagMat);

    // Limbs
    const armGeom = new THREE.BoxGeometry(0.24, 0.75, 0.24);
    this.leftArm = new THREE.Mesh(armGeom, this.uniformMat);
    this.leftArm.position.set(-0.55, 1.0, 0);
    this.leftArm.geometry.translate(0, -0.3, 0); // pivot at shoulder

    this.rightArm = new THREE.Mesh(armGeom, this.uniformMat);
    this.rightArm.position.set(0.55, 1.0, 0);
    this.rightArm.geometry.translate(0, -0.3, 0);

    const legGeom = new THREE.BoxGeometry(0.28, 0.75, 0.28);
    this.leftLeg = new THREE.Mesh(legGeom, darkMat);
    this.leftLeg.position.set(-0.25, 0.45, 0);
    this.leftLeg.geometry.translate(0, -0.3, 0);

    this.rightLeg = new THREE.Mesh(legGeom, darkMat);
    this.rightLeg.position.set(0.25, 0.45, 0);
    this.rightLeg.geometry.translate(0, -0.3, 0);

    this.bodyGroup.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);

    // Carried Delivery Parcel (hidden until delivery active)
    const parcelGeom = new THREE.BoxGeometry(0.6, 0.45, 0.45);
    const parcelMat = new THREE.MeshLambertMaterial({ color: 0xd97706, flatShading: true });
    this.packageMesh = new THREE.Mesh(parcelGeom, parcelMat);
    this.packageMesh.position.set(0, 1.0, 0.55);
    this.packageMesh.visible = false;
    this.bodyGroup.add(this.packageMesh);
  }

  buildHat() {
    if (this.hat) this.head.remove(this.hat);
    this.hat = new THREE.Group();

    if (this.hatStyle === 'cap') {
      const capBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.25, 8),
        this.uniformMat
      );
      capBase.position.y = 0.38;

      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true })
      );
      visor.position.set(0, 0.3, 0.32);
      this.hat.add(capBase, visor);
    } else if (this.hatStyle === 'beanie') {
      const beanie = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xf59e0b, flatShading: true })
      );
      beanie.position.y = 0.35;
      this.hat.add(beanie);
    } else if (this.hatStyle === 'flower') {
      const flower = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18),
        new THREE.MeshLambertMaterial({ color: 0xf43f5e, flatShading: true })
      );
      flower.position.set(0.25, 0.38, 0);
      this.hat.add(flower);
    }
    this.head.add(this.hat);
  }

  buildBag(bagMat) {
    if (this.satchel) this.bodyGroup.remove(this.satchel);
    this.satchel = new THREE.Group();

    if (this.bagStyle === 'satchel') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), bagMat);
      bag.position.set(0.45, 0.85, 0.15);
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4),
        new THREE.MeshLambertMaterial({ color: 0x451a03 })
      );
      strap.position.set(0, 1.1, 0);
      strap.rotation.z = -0.7;
      this.satchel.add(bag, strap);
    } else if (this.bagStyle === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.35), bagMat);
      pack.position.set(0, 1.0, -0.38);
      this.satchel.add(pack);
    }
    this.bodyGroup.add(this.satchel);
  }

  setCarryingPackage(isCarrying, color = 0xd97706) {
    if (this.packageMesh) {
      this.packageMesh.visible = isCarrying;
      this.packageMesh.material.color.set(color);
    }
  }

  setCustomization(outfitColor, hatStyle, bagStyle) {
    if (outfitColor) {
      this.outfitColor = outfitColor;
      this.uniformMat.color.set(outfitColor);
    }
    if (hatStyle !== undefined) {
      this.hatStyle = hatStyle;
      this.buildHat();
    }
    if (bagStyle !== undefined) {
      this.bagStyle = bagStyle;
      this.buildBag(new THREE.MeshLambertMaterial({ color: 0x854d0e, flatShading: true }));
    }
  }

  // Update position on spherical surface
  updateSurfacePosition() {
    const up = this.position.clone().normalize();
    const radius = this.planet.getRadiusAt(up);
    const surfacePos = up.clone().multiplyScalar(radius + this.verticalVelocity);
    this.group.position.copy(surfacePos);

    // Align player's UP axis with spherical surface normal
    const currentUp = new THREE.Vector3(0, 1, 0);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(currentUp, up);

    // Apply character heading rotation around the local UP axis
    const headingQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    this.group.quaternion.copy(alignQuat).multiply(headingQuat);
  }

  // Movement physics step
  update(delta, inputVector, isJumping, isSprinting, camera) {
    const up = this.position.clone().normalize();
    this.isMoving = inputVector.lengthSq() > 0.01;

    // Tangent movement vectors relative to camera view
    if (this.isMoving) {
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);

      // Project camForward onto the plane tangent to sphere at player position
      const tangentForward = camForward.clone().sub(up.clone().multiplyScalar(camForward.dot(up))).normalize();
      const tangentRight = new THREE.Vector3().crossVectors(tangentForward, up).normalize().negate();

      const moveDir = tangentForward.clone().multiplyScalar(-inputVector.y)
        .add(tangentRight.clone().multiplyScalar(inputVector.x)).normalize();

      const moveSpeed = (isSprinting ? this.speed * this.sprintMultiplier : this.speed) * delta;
      
      // Move tangentially around sphere
      const angularMove = moveSpeed / this.planet.baseRadius;
      const rotationAxis = new THREE.Vector3().crossVectors(up, moveDir).normalize();
      this.position.applyAxisAngle(rotationAxis, angularMove).normalize();

      // Turn character smoothly toward movement direction
      const localForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
      const angle = Math.atan2(moveDir.dot(tangentRight), moveDir.dot(tangentForward));
      this.heading = angle;

      // Footstep sound
      this.footstepTimer += delta * (isSprinting ? 14 : 9);
      if (this.footstepTimer > Math.PI && this.isGrounded) {
        this.footstepTimer = 0;
        window.audioManager?.playFootstep();
      }
    }

    // Vertical Jumping Physics
    if (isJumping && this.isGrounded) {
      this.verticalVelocity = this.jumpForce * delta;
      this.isGrounded = false;
      window.audioManager?.playJump();
    }

    if (!this.isGrounded) {
      this.verticalVelocity -= this.gravity * delta * delta;
      if (this.verticalVelocity <= 0) {
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    }

    // Update 3D transformation
    this.updateSurfacePosition();

    // Limb swinging animation
    if (this.isMoving) {
      this.walkCycle += delta * (isSprinting ? 14 : 9);
      const swing = Math.sin(this.walkCycle) * 0.45;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      
      if (!this.packageMesh.visible) {
        this.leftArm.rotation.x = -swing;
        this.rightArm.rotation.x = swing;
      } else {
        // Holding parcel with both hands
        this.leftArm.rotation.x = -0.7;
        this.rightArm.rotation.x = -0.7;
      }
      this.bodyGroup.position.y = Math.abs(Math.sin(this.walkCycle * 2)) * 0.1;
    } else {
      // Idle pose
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      if (!this.packageMesh.visible) {
        this.leftArm.rotation.x = 0;
        this.rightArm.rotation.x = 0;
      }
      this.bodyGroup.position.y = 0;
    }
  }

  getWorldPosition() {
    return this.group.position.clone();
  }
}

window.Player = Player;
