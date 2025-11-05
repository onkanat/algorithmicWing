import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates, naca5Coordinates } from './nacaprofile.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { animateFoil } from './animate.foil.js';



const params = {
    naca: '2412',   // NACA 4-digit code
    chord: 1.0,     // chord length
    points: 200,    // points per surface
    depth: 3,     // extrusion depth (spanwise)
    scale: 3.0,     // visual scale
};

// initialize params from URL query string if present so mode switches preserve state
(function initParamsFromURL() {
    try {
        const p = new URLSearchParams(window.location.search);
        const n = p.get('naca');
        if (n) params.naca = String(n).replace(/\D/g, '');
        const chord = parseFloat(p.get('chord'));
        if (!Number.isNaN(chord)) params.chord = chord;
        const points = parseInt(p.get('points'), 10);
        if (!Number.isNaN(points)) params.points = points;
        const depth = parseFloat(p.get('depth'));
        if (!Number.isNaN(depth)) params.depth = depth;
        const scale = parseFloat(p.get('scale'));
        if (!Number.isNaN(scale)) params.scale = scale;
    } catch (e) {
        // ignore
    }
})();

// read mode from URL query param ?mode=cinematic or ?mode=normal (default normal)
const urlParams = new URLSearchParams(window.location.search);
const startMode = (urlParams.get('mode') || 'normal').toLowerCase();

// THREE.js scene
const scene = new THREE.Scene();
// default background color (used when no HDR env is applied or when running with alpha)
scene.background = new THREE.Color(0x203040);

// camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100);
camera.position.set(0.5, 0.2, 30);
camera.lookAt(0, 0, 0);


const loader = new RGBELoader();
loader.load('assets/plains_sunset_4k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // Only set the scene background to the HDR texture when in cinematic mode
    // so normal mode's CSS vignette remains visible (renderer uses alpha there).
    if (startMode === 'cinematic') {
        scene.background = texture;
    }
    // … optionally dispose, etc
});


// renderer
// Use alpha on the renderer in normal mode so a CSS background (vignette/radial)
// behind the canvas can be visible. Cinematic mode keeps an opaque canvas so
// the HDR background/image covers the whole view.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: startMode === 'normal' });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = '0';

// If we're in normal mode, use a subtle, centered radial vignette as the
// page background so the canvas (rendered with transparency) appears more
// professional and focused on the center. Cinematic mode leaves background
// to the HDR environment.
if (startMode === 'normal') {
    document.body.style.background = 'radial-gradient(circle at center, #1b8e92d7 0%, #246cb4ff 45%, #a2a5acff 100%)';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundSize = 'cover';
}

document.body.appendChild(renderer.domElement);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// lights
const hemi = new THREE.HemisphereLight(0xbbd6ff, 0x202025, 1.4);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 3);
dir.position.set(2, 2, 1);
scene.add(dir);

// build airfoil mesh (updates in-place if a foil group already exists in the scene)
function buildAirfoilMesh() {
    const coordsFunc = (String(params.naca).replace(/\D/g, '').length === 5) ? naca5Coordinates : naca4Coordinates;
    const shapePts = coordsFunc(params.naca, params.chord, params.points);
    const shape = new THREE.Shape(shapePts);

    // Extrude to give some span-wise thickness
    const extrudeSettings = {
        depth: params.depth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: params.points,
    };
    const newGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    newGeom.scale(params.scale, params.scale, params.scale);

    // center geometry on z
    newGeom.translate(0, 0, - (params.depth * params.scale) / 2);

    // try to find an existing foil group in the scene so we can update geometry in-place
    const existing = scene.getObjectByName('foil-group');
    if (existing && existing.children.length > 0 && existing.children[0].isMesh) {
        const mesh = existing.children[0];
        const oldGeom = mesh.geometry;

        // If the existing geometry is a BufferGeometry, copy key attributes so references (e.g. morph targets)
        // attached to the mesh object remain valid. This attempts to preserve any UI/morph bindings.
        if (oldGeom && oldGeom.isBufferGeometry) {
            // copy index
            if (newGeom.index) {
                oldGeom.setIndex(newGeom.index.clone());
            } else {
                oldGeom.setIndex(null);
            }

            // copy main attributes (position, normal, uv). Keep any existing morphAttributes untouched.
            ['position', 'normal', 'uv'].forEach((attr) => {
                if (newGeom.attributes[attr]) {
                    oldGeom.setAttribute(attr, newGeom.attributes[attr].clone());
                } else {
                    oldGeom.deleteAttribute(attr);
                }
            });

            // recompute derived data
            oldGeom.computeBoundingBox();
            oldGeom.computeBoundingSphere();
            // if normals were replaced above, ensure they are valid
            if (!oldGeom.attributes.normal) oldGeom.computeVertexNormals();

            // dispose the temporary geometry we created
            if (typeof newGeom.dispose === 'function') newGeom.dispose();

            return existing;
        }

        // fallback: if not buffer geometry, remove and recreate (less ideal)
        scene.remove(existing);
        if (existing.geometry) existing.geometry.dispose();
    }

    // create new material (or reuse if desired by finding existing mesh material)
    const mat = new THREE.MeshStandardMaterial({
        color: 0xb0c4de,
        metalness: 0.9,
        roughness: 0.25,
        envMapIntensity: 1.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(newGeom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.name = 'foil-group';
    group.add(mesh);

    return group;
}

let foil = buildAirfoilMesh();
scene.add(foil);

// create span morph UI once and keep the controller so we can reattach a new foil
// when geometry is rebuilt without recreating the UI (which would reset values)
// create span morph UI and show panel in normal mode only
const initialCoordsFunc = (String(params.naca).replace(/\D/g, '').length === 5) ? naca5Coordinates : naca4Coordinates;
// read initial span-morph params from URL as well
function readSpanParamsFromURL() {
    const p = new URLSearchParams(window.location.search);
    const s = parseFloat(p.get('start'));
    const f = parseFloat(p.get('factor'));
    const slices = parseInt(p.get('slices'), 10);
    const shift = parseFloat(p.get('shift'));
    const dihedral = parseFloat(p.get('dihedral'));
    const out = {};
    if (!Number.isNaN(s)) out.startPercent = Math.max(0, Math.min(1, s));
    if (!Number.isNaN(f)) out.thicknessFactor = f;
    if (!Number.isNaN(slices)) out.slices = slices;
    if (!Number.isNaN(shift)) out.shiftAmount = shift;
    if (!Number.isNaN(dihedral)) out.dihedralAngle = dihedral * Math.PI / 180;
    return out;
}

const spanInit = readSpanParamsFromURL();
let spanMorphController = addSpanMorphUI(params, foil, initialCoordsFunc, Object.assign({ appendPanel: startMode === 'normal' }, spanInit));

// rebuild helper that disposes previous geometry/materials properly (module scope)
function rebuildFoil() {
    if (!foil) return;
    scene.remove(foil);
    foil.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    foil = buildAirfoilMesh();
    scene.add(foil);
}
// reference axes
const axes = new THREE.AxesHelper(0.5 * params.scale);
scene.add(axes);

// draw colored arrow axes and labeled sprites for X, Y, Z
(function addLabeledAxes() {
    const axisLen = 0.6 * params.scale;
    const headLength = 0.08 * params.scale;
    const headWidth = 0.04 * params.scale;

    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLen, 0xff0000, headLength, headWidth);
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLen, 0x00ff00, headLength, headWidth);
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLen, 0x0000ff, headLength, headWidth);

    scene.add(arrowX, arrowY, arrowZ);

    function makeLabel(text, color) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        // background optional for readability
        ctx.font = `${Math.floor(size * 0.05)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';



        // fill
        ctx.fillStyle = color;
        ctx.fillText(text, size / 2, size / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false });
        const sprite = new THREE.Sprite(mat);
        const s = 0.16 * params.scale;
        sprite.scale.set(s, s, 1);
        return sprite;
    }

    const labelX = makeLabel('X', '#ff4444');
    labelX.position.set(axisLen * 1.08, 0, 0);
    const labelY = makeLabel('Y', '#44ff44');
    labelY.position.set(0, axisLen * 1.08, 0);
    const labelZ = makeLabel('Z', '#4444ff');
    labelZ.position.set(0, 0, axisLen * 1.08);

    // name and attach axis direction metadata so we can interact with them
    arrowX.name = 'axis-X';
    arrowY.name = 'axis-Y';
    arrowZ.name = 'axis-Z';
    arrowX.userData = { axis: new THREE.Vector3(1, 0, 0) };
    arrowY.userData = { axis: new THREE.Vector3(0, 1, 0) };
    arrowZ.userData = { axis: new THREE.Vector3(0, 0, 1) };

    labelX.name = 'label-X';
    labelY.name = 'label-Y';
    labelZ.name = 'label-Z';
    labelX.userData = { axis: new THREE.Vector3(1, 0, 0) };
    labelY.userData = { axis: new THREE.Vector3(0, 1, 0) };
    labelZ.userData = { axis: new THREE.Vector3(0, 0, 1) };

    scene.add(labelX, labelY, labelZ);
})();

// double-click on an axis label or arrow to snap the camera to look perpendicular
// to the wing from that axis. This provides a quick orthographic-like view.
const _axisRaycaster = new THREE.Raycaster();
const _axisMouse = new THREE.Vector2();
function onAxisDoubleClick(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    _axisMouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    _axisMouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    _axisRaycaster.setFromCamera(_axisMouse, camera);

    const candidates = ['label-X', 'label-Y', 'label-Z', 'axis-X', 'axis-Y', 'axis-Z']
        .map((n) => scene.getObjectByName(n))
        .filter(Boolean);

    const intersects = _axisRaycaster.intersectObjects(candidates, true);
    let hit = null;
    if (intersects && intersects.length > 0) {
        hit = intersects[0].object;
    } else {
        // Fallback: if user clicked near the projected axis label/arrow on screen,
        // accept that as a hit. This improves double-click sensitivity when
        // the visible label/arrow is small or the raycast misses.
        const rect = renderer.domElement.getBoundingClientRect();
        const px = evt.clientX;
        const py = evt.clientY;
        const pickThreshold = 28; // pixels
        let best = { dist: Infinity, obj: null };
        for (const obj of candidates) {
            const wp = new THREE.Vector3();
            obj.getWorldPosition(wp);
            const ndc = wp.clone().project(camera);
            const sx = rect.left + (ndc.x + 1) / 2 * rect.width;
            const sy = rect.top + (1 - ndc.y) / 2 * rect.height;
            const dx = sx - px;
            const dy = sy - py;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < pickThreshold && d < best.dist) {
                best = { dist: d, obj };
            }
        }
        if (best.obj) hit = best.obj;
    }
    if (!hit) return;
    const axisDir = (hit.userData && hit.userData.axis) ? hit.userData.axis.clone() : null;
    if (!axisDir) return;

    // compute target (center of the wing)
    const target = new THREE.Vector3(0, 0, 0);
    const currDist = camera.position.distanceTo(target) || 20;
    // place camera along axis direction at current distance
    const endPos = axisDir.clone().multiplyScalar(currDist);

    // animate camera position and controls.target smoothly
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 400; // ms
    const startTime = performance.now();
    function tick(now) {
        const t = Math.min(1, (now - startTime) / duration);
        camera.position.lerpVectors(startPos, endPos, t);
        controls.target.lerpVectors(startTarget, target, t);
        controls.update();
        if (t < 1) requestAnimationFrame(tick);
        else {
            camera.lookAt(target);
            controls.target.copy(target);
            controls.update();
        }
    }
    requestAnimationFrame(tick);
}

renderer.domElement.addEventListener('dblclick', onAxisDoubleClick);

// subtle grid overlays for Normal mode only (one per principal plane)
let _grids = [];
let _gridVisible = true;
if (startMode === 'normal') {
    const gridSize = 6 * params.scale;
    // increase grid density by ~35% as requested (base 40 -> ~54)
    const gridDivs = Math.round(40 * 1.35);
    const baseOpacity = 0.06 * 1.35;

    // XZ plane (horizontal)
    const gridXZ = new THREE.GridHelper(gridSize, gridDivs, 0x2b3036, 0x191b1d);
    gridXZ.rotation.x = 0;

    // XY plane (front-facing)
    const gridXY = new THREE.GridHelper(gridSize, gridDivs, 0x2b3036, 0x191b1d);
    gridXY.rotation.x = Math.PI / 2;

    // YZ plane (side-facing)
    const gridYZ = new THREE.GridHelper(gridSize, gridDivs, 0x2b3036, 0x191b1d);
    gridYZ.rotation.z = Math.PI / 2;

    [_grids[0], _grids[1], _grids[2]] = [gridXZ, gridXY, gridYZ];

    for (const g of _grids) {
        if (g.material) {
            g.material.opacity = baseOpacity;
            g.material.transparent = true;
        }
        g.renderOrder = 0;
        scene.add(g);
    }

    // helper to toggle grids at runtime
    function setGridVisibility(v) {
        _gridVisible = !!v;
        for (const gg of _grids) {
            gg.visible = _gridVisible;
        }
    }

    // expose setter to global scope for UI closure use
    window.__setGridVisibility = setGridVisibility;
}

window.addEventListener('resize', onWindowResize);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// simple GUI via keyboard: change NACA code by pressing keys (optional)
// simple on-screen numeric inputs to control NACA and numeric params
(function createUI() {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'absolute',
        top: '10px',
        left: '10px',
        padding: '8px',
        background: 'rgba(20,30,40,0.9)',
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: '13px',
        borderRadius: '6px',
        zIndex: 9999,
        minWidth: '180px'
    });

    function makeRow(labelText, input) {
        const row = document.createElement('div');
        row.style.marginBottom = '6px';
        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.marginBottom = '3px';
        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    // NACA input: allow 4 or 5 digits (text input, digits-only)
    const nacaInput = document.createElement('input');
    nacaInput.type = 'text';
    nacaInput.maxLength = 5;
    nacaInput.value = params.naca;
    nacaInput.style.width = '100%';
    // allow only digits while typing
    nacaInput.addEventListener('input', () => {
        nacaInput.value = nacaInput.value.replace(/[^0-9]/g, '').slice(0, 5);
    });

    const chordInput = document.createElement('input');
    chordInput.type = 'number';
    chordInput.step = '0.01';
    chordInput.min = '0.01';
    chordInput.value = params.chord;
    chordInput.style.width = '100%';

    const pointsInput = document.createElement('input');
    pointsInput.type = 'number';
    pointsInput.step = '1';
    pointsInput.min = '10';
    pointsInput.max = '2000';
    pointsInput.value = params.points;
    pointsInput.style.width = '100%';

    const depthInput = document.createElement('input');
    depthInput.type = 'number';
    depthInput.step = '0.01';
    depthInput.min = '0.001';
    depthInput.value = params.depth;
    depthInput.style.width = '100%';

    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.step = '0.1';
    scaleInput.value = params.scale;
    scaleInput.style.width = '100%';

    // inputs will auto-apply on change; no visible Apply button needed

    // assemble panel rows
    panel.appendChild(makeRow('NACA (4/5-digit)', nacaInput));
    panel.appendChild(makeRow('Chord', chordInput));
    panel.appendChild(makeRow('Points', pointsInput));
    panel.appendChild(makeRow('Depth', depthInput));
    panel.appendChild(makeRow('Scale', scaleInput));
    // Note: Apply button removed — changes are applied automatically

    // Note: standalone Reset button removed — Normal button performs reset

    // Grid toggle (Normal mode only): allow quick on/off and keyboard shortcut
    let gridToggle = null;
    if (startMode === 'normal' && typeof window.__setGridVisibility === 'function') {
        gridToggle = document.createElement('button');
        gridToggle.textContent = _gridVisible ? 'Grid: On' : 'Grid: Off';
        Object.assign(gridToggle.style, { width: '100%', padding: '6px', marginTop: '6px', cursor: 'pointer', background: '#444', color: '#fff', border: 'none' });
        gridToggle.addEventListener('click', () => {
            const next = !_gridVisible;
            window.__setGridVisibility(next);
            gridToggle.textContent = next ? 'Grid: On' : 'Grid: Off';
        });
        panel.appendChild(gridToggle);

        // keyboard shortcut: 'g' to toggle grid
        window.addEventListener('keydown', (ev) => {
            if ((ev.key === 'g' || ev.key === 'G') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                ev.preventDefault();
                const next = !_gridVisible;
                window.__setGridVisibility(next);
                if (gridToggle) gridToggle.textContent = next ? 'Grid: On' : 'Grid: Off';
            }
        });
    }

    // Mode buttons: switch between normal and cinematic by reloading with ?mode=
    const normalBtn = document.createElement('button');
    normalBtn.textContent = 'Reset';
    Object.assign(normalBtn.style, { width: '48%', padding: '6px', marginRight: '4%', marginTop: '8px', cursor: 'pointer', background: '#f0f0f0', color: '#000', border: '1px solid #444' });
    normalBtn.addEventListener('click', () => {
        // only reset span-morph defaults (do not change mode)
        if (spanMorphController && typeof spanMorphController.resetDefaults === 'function') {
            spanMorphController.resetDefaults();
        } else {
            console.warn('Span morph controller not available to reset');
        }
    });

    const cinematicBtn = document.createElement('button');
    cinematicBtn.textContent = 'Cinematic Mode (Ctrl+M)';
    Object.assign(cinematicBtn.style, { width: '48%', padding: '6px', marginTop: '8px', cursor: 'pointer', background: '#2b8cff', color: '#fff', border: 'none' });
    cinematicBtn.addEventListener('click', () => { window.location.search = '?mode=cinematic'; });

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.appendChild(normalBtn);
    btnRow.appendChild(cinematicBtn);
    panel.appendChild(btnRow);

    // attach main control panel only in normal mode
    if (startMode === 'normal') {
        document.body.appendChild(panel);
    }

    // auto-apply function: read inputs and rebuild immediately (debounced)
    function applyInputs() {
        // NACA: accept 4 or 5 digit codes
        const raw = String(nacaInput.value || '').replace(/\D/g, '');
        let nacaStr = params.naca;
        if (raw.length === 5) {
            nacaStr = raw;
        } else {
            let nacaVal = parseInt(raw, 10) || 0;
            nacaVal = Math.max(0, Math.min(9999, nacaVal));
            nacaStr = String(nacaVal).padStart(4, '0');
        }

        params.naca = nacaStr;
        params.chord = Math.max(0.001, parseFloat(chordInput.value) || params.chord);
        params.points = Math.max(10, Math.min(2000, parseInt(pointsInput.value, 10) || params.points));
        params.depth = Math.max(0.001, parseFloat(depthInput.value) || params.depth);
        params.scale = Math.max(0.01, parseFloat(scaleInput.value) || params.scale);

        // rebuild using module-level helper (keeps resource disposal correct)
        rebuildFoil();
        // reattach the existing span-morph controller to the newly built foil so
        // current UI values (morph parameters) are preserved instead of creating
        // a new UI which would reset fields.
        if (spanMorphController && typeof spanMorphController.setFoilMesh === 'function') {
            spanMorphController.setFoilMesh(foil);
        }

        // Update the URL (without reloading) so mode switches preserve latest values
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('naca', params.naca);
            ps.set('chord', String(params.chord));
            ps.set('points', String(params.points));
            ps.set('depth', String(params.depth));
            ps.set('scale', String(params.scale));
            // span morph values
            if (spanMorphController && typeof spanMorphController.getCurrentValues === 'function') {
                const s = spanMorphController.getCurrentValues();
                ps.set('start', String(s.startPercent));
                ps.set('factor', String(s.thicknessFactor));
                ps.set('slices', String(s.slices));
                ps.set('shift', String(s.shiftAmount));
                ps.set('dihedral', String(s.dihedralAngle * 180 / Math.PI));
            }
            // preserve mode param if present
            const mode = (new URLSearchParams(window.location.search)).get('mode');
            if (mode) ps.set('mode', mode);
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) {
            // ignore URL update failures
        }
    }

    let debounceTimer = null;
    function scheduleApply() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => applyInputs(), 250);
    }
    [nacaInput, chordInput, pointsInput, depthInput, scaleInput].forEach((inp) => {
        inp.addEventListener('input', scheduleApply);
    });
})();

function updateNACA(code) {
    params.naca = code;
    foil = buildAirfoilMesh();
    // add foil to scene only if it's not already present
    const existing = scene.getObjectByName('foil-group');
    if (!existing) {
        scene.add(foil);
    } else if (existing !== foil) {
        // buildAirfoilMesh returned a new group (recreated) — replace the old one
        scene.remove(existing);
        scene.add(foil);
    }
    // reattach existing span morph controller to the new foil so UI state persists
    if (spanMorphController && typeof spanMorphController.setFoilMesh === 'function') {
        spanMorphController.setFoilMesh(foil);
    }

}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// 🎥 Sinematik Kamera Animasyonu + Manuel Kontroller
// Kamera otomatik döner, parametreler sağdaki UI'dan kontrol edilir
// Normal görünüme dönmek için aşağıdaki satırı yorum yap ve aşağıdaki animate() satırının yorumunu kaldır
// animate();  // Normal mod: Mouse ile kamera kontrolü

// Start the chosen mode
if (startMode === 'cinematic') {
    // cinematic mode
    animateFoil(scene, foil, renderer, camera, controls, 30, 60);
} else {
    // normal interactive mode
    animate();
}

// Global shortcut to toggle mode: Ctrl+M or Cmd+M
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        // determine current mode from the live URL (don't use the startup snapshot)
        const paramsNow = new URLSearchParams(window.location.search);
        const cur = (paramsNow.get('mode') || 'normal').toLowerCase();
        const next = (cur === 'cinematic') ? 'normal' : 'cinematic';
        paramsNow.set('mode', next);
        // preserve other query params while updating mode
        window.location.search = '?' + paramsNow.toString();
    }
});