import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, duration = 10, fps = 60) {

    // --- Mirror the right wing ---
    const rightWing = foil.clone();
    rightWing.scale.z = -1; // Mirror along span axis
    rightWing.position.z = -foil.position.z - 10; // offset to the other side
    scene.add(rightWing);

    // --- Helper functions ---
    function parseNaca(n) {
        const s = String(n).padStart(4, '0');
        return { M: parseInt(s[0]), P: parseInt(s[1]), TT: parseInt(s.slice(2, 4)) };
    }

    function formatNaca({ M, P, TT }) {
        return `${M}${P}${String(Math.max(0, Math.min(99, Math.round(TT)))).padStart(2, '0')}`;
    }

    function randomRange(min, max) { return min + Math.random() * (max - min); }
    function randomInt(min, max) { return Math.floor(randomRange(min, max + 1)); }
    function pickRandomNacaNums() {
        return { M: randomInt(0, 8), P: randomInt(0, 9), TT: randomInt(1, 66) };
    }

    // --- HUD overlay ---
    const infoDiv = document.createElement('div');
    Object.assign(infoDiv.style, {
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '300px',
        color: 'lime',
        fontFamily: 'monospace',
        fontSize: '14px',
        background: 'rgba(0,0,0,0.6)',
        padding: '15px',
        border: '2px solid lime',
        borderRadius: '12px',
        zIndex: 9999,
        pointerEvents: 'none',
        boxShadow: '0 0 20px lime, 0 0 40px lime'
    });
    document.body.appendChild(infoDiv);

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
            <div style="margin-bottom:10px;"><strong>Symmetric Wings NACA:</strong> ${formatNaca(animationParams.currentNacaNums)}</div>
            ${createBar('Cranked Wing', animationParams.startPercent, 1)}
            ${createBar('Taper Ratio', animationParams.thicknessFactor, 1)}
            ${createBar('Cranked amount', animationParams.shiftAmount, 2, 'cyan')}
            ${createBar('Dihedral °', animationParams.dihedralAngle * 180 / Math.PI, 90, 'magenta')}
        `;
    }

    // --- Controllers for both wings ---
    const leftController = addSpanMorphUI({ naca: '2412', chord: 1.5, points: 300, depth: 3, scale: 3.0 }, foil, naca4Coordinates);
    const rightController = addSpanMorphUI({ naca: '2412', chord: 1.5, points: 300, depth: 3, scale: 3.0 }, rightWing, naca4Coordinates);

    // --- Shared animation parameters for symmetry ---
    const animationParams = {
        startPercent: 0.5,
        thicknessFactor: 1.0,
        shiftAmount: 0.0,
        dihedralAngle: 0.0,
    currentNacaNums: parseNaca('2412'),
    targetNacaNums: parseNaca('2412'),
    lastAppliedNaca: '2412',
    };

    // --- MediaRecorder setup ---
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

    // --- Animation loop ---
    const framesPerTarget = 120;
    let frameCounter = 0;

    function animate() {
        requestAnimationFrame(animate);

        // pick new random targets periodically
        if (frameCounter % framesPerTarget === 0) {
            animationParams.targetStart = randomRange(0.01, 1);
            animationParams.targetThickness = randomRange(0.1, 1);
            animationParams.targetShift = randomRange(0, 1.8);
            animationParams.targetDihedral = randomRange(-45, 65) * Math.PI / 180;
            animationParams.targetNacaNums = pickRandomNacaNums();
        }

        const smoothFactor = 0.02;

        // smooth interpolation
        animationParams.startPercent += (animationParams.targetStart - animationParams.startPercent) * smoothFactor;
        animationParams.thicknessFactor += (animationParams.targetThickness - animationParams.thicknessFactor) * smoothFactor;
        animationParams.shiftAmount += (animationParams.targetShift - animationParams.shiftAmount) * smoothFactor;
        animationParams.dihedralAngle += (animationParams.targetDihedral - animationParams.dihedralAngle) * smoothFactor;

        animationParams.currentNacaNums.M += (animationParams.targetNacaNums.M - animationParams.currentNacaNums.M) * smoothFactor;
        animationParams.currentNacaNums.P += (animationParams.targetNacaNums.P - animationParams.currentNacaNums.P) * smoothFactor;
        animationParams.currentNacaNums.TT += (animationParams.targetNacaNums.TT - animationParams.currentNacaNums.TT) * smoothFactor;

        // Apply NACA if changed
        const newNacaStr = formatNaca(animationParams.currentNacaNums);
        if (newNacaStr !== animationParams.lastAppliedNaca) {
            if (typeof leftController.setNaca === 'function') leftController.setNaca(newNacaStr);
            if (typeof rightController.setNaca === 'function') rightController.setNaca(newNacaStr);
            animationParams.lastAppliedNaca = newNacaStr;
        }

        // Apply symmetric morph to both wings
        leftController.applySpanMorph(
            animationParams.startPercent,
            animationParams.thicknessFactor,
            40,
            animationParams.shiftAmount,
            animationParams.dihedralAngle
        );

        rightController.applySpanMorph(
            animationParams.startPercent,
            animationParams.thicknessFactor,
            40,
            animationParams.shiftAmount,
            animationParams.dihedralAngle
        );

        // Render and update HUD
        renderer.render(scene, camera);
        updateInfoDisplay();

        frameCounter++;
        if (frameCounter > duration * fps) recorder.stop();
    }

    animate();
}
