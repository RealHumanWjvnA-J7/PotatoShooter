import * as THREE from 'three';

export class TargetCube {
  constructor(scene) {
    this.scene = scene;
    this.damageHistory = [];
    this.size = { w: 2, h: 2, d: 2 };

    // 1. Create the Cube Mesh
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xff3b30, // Bright target red
      roughness: 0.3,
      metalness: 0.1
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    // Attach markers so main.js can identify this specific object during raycasting
    this.mesh.userData.isTargetCube = true;
    this.mesh.userData.parentInstance = this;

    this.scene.add(this.mesh);

    // 2. Create an Overhead Dynamic Canvas Text Display
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    
    const spriteMaterial = new THREE.SpriteMaterial({ map: this.texture, transparent: true });
    this.textSprite = new THREE.Sprite(spriteMaterial);
    this.textSprite.scale.set(4, 1, 1); // Maintain a clean text aspect ratio banner

    this.scene.add(this.textSprite);

    // Initial default positions & sizes (completely adjustable via code below)
    this.setSize(1, 3, 1);
    this.setPosition(60, 1.5, -5);
    this.updateText(0);
  }

  /**
   * Code-Controlled Movement API
   */
  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    // Locks the text display precisely above the target's upper bounds
    this.textSprite.position.set(x, y + (this.size.h / 2) + 0.9, z);
  }

  /**
   * Code-Controlled Size Adjustment API
   */
  setSize(w, h, d) {
    this.size = { w, h, d };
    this.mesh.scale.set(w, h, d);
    // Shift text alignment higher to account for scaling modifications
    this.textSprite.position.y = this.mesh.position.y + (h / 2) + 0.9;
  }

  /**
   * Registers a fresh hit instance
   */
  takeDamage(amount) {
    this.damageHistory.push({
      amount: amount,
      timestamp: performance.now()
    });
  }

  /**
   * Evaluates rolling history window & updates display
   */
  update() {
    const now = performance.now();
    
    // Purge records older than 5000 milliseconds (5 seconds)
    this.damageHistory = this.damageHistory.filter(hit => now - hit.timestamp <= 5000);

    // Accumulate valid rolling damage
    const totalRecentDamage = this.damageHistory.reduce((sum, hit) => sum + hit.amount, 0);

    // Draw the new score back to the canvas texture map
    this.updateText(totalRecentDamage);
  }

  updateText(damageValue) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Render transparent pill background for contrast matching
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(16, 16, this.canvas.width - 32, this.canvas.height - 32, 24);
    ctx.fill();

    // Render text typography metrics
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = damageValue > 0 ? '#ffcc00' : '#ffffff'; // Blinks yellow when receiving heat
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Damage (Past 5s): ${damageValue}`, this.canvas.width / 2, this.canvas.height / 2);

    this.texture.needsUpdate = true;
  }

  /**
   * Housekeeping disposal helper
   */
  destroy() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.textSprite);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
    this.textSprite.material.dispose();
  }
}
