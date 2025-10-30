// animateFoil.js
import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, duration = 10, fps = 60) {
    // controller ile span morph ve dihedral kontrolü
    const controller = addSpanMorphUI({
        naca: '4430', chord: 1.0, points: 200, depth: 3, scale: 3.0
    }, foil, naca4Coordinates);

    // initial values
    let startPercent = 0.5;
    let thicknessFactor = 1.0;
    let shiftAmount = 0.0;
    let dihedralAngle = 0.0;

    // target values for smooth random animation
    let targetStart = startPercent;
    let targetThickness = thicknessFactor;
    let targetShift = shiftAmount;
    let targetDihedral = dihedralAngle;

    const framesPerTarget = 30; // 3 saniye @ 60fps
    let frameCounter = 0;

    function randomRange(min, max) { return min + Math.random() * (max - min); }

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

    function animate() {
        requestAnimationFrame(animate);

        // choose new targets periodically
        if (frameCounter % framesPerTarget === 0) {
            targetStart = randomRange(0.1, 0.8);
            targetThickness = randomRange(0.1, 1);
            targetShift = randomRange(-1, 1);
            targetDihedral = randomRange(-10, 40) * Math.PI / 180; // radians
        }

        // smooth interpolation
        const smoothFactor = 0.02;
        startPercent += (targetStart - startPercent) * smoothFactor;
        thicknessFactor += (targetThickness - thicknessFactor) * smoothFactor;
        shiftAmount += (targetShift - shiftAmount) * smoothFactor;
        dihedralAngle += (targetDihedral - dihedralAngle) * smoothFactor;

        // apply morph
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);

        // render
        renderer.render(scene, camera);

        frameCounter++;
        if (frameCounter > duration * fps) {
            recorder.stop(); // stop video
        }
    }

    animate();
}
