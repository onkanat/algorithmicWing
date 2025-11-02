import * as THREE from 'three';

export function addSpanMorphUI(params, foil, naca4Coordinates) {
    let currentFoil = foil;

    // --- Span Morph Geometry ---
    function createSpanMorphGeometry(startPercent = 0.5, thicknessFactor = 1.0, slices = 40, shiftAmount = 0, dihedralAngle = 0) {
        let shape2D = naca4Coordinates(params.naca, params.chord, params.points);

        if (shape2D.length > 1) {
            const first = shape2D[0];
            const last = shape2D[shape2D.length - 1];
            if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
                shape2D = shape2D.slice(0, -1);
            }
        }

        const N = shape2D.length;
        const span = params.depth * params.scale;
        const half = span / 2;
        const startZ = -half + Math.max(0, Math.min(1, startPercent)) * span;
        const denom = half - startZ;

        const vertCount = slices * N + 2;
        const positions = new Float32Array(vertCount * 3);
        let pi = 0;

        const maxShiftAbs = shiftAmount * params.chord * params.scale;
        const dihedralTan = Math.tan(dihedralAngle);

        for (let s = 0; s < slices; s++) {
            const alpha = slices === 1 ? 0 : s / (slices - 1);
            const z = -half + alpha * span;

            // Dihedral t değeri sadece startZ'den sonra
            const t = (z <= startZ) ? 0 : (denom <= 0 ? 1 : Math.max(0, Math.min(1, (z - startZ) / denom)));
            const localScale = 1 + (thicknessFactor - 1) * t;
            const shift = t * maxShiftAbs;

            // Dihedral offset sadece t > 0 iken
            const dihedralOffset = t * dihedralTan * (z - startZ);

            for (let j = 0; j < N; j++) {
                const p = shape2D[j];
                const x = p.x * params.scale * localScale + shift;
                const y = p.y * params.scale * localScale + dihedralOffset;
                positions[pi++] = x;
                positions[pi++] = y;
                positions[pi++] = z;
            }
        }

        // root center
        positions[pi++] = 0; positions[pi++] = 0; positions[pi++] = -half;
        const rootCenterIndex = slices * N;

        // tip center
        positions[pi++] = maxShiftAbs; positions[pi++] = dihedralTan * (half - startZ); positions[pi++] = half;
        const tipCenterIndex = slices * N + 1;

        const indices = [];
        for (let s = 0; s < slices - 1; s++) {
            const base = s * N;
            const next = (s + 1) * N;
            for (let j = 0; j < N; j++) {
                const j2 = (j + 1) % N;
                indices.push(base + j, next + j, next + j2);
                indices.push(base + j, next + j2, base + j2);
            }
        }

        // root cap
        for (let j = 0; j < N; j++) {
            const j2 = (j + 1) % N;
            indices.push(rootCenterIndex, j2, j);
        }

        // tip cap
        const baseTip = (slices - 1) * N;
        for (let j = 0; j < N; j++) {
            const j2 = (j + 1) % N;
            indices.push(tipCenterIndex, baseTip + j, baseTip + j2);
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
    }

    // --- Apply morph to current foil ---
    function applySpanMorph(startPercent = 0.5, thicknessFactor = 1.0, slices = 40, shiftAmount = 0, dihedralAngle = 0) {
        if (!currentFoil) return;
        const mesh = currentFoil.children.find(c => c.isMesh);
        const line = currentFoil.children.find(c => c.isLineSegments);

        if (mesh && mesh.geometry) mesh.geometry.dispose();
        if (line && line.geometry) line.geometry.dispose();

        const geom = createSpanMorphGeometry(startPercent, thicknessFactor, Math.max(2, Math.floor(slices)), shiftAmount, dihedralAngle);
        if (mesh) mesh.geometry = geom;
        if (line) line.geometry = new THREE.EdgesGeometry(geom);
    }

    // --- Update foil reference ---
    function setFoilMesh(newFoil) {
        currentFoil = newFoil;
        // Re-apply the current UI values to the newly attached foil so the
        // existing morph (dihedral, thickness, shift, start) is preserved
        // after a rebuild or NACA update. Read inputs and call applySpanMorph.
        try {
            const start = Math.max(0, Math.min(100, parseFloat(startInput.value) || 50)) / 100;
            const factor = Math.max(0.01, parseFloat(factorInput.value) || 1.0);
            const slices = Math.max(2, parseInt(slicesInput.value, 10) || 40);
            const shift = parseFloat(shiftInput.value) || 0;
            const dihedral = (parseFloat(dihedralInput.value) || 0) * Math.PI / 180;
            applySpanMorph(start, factor, slices, shift, dihedral);
        } catch (e) {
            // if inputs aren't yet available or something else fails, swallow
            // the error — the caller will still have a valid foil attached.
            // This guard keeps behavior stable during initialization order quirks.
            // console.warn('setFoilMesh: could not reapply UI values', e);
        }
    }

    // --- UI ---
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'absolute', top: '10px', right: '10px',
        padding: '8px', background: 'rgba(10,10,10,0.85)',
        color: '#fff', fontFamily: 'sans-serif', fontSize: '13px',
        borderRadius: '6px', zIndex: 9999, minWidth: '220px'
    });

    function row(labelText, input) {
        const r = document.createElement('div');
        r.style.marginBottom = '6px';
        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.marginBottom = '4px';
        r.appendChild(label);
        r.appendChild(input);
        return r;
    }

    const startInput = document.createElement('input');
    startInput.type = 'number'; startInput.min = 0; startInput.max = 100; startInput.step = 1; startInput.value = 50; startInput.style.width = '100%';

    const factorInput = document.createElement('input');
    factorInput.type = 'number'; factorInput.min = 0.1; factorInput.max = 3; factorInput.step = 0.01; factorInput.value = 1.0; factorInput.style.width = '100%';

    const slicesInput = document.createElement('input');
    slicesInput.type = 'number'; slicesInput.min = 2; slicesInput.max = 200; slicesInput.step = 1; slicesInput.value = 40; slicesInput.style.width = '100%';

    const shiftInput = document.createElement('input');
    shiftInput.type = 'number'; shiftInput.min = -5; shiftInput.max = 5; shiftInput.step = 0.01; shiftInput.value = 0.0; shiftInput.style.width = '100%';

    const dihedralInput = document.createElement('input');
    dihedralInput.type = 'number'; dihedralInput.min = -45; dihedralInput.max = 45; dihedralInput.step = 0.1; dihedralInput.value = 0; dihedralInput.style.width = '100%';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Span Morph Uygula'; applyBtn.style.width = '100%'; applyBtn.style.padding = '6px'; applyBtn.style.cursor = 'pointer';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Sıfırla (varsayılan)'; resetBtn.style.width = '100%'; resetBtn.style.padding = '6px'; resetBtn.style.marginTop = '6px'; resetBtn.style.cursor = 'pointer';

    panel.appendChild(row('Başlangıç (%) (0=root,100=tip)', startInput));
    panel.appendChild(row('Kalınlık Faktörü (1 = orijinal)', factorInput));
    panel.appendChild(row('Dilimler (sweep slices)', slicesInput));
    panel.appendChild(row('Kaydırma (X, chord birimlerinde)', shiftInput));
    panel.appendChild(row('Dihedral Açısı (°)', dihedralInput));
    panel.appendChild(applyBtn);
    panel.appendChild(resetBtn);

    // document.body.appendChild(panel);

    applyBtn.addEventListener('click', () => {
        const start = Math.max(0, Math.min(100, parseFloat(startInput.value) || 50)) / 100;
        const factor = Math.max(0.01, parseFloat(factorInput.value) || 1.0);
        const slices = Math.max(2, parseInt(slicesInput.value, 10) || 40);
        const shift = parseFloat(shiftInput.value) || 0;
        const dihedral = (parseFloat(dihedralInput.value) || 0) * Math.PI / 180;
        applySpanMorph(start, factor, slices, shift, dihedral);
    });

    resetBtn.addEventListener('click', () => {
        startInput.value = 50; factorInput.value = 1.0; slicesInput.value = 40; shiftInput.value = 0.0; dihedralInput.value = 0;
        applyBtn.click();
    });

    let debounce = null;
    [startInput, factorInput, slicesInput, shiftInput, dihedralInput].forEach(inp => {
        inp.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => applyBtn.click(), 200);
        });
    });

    applyBtn.click();

    return { applySpanMorph, setFoilMesh };
}
