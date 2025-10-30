// animateFoil.js
import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, duration = 10, fps = 60) {
    // controller ile span morph ve dihedral kontrolü
    let controller = addSpanMorphUI({
        naca: '4430', chord: 1.0, points: 200, depth: 3, scale: 3.0
    }, foil, naca4Coordinates);

    // initial values (morph)
    let startPercent = 0.5;
    let thicknessFactor = 1.0;
    let shiftAmount = 0.0;
    let dihedralAngle = 0.0;

    // ----- NACA numeric representation (M P TT) -----
    function parseNaca(n) {
        const s = String(n).padStart(4, '0');
        return {
            M: parseInt(s[0], 10),           // max camber (0-9, % of chord /10)
            P: parseInt(s[1], 10),           // position of max camber (0-9 -> *0.1)
            TT: parseInt(s.slice(2, 4), 10)  // thickness percentage (00-99)
        };
    }
    function formatNaca({ M, P, TT }) {
        const tt = String(Math.max(0, Math.min(99, Math.round(TT)))).padStart(2, '0');
        return `${Math.round(M)}${Math.round(P)}${tt}`;
    }

    // start from initial NACA
    let currentNacaNums = parseNaca('4430');
    let targetNacaNums = { ...currentNacaNums };
    let lastAppliedNaca = formatNaca(currentNacaNums);

    // animation targets for morph (smooth random)
    let targetStart = startPercent;
    let targetThickness = thicknessFactor;
    let targetShift = shiftAmount;
    let targetDihedral = dihedralAngle;

    const framesPerTarget = 30; // yeni hedef her ~30 frame
    let frameCounter = 0;

    function randomRange(min, max) { return min + Math.random() * (max - min); }
    function randomInt(min, max) { return Math.floor(randomRange(min, max + 1)); }

    // seçilecek mantıklı NACA aralıkları
    function pickRandomNacaNums() {
        return {
            M: randomInt(0, 9),           // camber 0-6 (reasonable)
            P: randomInt(0, 9),           // camber pozisyonu 0-9
            TT: randomInt(8, 66)          // kalınlık % 8-18
        };
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

        // İlk tercih: controller.setNaca varsa çağır
        if (typeof controller.setNaca === 'function') {
            controller.setNaca(newNacaStr);
        } else {
            // değilse controller'ı yeniden oluşturmayı dene (varsayım: addSpanMorphUI içsel mesh'i günceller)
            // Eğer addSpanMorphUI foil objesine yeni geometri atıyorsa bu işe yarar.
            try {
                controller = addSpanMorphUI({
                    naca: newNacaStr, chord: 1.0, points: 200, depth: 3, scale: 3.0
                }, foil, naca4Coordinates);
            } catch (err) {
                console.warn('NACA update failed:', err);
            }
        }
        lastAppliedNaca = newNacaStr;
    }

    function animate() {
        requestAnimationFrame(animate);

        // yeni rastgele hedefleri periyodik seç
        if (frameCounter % framesPerTarget === 0) {
            // morph hedefleri
            targetStart = randomRange(0.01, 1);
            targetThickness = randomRange(0.1, 1);
            targetShift = randomRange(0, 1.5);
            targetDihedral = randomRange(-45, 60) * Math.PI / 180; // radians

            // yeni NACA hedefleri (mantıklı aralıkta)
            targetNacaNums = pickRandomNacaNums();
        }

        // smooth interpolation (morph)
        const smoothFactor = 0.02;
        startPercent += (targetStart - startPercent) * smoothFactor;
        thicknessFactor += (targetThickness - thicknessFactor) * smoothFactor;
        shiftAmount += (targetShift - shiftAmount) * smoothFactor;
        dihedralAngle += (targetDihedral - dihedralAngle) * smoothFactor;

        // smooth interpolation for numeric NACA components
        currentNacaNums.M += (targetNacaNums.M - currentNacaNums.M) * smoothFactor;
        currentNacaNums.P += (targetNacaNums.P - currentNacaNums.P) * smoothFactor;
        currentNacaNums.TT += (targetNacaNums.TT - currentNacaNums.TT) * smoothFactor;

        // eğer yuvarlanmış rakamlar değiştiyse NACA stringini uygula
        applyNacaIfChanged();

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
