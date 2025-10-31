// animateFoil.js
import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, duration = 10, fps = 60) {
    // controller ile span morph ve dihedral kontrolü
    let controller = addSpanMorphUI({
        naca: '4430', chord: 1.0, points: 200, depth: 3, scale: 3.0
    }, foil, naca4Coordinates);

    // --- Mirror the right wing ---
    const rightWing = foil.clone();
    rightWing.scale.z = -1; // Mirror along span axis
    rightWing.position.z = -foil.position.z - 10; // offset to the other side
    scene.add(rightWing);

    // initial values (morph)
    let startPercent = 0.5;
    let thicknessFactor = 1.0;
    let shiftAmount = 0.0;
    let dihedralAngle = 0.0;

    // ----- NACA numeric representation (M P TT) -----
    function parseNaca(n) {
        const s = String(n).padStart(4, '0');
        return {
            M: parseInt(s[0], 10),
            P: parseInt(s[1], 10),
            TT: parseInt(s.slice(2, 4), 10)
        };
    }
    function formatNaca({ M, P, TT }) {
        const tt = String(Math.max(0, Math.min(99, Math.round(TT)))).padStart(2, '0');
        return `${Math.round(M)}${Math.round(P)}${tt}`;
    }

    let currentNacaNums = parseNaca('4430');
    let targetNacaNums = { ...currentNacaNums };
    let lastAppliedNaca = formatNaca(currentNacaNums);

    // animation targets for morph (smooth random)
    let targetStart = startPercent;
    let targetThickness = thicknessFactor;
    let targetShift = shiftAmount;
    let targetDihedral = dihedralAngle;

    const framesPerTarget = 120;
    let frameCounter = 0;

    function randomRange(min, max) { return min + Math.random() * (max - min); }
    function randomInt(min, max) { return Math.floor(randomRange(min, max + 1)); }

    function pickRandomNacaNums() {
        return {
            M: randomInt(0, 8),
            P: randomInt(0, 9),
            TT: randomInt(1, 66)
        };
    }
    // --- HUD Overlay ---
    const infoDiv = document.createElement('div');
    infoDiv.style.position = 'absolute';
    infoDiv.style.top = '20px';
    infoDiv.style.left = '20px';
    infoDiv.style.width = '250px';
    infoDiv.style.color = 'lime';
    infoDiv.style.fontFamily = 'monospace';
    infoDiv.style.fontSize = '14px';
    infoDiv.style.background = 'rgba(0,0,0,0.6)';
    infoDiv.style.padding = '15px';
    infoDiv.style.border = '2px solid lime';
    infoDiv.style.borderRadius = '12px';
    infoDiv.style.zIndex = '9999';
    infoDiv.style.pointerEvents = 'none';
    infoDiv.style.boxShadow = '0 0 20px lime, 0 0 40px lime';
    document.body.appendChild(infoDiv);

    // helper function to create animated bars
    function createBar(label, value, max = 1, color = 'lime') {
        const percent = Math.min(100, Math.max(0, value / max * 100));
        return `
        <div style="margin-bottom:6px;">
            <span>${label}</span>
            <div style="
                background: rgba(0,0,0,0.3); 
                width: 100%; 
                height: 8px; 
                border-radius:4px; 
                overflow:hidden;
                margin-top:2px;">
                <div style="
                    width: ${percent}%;
                    height: 100%;
                    background: ${color};
                    transition: width 0.1s ease;
                    box-shadow: 0 0 8px ${color};
                "></div>
            </div>
        </div>
    `;
    }

    function updateInfoDisplay() {
        infoDiv.innerHTML = `
        <div style="margin-bottom:10px;"><strong>NACA:</strong> ${formatNaca(currentNacaNums)}</div>
        ${createBar('Cranked Wing', startPercent, 1)}
        ${createBar('Taper Ratio', thicknessFactor, 1)}
        ${createBar('Cranked amount', shiftAmount, 2, 'cyan')}
        ${createBar('Dihedral °', dihedralAngle * 180 / Math.PI, 90, 'magenta')}
    `;
    }

    // MediaRecorder setup
    const canvasStream = renderer.domElement.captureStream(fps);
    const recorder = new MediaRecorder(canvasStream);
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'foilAnimation.webm';
        a.click();
    };
    recorder.start();

    function applyNacaIfChanged() {
        const newNacaStr = formatNaca(currentNacaNums);
        if (newNacaStr === lastAppliedNaca) return;

        if (typeof controller.setNaca === 'function') {
            controller.setNaca(newNacaStr);
        } else {
            try {
                controller = addSpanMorphUI({
                    naca: newNacaStr, chord: 1.7, points: 200, depth: 3, scale: 3.0
                }, foil, naca4Coordinates);
            } catch (err) {
                console.warn('NACA update failed:', err);
            }
        }
        lastAppliedNaca = newNacaStr;
    }

    function animate() {
        requestAnimationFrame(animate);

        if (frameCounter % framesPerTarget === 0) {
            targetStart = randomRange(0.01, 1);
            targetThickness = randomRange(0.1, 1);
            targetShift = randomRange(0, 1.8);
            targetDihedral = randomRange(-45, 65) * Math.PI / 180;

            targetNacaNums = pickRandomNacaNums();
        }

        const smoothFactor = 0.02;
        startPercent += (targetStart - startPercent) * smoothFactor;
        thicknessFactor += (targetThickness - thicknessFactor) * smoothFactor;
        shiftAmount += (targetShift - shiftAmount) * smoothFactor;
        dihedralAngle += (targetDihedral - dihedralAngle) * smoothFactor;

        currentNacaNums.M += (targetNacaNums.M - currentNacaNums.M) * smoothFactor;
        currentNacaNums.P += (targetNacaNums.P - currentNacaNums.P) * smoothFactor;
        currentNacaNums.TT += (targetNacaNums.TT - currentNacaNums.TT) * smoothFactor;

        applyNacaIfChanged();
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);

        renderer.render(scene, camera);

        updateInfoDisplay();

        frameCounter++;
        if (frameCounter > duration * fps) {
            recorder.stop();
        }
    }

    animate();
}
