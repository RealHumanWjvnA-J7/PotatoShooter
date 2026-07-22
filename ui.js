import * as THREE from 'three';

// -----------------------------
// UI / GRAPHICS SYSTEM
// Pulled out of main.js since the settings menu markup + the graphics
// quality/bloom logic together were a big, mostly self-contained chunk.
// createUISystem() takes references to the handful of main.js things it
// actually needs (as a deps object) and returns the handful of things
// main.js needs back. Nothing here reaches into main.js's globals directly -
// that's the whole point of splitting it out.
// -----------------------------

export function createCircleTexture(size, blurRadius = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  ctx.clearRect(0, 0, size, size);
  if (blurRadius > 0) {
    ctx.filter = `blur(${blurRadius}px)`;
  }
  ctx.beginPath();
  ctx.arc(center, center, center - blurRadius - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.DirectionalLight} deps.sun
 * @param {THREE.WebGLRenderer} deps.renderer
 * @param {object} deps.settings - mutated in place, same object main.js reads elsewhere
 * @param {object} deps.GRAPHICS_PROFILES
 * @param {number[]} deps.ANTI_ALIASING_TIERS
 * @param {() => THREE.Object3D[]} deps.getCollidables - getter, not a static array, since main.js reassigns `collidables` when the map loads
 * @param {THREE.Object3D[]} deps.activeTracers - mutated in place (push/splice), safe to pass directly
 * @param {{ isLocked: boolean, lock: () => void, unlock: () => void }} deps.controls
 */
export function createUISystem(deps) {
  const { scene, sun, renderer, settings, GRAPHICS_PROFILES, ANTI_ALIASING_TIERS, getCollidables, activeTracers, controls } = deps;

  // VISUAL SUN & DYNAMIC BLOOM SYSTEM
  const sunGroup = new THREE.Group();
  scene.add(sunGroup);

  const sunCoreMat = new THREE.SpriteMaterial({
    map: createCircleTexture(128, 0),
    color: 0xffffff,
    fog: false
  });
  const sunCoreSprite = new THREE.Sprite(sunCoreMat);
  sunCoreSprite.scale.set(12, 12, 1);
  sunGroup.add(sunCoreSprite);

  let sunGlowSprite = null;

  function applyGraphicsSettings() {
    const p = GRAPHICS_PROFILES[settings.graphics];
    const bloomContainer = document.getElementById('bloom-option-container');

    if (bloomContainer) bloomContainer.style.display = p.bloom ? 'block' : 'none';

    if (!p.shadows) {
      sun.castShadow = false;
    } else {
      sun.castShadow = true;

      let frustumSize = 35;
      if (settings.graphics === 'LOW')    frustumSize = 25;
      if (settings.graphics === 'MEDIUM') frustumSize = 45;
      if (settings.graphics === 'HIGH')   frustumSize = 60;
      if (settings.graphics === 'ULTRA')  frustumSize = 75;
      if (settings.graphics === 'INSANE') frustumSize = 90;

      sun.shadow.mapSize.width = p.shadowRes;
      sun.shadow.mapSize.height = p.shadowRes;
      sun.shadow.camera.near = 1.0;
      sun.shadow.camera.far = 200;

      sun.shadow.camera.left = -frustumSize;
      sun.shadow.camera.right = frustumSize;
      sun.shadow.camera.top = frustumSize;
      sun.shadow.camera.bottom = -frustumSize;

      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      sun.shadow.camera.updateProjectionMatrix();
    }

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const targetedAnisotropy = Math.min(p.anisotropy, maxAnisotropy);

    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = p.shadows;
        obj.receiveShadow = p.shadows;

        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(mat => {
            if (mat.map && mat.map.isTexture) {
              mat.map.anisotropy = targetedAnisotropy;
              mat.map.needsUpdate = true;
            }
            mat.needsUpdate = true;
          });
        }
      }
    });

    if (sunGlowSprite) {
      sunGroup.remove(sunGlowSprite);
      sunGlowSprite.material.map.dispose();
      sunGlowSprite.material.dispose();
      sunGlowSprite = null;
    }

    if (p.bloom && settings.bloomEnabled) {
      const blurRadius = Math.max(4, Math.floor(p.bloomSize * 0.15));
      const glowTex = createCircleTexture(p.bloomSize, blurRadius);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffddaa,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      });
      sunGlowSprite = new THREE.Sprite(glowMat);
      sunGlowSprite.scale.set(30, 30, 1);
      sunGroup.add(sunGlowSprite);
    }
  }

  function toggleMenu() {
    const menu = document.getElementById('game-menu');
    if (menu.style.display === 'none') {
      menu.style.display = 'block';
      controls.unlock();
    } else {
      menu.style.display = 'none';
      controls.lock();
    }
  }

  function buildUI() {
    const menuHTML = `
      <div id="game-menu" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; color:white; font-family:monospace; padding:50px; box-sizing:border-box; overflow-y:auto;">
        <h1 style="color:#00ffcc;">GAME MENU</h1>
        <button id="btn-resume" style="padding:10px 20px; font-size:16px; margin-bottom:20px; cursor:pointer;">Resume</button>

        <h2>Scoreboard</h2>
        <table id="scoreboard-table" style="border-collapse:collapse; margin-bottom:20px; min-width:320px;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid #555;">
              <th style="padding:4px 12px 4px 0;">Player</th>
              <th style="padding:4px 12px;">Kills</th>
              <th style="padding:4px 12px;">Deaths</th>
              <th style="padding:4px 12px;"></th>
            </tr>
          </thead>
          <tbody id="scoreboard-body">
            <tr><td colspan="4" style="padding:4px; opacity:0.6;">Not connected to a server.</td></tr>
          </tbody>
        </table>

        <h2>Settings</h2>
        <button id="btn-open-settings" style="padding:8px 16px; cursor:pointer; margin-bottom:16px;">Open Graphics/Options</button>
        <div id="settings-body" style="display:none;">
        <div style="margin-bottom:10px;">
          <label>Debug Tracers:</label>
          <button id="btn-tracers">OFF</button>
        </div>
        <div style="margin-bottom:10px;">
          <label>Collision Capsule Mesh Visible:</label>
          <button id="btn-visible-player">OFF</button>
        </div>
        <div style="margin-bottom:10px;">
          <label>Show XYZ Position:</label>
          <button id="btn-show-coords">OFF</button>
        </div>
        <div style="margin-bottom:10px;">
          <label>Graphics Quality:</label>
          <button id="btn-graphics">MEDIUM</button>
        </div>
        <div style="margin-bottom:10px;">
          <label>Anti-Aliasing (MSAA Samples - Note: Handled natively now):</label>
          <button id="btn-aa">4x</button>
        </div>
        <div id="bloom-option-container" style="margin-bottom:10px; display:none;">
          <label>Toggle Bloom:</label>
          <button id="btn-bloom">ON</button>
        </div>
        <div style="margin-bottom:10px;">
          <label>Camera Bob Intensity (0.00 - 2.00): <span id="bob-val">0.60</span></label><br>
          <input type="range" id="slider-bob" min="0" max="2" step="0.05" value="0.6" style="width:200px;">
        </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', menuHTML);

    const btnOpenSettings = document.getElementById('btn-open-settings');
    const settingsBody = document.getElementById('settings-body');
    btnOpenSettings.addEventListener('click', () => {
      const showing = settingsBody.style.display !== 'none';
      settingsBody.style.display = showing ? 'none' : 'block';
      btnOpenSettings.textContent = showing ? 'Open Graphics/Options' : 'Hide Graphics/Options';
    });

    const btnResume = document.getElementById('btn-resume');
    const btnTracers = document.getElementById('btn-tracers');
    const btnVisiblePlayer = document.getElementById('btn-visible-player');
    const btnGraphics = document.getElementById('btn-graphics');
    const btnAA = document.getElementById('btn-aa');
    const btnBloom = document.getElementById('btn-bloom');
    const sliderBob = document.getElementById('slider-bob');
    const bobVal = document.getElementById('bob-val');

    btnResume.addEventListener('click', toggleMenu);

    btnTracers.addEventListener('click', () => {
      settings.debugTracers = !settings.debugTracers;
      btnTracers.textContent = settings.debugTracers ? 'ON' : 'OFF';
      if (!settings.debugTracers) {
        while (activeTracers.length > 0) {
          const t = activeTracers.pop();
          scene.remove(t.mesh);
        }
      }
    });

    btnVisiblePlayer.addEventListener('click', () => {
      settings.visiblePlayer = !settings.visiblePlayer;
      btnVisiblePlayer.textContent = settings.visiblePlayer ? 'ON' : 'OFF';
    });

    const btnShowCoords = document.getElementById('btn-show-coords');
    btnShowCoords.addEventListener('click', () => {
      settings.showCoords = !settings.showCoords;
      btnShowCoords.textContent = settings.showCoords ? 'ON' : 'OFF';
      const coordsEl = document.getElementById('coords-display');
      if (coordsEl) coordsEl.style.display = settings.showCoords ? 'block' : 'none';
    });

    const graphicsLevels = Object.keys(GRAPHICS_PROFILES);
    btnGraphics.addEventListener('click', () => {
      let idx = graphicsLevels.indexOf(settings.graphics);
      idx = (idx + 1) % graphicsLevels.length;
      settings.graphics = graphicsLevels[idx];
      btnGraphics.textContent = settings.graphics;
      applyGraphicsSettings();
    });

    btnAA.addEventListener('click', () => {
      let idx = ANTI_ALIASING_TIERS.indexOf(settings.msaaSamples);
      idx = (idx + 1) % ANTI_ALIASING_TIERS.length;
      settings.msaaSamples = ANTI_ALIASING_TIERS[idx];
      btnAA.textContent = settings.msaaSamples === 0 ? 'OFF' : `${settings.msaaSamples}x`;
    });

    btnBloom.addEventListener('click', () => {
      settings.bloomEnabled = !settings.bloomEnabled;
      btnBloom.textContent = settings.bloomEnabled ? 'ON' : 'OFF';
      applyGraphicsSettings();
    });

    sliderBob.addEventListener('input', (e) => {
      settings.bobIntensity = parseFloat(e.target.value);
      bobVal.textContent = settings.bobIntensity.toFixed(2);
    });

    btnAA.textContent = `${settings.msaaSamples}x`;
  }

  buildUI();
  setAdminMode(false); // hidden by default until solo/admin status is confirmed

  function updateScoreboard(rows, isAdminFlag, onBanClick) {
    const tbody = document.getElementById('scoreboard-body');
    if (!tbody) return;
    try {
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:4px; opacity:0.6;">Not connected to a server.</td></tr>';
        return;
      }
      const newTbody = document.createElement('tbody');
      newTbody.id = 'scoreboard-body';
      rows.forEach((row) => {
        try {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid #333';
          const name = row && row.name ? String(row.name) : 'Player';
          const kills = (row && row.kills) || 0;
          const deaths = (row && row.deaths) || 0;
          const isYou = name.endsWith('(you)');
          const banCell = (isAdminFlag && !isYou && row && row.uid)
            ? `<button data-uid="${row.uid}" class="scoreboard-ban-btn" style="background:#661111; color:#fff; border:none; padding:2px 8px; cursor:pointer;">BAN</button>`
            : '';
          tr.innerHTML = `
            <td style="padding:4px 12px 4px 0;">${name}</td>
            <td style="padding:4px 12px;">${kills}</td>
            <td style="padding:4px 12px;">${deaths}</td>
            <td style="padding:4px 12px;">${banCell}</td>
          `;
          newTbody.appendChild(tr);
        } catch (rowErr) {
          console.warn('[scoreboard] skipped a malformed row', rowErr, row);
        }
      });
      tbody.replaceWith(newTbody);

      if (isAdminFlag && onBanClick) {
        newTbody.querySelectorAll('.scoreboard-ban-btn').forEach((btn) => {
          btn.addEventListener('click', () => onBanClick(btn.dataset.uid));
        });
      }
    } catch (err) {
      console.warn('[scoreboard] render failed', err);
    }
  }

  function setAdminMode(isAdminFlag) {
    ['btn-tracers', 'btn-visible-player'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const row = btn.closest('div');
      if (row) row.style.display = isAdminFlag ? 'block' : 'none';
    });
  }

  return { toggleMenu, applyGraphicsSettings, sunGroup, updateScoreboard, setAdminMode };
}
