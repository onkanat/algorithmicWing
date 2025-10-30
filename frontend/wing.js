import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// /Users/muratbatuhangunaydin/projects/youtube/algorithmicWing/frontend/wing.js
// Simple NACA 4-digit airfoil visualiser using Three.js (ES module).
// Usage: include this module in a bundler-aware page. Adjust params below.


const params = {
    naca: '2412',   // NACA 4-digit code
    chord: 1.0,     // chord length
    points: 200,    // points per surface
    depth: 0.1,     // extrusion depth (spanwise)
    scale: 3.0,     // visual scale
};

function parseNACA(code) {
    const s = String(code).padStart(4, '0');
    const m = parseInt(s[0], 10) / 100.0;     // max camber
    const p = parseInt(s[1], 10) / 10.0;      // location of max camber
    const t = parseInt(s.slice(2, 4), 10) / 100.0; // thickness
    return { m, p, t };
}

function naca4Coordinates(code, chord = 1, n = 200) {
    const { m, p, t } = parseNACA(code);
    const ptsUpper = [];
    const ptsLower = [];

    // cosine spacing for better leading-edge resolution
    for (let i = 0; i <= n; i++) {
        const beta = (i / n) * Math.PI;
        const x = (1 - Math.cos(beta)) / 2 * chord; // from 0..chord

        // thickness distribution (NACA 4-digit standard)
        const yt =
            (t * chord / 0.2) *
            (0.2969 * Math.sqrt(x / chord) -
                0.1260 * (x / chord) -
                0.3516 * Math.pow(x / chord, 2) +
                0.2843 * Math.pow(x / chord, 3) -
                0.1015 * Math.pow(x / chord, 4));

        // camber line and its slope
        let yc = 0;
        let dyc_dx = 0;
        if (p === 0) {
            yc = 0;
            dyc_dx = 0;
        } else if (x / chord < p) {
            yc = (m / (p * p)) * (2 * p * (x / chord) - Math.pow(x / chord, 2)) * chord;
            dyc_dx = (2 * m / (p * p)) * (p - x / chord);
        } else {
            yc =
                (m / Math.pow(1 - p, 2)) *
                (1 - 2 * p + 2 * p * (x / chord) - Math.pow(x / chord, 2)) *
                chord;
            dyc_dx = (2 * m / Math.pow(1 - p, 2)) * (p - x / chord);
        }

        const theta = Math.atan(dyc_dx);

        const xu = x - yt * Math.sin(theta);
        const yu = yc + yt * Math.cos(theta);

        const xl = x + yt * Math.sin(theta);
        const yl = yc - yt * Math.cos(theta);

        ptsUpper.push(new THREE.Vector2(xu, yu));
        ptsLower.push(new THREE.Vector2(xl, yl));
    }

    // build top surface from leading (x=0) to trailing (x=chord) and lower returning
    const coords = [];
    for (let i = 0; i < ptsUpper.length; i++) coords.push(ptsUpper[i]);
    for (let i = ptsLower.length - 1; i >= 0; i--) coords.push(ptsLower[i]);

    // center chord at origin by shifting x by -chord/2 and optionally scale
    const shifted = coords.map(p => new THREE.Vector2(p.x - chord / 2, p.y));
    return shifted;
}

// THREE.js scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x203040);

// camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100);
camera.position.set(0.5, 0.2, 10);
camera.lookAt(0, 0, 0);

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = '0';
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

// build airfoil mesh
function buildAirfoilMesh() {
    const shapePts = naca4Coordinates(params.naca, params.chord, params.points);
    const shape = new THREE.Shape(shapePts);

    // Extrude to give some span-wise thickness
    const extrudeSettings = {
        depth: params.depth,
        bevelEnabled: false,
        steps: 1,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.scale(params.scale, params.scale, params.scale);

    // center geometry on z
    geom.translate(0, 0, - (params.depth * params.scale) / 2);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x156289,
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // wireframe
    const geo_wire = new THREE.EdgesGeometry(geom);
    const line = new THREE.LineSegments(geo_wire, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);
    return group;
}

let foil = buildAirfoilMesh();
scene.add(foil);

// reference axes
const axes = new THREE.AxesHelper(0.5 * params.scale);
scene.add(axes);

// grid
const grid = new THREE.GridHelper(4 * params.scale, 20, 0x222222, 0x111111);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

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

    // NACA as numeric input (will be zero-padded to 4 digits)
    const nacaInput = document.createElement('input');
    nacaInput.type = 'number';
    nacaInput.min = 0;
    nacaInput.max = 9999;
    nacaInput.value = parseInt(params.naca, 10);
    nacaInput.style.width = '100%';

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
    scaleInput.min = '0.1';
    scaleInput.value = params.scale;
    scaleInput.style.width = '100%';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Uygula';
    applyBtn.style.width = '100%';
    applyBtn.style.padding = '6px';
    applyBtn.style.cursor = 'pointer';

    panel.appendChild(makeRow('NACA (sayı, örn 2412)', nacaInput));
    panel.appendChild(makeRow('Chord', chordInput));
    panel.appendChild(makeRow('Points', pointsInput));
    panel.appendChild(makeRow('Depth', depthInput));
    panel.appendChild(makeRow('Scale', scaleInput));
    panel.appendChild(applyBtn);
    document.body.appendChild(panel);

    // rebuild helper that disposes previous geometry/materials properly
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

    // apply button (reads numeric inputs, sanitizes, updates params and rebuilds)
    applyBtn.addEventListener('click', () => {
        // NACA: zero-pad to 4 digits
        let nacaVal = parseInt(nacaInput.value, 10) || 0;
        nacaVal = Math.max(0, Math.min(9999, nacaVal));
        const nacaStr = String(nacaVal).padStart(4, '0');

        params.naca = nacaStr;
        params.chord = Math.max(0.001, parseFloat(chordInput.value) || params.chord);
        params.points = Math.max(10, Math.min(2000, parseInt(pointsInput.value, 10) || params.points));
        params.depth = Math.max(0.001, parseFloat(depthInput.value) || params.depth);
        params.scale = Math.max(0.01, parseFloat(scaleInput.value) || params.scale);

        // update NACA via existing helper (keeps naming consistent)
        updateNACA(params.naca);
    });

    // optional: rebuild live while editing (debounced)
    let debounceTimer = null;
    function scheduleApply() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => applyBtn.click(), 250);
    }
    [nacaInput, chordInput, pointsInput, depthInput, scaleInput].forEach((inp) => {
        inp.addEventListener('input', scheduleApply);
    });
})();

function updateNACA(code) {
    params.naca = code;
    scene.remove(foil);
    foil.geometry?.dispose?.();
    foil = buildAirfoilMesh();
    scene.add(foil);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();