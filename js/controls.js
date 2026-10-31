// Controls Manager for Messenger Planet
// Handles Keyboard, Mouse Orbit Dragging, Wheel Zoom, and Mobile Virtual Joystick

class ControlsManager {
  constructor(canvas) {
    this.canvas = canvas;

    // Movement state
    this.moveVector = new THREE.Vector2();
    this.isJumping = false;
    this.isSprinting = false;
    this.interactPressed = false;

    // Orbit Camera angles (relative to player UP)
    this.camAzimuth = 0;       // horizontal orbit angle around player UP
    this.camElevation = 0.45;  // vertical orbit angle (radians from tangent plane)
    this.camDistance = 18.0;   // distance from player
    this.minDistance = 7.0;
    this.maxDistance = 45.0;

    // Mouse drag state
    this.isMouseDown = false;
    this.lastMousePos = { x: 0, y: 0 };

    // Mobile joystick state
    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickBasePos = { x: 0, y: 0 };
    this.joystickRadius = 45;

    this.initKeyboard();
    this.initMouse();
    this.initTouch();
    this.initModals();
  }

  initKeyboard() {
    this.keys = {};

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'KeyE') {
        this.interactPressed = true;
      }
      if (e.code === 'KeyQ') {
        this.toggleModal('modal-quests');
      }
      if (e.code === 'KeyC') {
        this.toggleModal('modal-customize');
      }
      if (e.code === 'KeyH') {
        this.toggleModal('modal-help');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE') {
        this.interactPressed = false;
      }
    });
  }

  initMouse() {
    window.addEventListener('mousedown', (e) => {
      // Ignore click if clicking on UI buttons or modals
      if (e.target.closest('button') || e.target.closest('.modal-card') || e.target.closest('.dialogue-card') || e.target.closest('.intro-screen')) {
        return;
      }
      this.isMouseDown = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.lastMousePos.x;
      const deltaY = e.clientY - this.lastMousePos.y;
      this.lastMousePos = { x: e.clientX, y: e.clientY };

      const rotSpeed = 0.006;
      this.camAzimuth -= deltaX * rotSpeed;
      this.camElevation = Math.max(0.1, Math.min(Math.PI / 2.2, this.camElevation + deltaY * rotSpeed));
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    // Zoom with scroll wheel
    window.addEventListener('wheel', (e) => {
      this.camDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.camDistance + e.deltaY * 0.02));
    }, { passive: true });
  }

  initTouch() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');
    const mobileActionBtn = document.getElementById('mobile-btn-action');
    const mobileJumpBtn = document.getElementById('mobile-btn-jump');

    if (joystickZone && joystickKnob) {
      joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        this.joystickTouchId = touch.identifier;
        this.joystickActive = true;

        const rect = joystickZone.getBoundingClientRect();
        this.joystickBasePos = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        this.updateJoystick(touch.clientX, touch.clientY, joystickKnob);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (!this.joystickActive) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.joystickTouchId) {
            this.updateJoystick(touch.clientX, touch.clientY, joystickKnob);
            break;
          }
        }
      }, { passive: false });

      const endJoystick = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.joystickTouchId) {
            this.joystickActive = false;
            this.joystickTouchId = null;
            this.moveVector.set(0, 0);
            joystickKnob.style.transform = `translate(0px, 0px)`;
            break;
          }
        }
      };

      window.addEventListener('touchend', endJoystick);
      window.addEventListener('touchcancel', endJoystick);
    }

    // Camera touch rotate (one finger drag outside joystick)
    let touchCamId = null;
    let lastTouchPos = { x: 0, y: 0 };

    window.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier !== this.joystickTouchId && !e.target.closest('button') && !e.target.closest('.modal-card')) {
          touchCamId = touch.identifier;
          lastTouchPos = { x: touch.clientX, y: touch.clientY };
          break;
        }
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (touchCamId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchCamId) {
          const dx = touch.clientX - lastTouchPos.x;
          const dy = touch.clientY - lastTouchPos.y;
          lastTouchPos = { x: touch.clientX, y: touch.clientY };

          this.camAzimuth -= dx * 0.008;
          this.camElevation = Math.max(0.1, Math.min(Math.PI / 2.2, this.camElevation + dy * 0.008));
          break;
        }
      }
    });

    const endCamTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchCamId) {
          touchCamId = null;
          break;
        }
      }
    };
    window.addEventListener('touchend', endCamTouch);
    window.addEventListener('touchcancel', endCamTouch);

    // Mobile action and jump buttons
    if (mobileActionBtn) {
      mobileActionBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.interactPressed = true;
      });
      mobileActionBtn.addEventListener('touchend', () => {
        this.interactPressed = false;
      });
    }

    if (mobileJumpBtn) {
      mobileJumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isJumping = true;
      });
      mobileJumpBtn.addEventListener('touchend', () => {
        this.isJumping = false;
      });
    }
  }

  updateJoystick(clientX, clientY, knobElement) {
    const dx = clientX - this.joystickBasePos.x;
    const dy = clientY - this.joystickBasePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(dist, this.joystickRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    knobElement.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // Normalized move vector (-1 to 1)
    const factor = clampedDist / this.joystickRadius;
    this.moveVector.set(Math.cos(angle) * factor, Math.sin(angle) * factor);
  }

  initModals() {
    // Top HUD modal trigger buttons
    document.getElementById('btn-quests')?.addEventListener('click', () => this.toggleModal('modal-quests'));
    document.getElementById('btn-customize')?.addEventListener('click', () => this.toggleModal('modal-customize'));
    document.getElementById('btn-help')?.addEventListener('click', () => this.toggleModal('modal-help'));

    // Close buttons
    document.getElementById('close-quests-btn')?.addEventListener('click', () => this.closeModal('modal-quests'));
    document.getElementById('close-customize-btn')?.addEventListener('click', () => this.closeModal('modal-customize'));
    document.getElementById('close-help-btn')?.addEventListener('click', () => this.closeModal('modal-help'));

    // Outfit Color Pickers
    document.querySelectorAll('#uniform-colors .color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('#uniform-colors .color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = parseInt(swatch.dataset.color.replace('#', '0x'), 16);
        window.player?.setCustomization(color, undefined, undefined);
      });
    });

    // Hat Style Pills
    document.querySelectorAll('#hat-styles .pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#hat-styles .pill-btn').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        window.player?.setCustomization(undefined, pill.dataset.hat, undefined);
      });
    });

    // Bag Style Pills
    document.querySelectorAll('#bag-styles .pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#bag-styles .pill-btn').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        window.player?.setCustomization(undefined, undefined, pill.dataset.bag);
      });
    });
  }

  toggleModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden');
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  updateInput() {
    // If not using touch joystick, poll keyboard keys
    if (!this.joystickActive) {
      let x = 0;
      let y = 0;

      if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;

      this.moveVector.set(x, y);
      if (this.moveVector.lengthSq() > 1) {
        this.moveVector.normalize();
      }

      this.isJumping = !!this.keys['Space'];
      this.isSprinting = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];
    }
  }
}

window.ControlsManager = ControlsManager;
