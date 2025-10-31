// animateFoil.js
import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, duration = 30, fps = 60) {
    // controller ile span morph ve dihedral kontrolü
    let controller = addSpanMorphUI({
        naca: '4430', chord: 1.0, points: 200, depth: 3, scale: 3.0
    }, foil, naca4Coordinates);

    // --- Mirror the right wing ---
    const rightWing = foil.clone();
    rightWing.scale.z = -1; // Mirror along span axis
    rightWing.position.z = -foil.position.z - 10; // offset to the other side
    scene.add(rightWing);

    // Create a second controller for the right wing so it can be morphed independently
    let rightController = addSpanMorphUI({
        naca: '4430', chord: 1.0, points: 200, depth: 3, scale: 3.0
    }, rightWing, naca4Coordinates);

    // ✨ CHARMING EFFECT 1: Dynamic Directional Light (Kamera ile hareket eden ışık)
    const dynamicLight = new THREE.DirectionalLight(0xffd4a3, 2);
    scene.add(dynamicLight);

    // ✨ CHARMING EFFECT 2: Rim Light (Kenar ışığı)
    const rimLight = new THREE.DirectionalLight(0x4488ff, 1.5);
    scene.add(rimLight);

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

    // --- Cinematic Camera Animation ---
    const totalFrames = duration * fps;
    const cameraTarget = new THREE.Vector3(0, 0, 0); // Wing merkezine bak

    // Initial camera settings (save original position)
    const initialCameraPos = camera.position.clone();
    const initialFOV = camera.fov; // Save original FOV

    function updateCinematicCamera(progress) {
        // ✨ CHARMING EFFECT: Ease-in/ease-out (smooth başlangıç ve bitiş)
        // https://easings.net/#easeInOutCubic
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Ana animasyon hala linear progress kullanıyor ama bazı efektler eased kullanacak

        // 30 SANİYELİK YAVAŞ ROTASYON: Daha uzun, daha gelişmiş hareket
        const fastAngle = progress * Math.PI * 2.5;  // 1.25 tam tur (30 saniyede)
        const slowAngle = progress * Math.PI * 1; // Yavaş spiral

        // ARTTIRILMIŞ YÜKSEKLIK: Daha fazla yukarı-aşağı hareket
        const heightWave1 = Math.sin(progress * Math.PI * 2.5) * 10;  // Daha geniş dalga
        const heightWave2 = Math.cos(progress * Math.PI * 4) * 5;  // İkinci dalga artırıldı
        const heightWave3 = Math.sin(progress * Math.PI * 6) * 2.5;  // Üçüncü detay dalgası

        // Dynamic zoom: başta uzak, ortada yakın, sonda tekrar uzak (30 saniyeye yayılmış)
        const zoomCurve = Math.sin(progress * Math.PI); // 0→1→0 curve
        const radius = 30 - zoomCurve * 14; // 30→16→30 (daha geniş aralık)

        // ARTTIRILMIŞ DİNAMİK YÜKSEKLİK: Daha fazla varyasyon
        const baseHeight = 10;
        const height = baseHeight + heightWave1 + heightWave2 + heightWave3;

        // Diagonal orbit with layered motion (30 saniyeye yayılmış)
        const x = Math.cos(fastAngle) * radius + Math.sin(slowAngle) * 5;
        const z = Math.sin(fastAngle) * radius + Math.cos(slowAngle) * 5;
        const y = height;

        // Smooth interpolation to new position (daha smooth için azaltıldı)
        const smoothness = 0.04; // Daha düşük = daha smooth (30 saniye için)
        camera.position.x += (x - camera.position.x) * smoothness;
        camera.position.y += (y - camera.position.y) * smoothness;
        camera.position.z += (z - camera.position.z) * smoothness;

        // ✨ YENİ: Z-Axis Roll (Kamera eğilme hareketi)
        // Kamera Z ekseni etrafında hafifçe döner (tilt/roll efekti)
        const rollAngle = Math.sin(progress * Math.PI * 3) * 0.15; // ±0.15 radyan (~8.5°)
        const tiltAngle = Math.cos(progress * Math.PI * 2.5) * 0.1; // ±0.1 radyan (~5.7°)

        // Kamera rotasyonunu ayarla
        camera.rotation.z = rollAngle; // Roll (yatay eğilme)

        // Up vektörünü ayarla (daha dinamik bakış)
        const upVector = new THREE.Vector3(
            Math.sin(rollAngle) * 0.3,
            1,
            Math.cos(rollAngle) * 0.3
        );
        camera.up.copy(upVector.normalize());

        // Dynamic FOV (Field of View) for dramatic effect (30 saniye için optimize)
        const fovVariation = Math.sin(progress * Math.PI * 0.7) * 15; // ±15 degrees, daha dramatik
        const targetFOV = initialFOV + fovVariation;
        camera.fov += (targetFOV - camera.fov) * 0.025; // Daha yavaş FOV geçişi
        camera.updateProjectionMatrix();

        // Camera target'a daha fazla offset (daha dinamik görünüm)
        const targetOffset = new THREE.Vector3(
            Math.sin(progress * Math.PI * 2) * 4,  // Daha geniş X hareketi
            Math.cos(progress * Math.PI * 2.5) * 3,    // Daha fazla Y hareketi
            Math.sin(progress * Math.PI * 2.2) * 2 // Z ekseni hareketi artırıldı
        );
        const finalTarget = cameraTarget.clone().add(targetOffset);

        // Her zaman wing'e bak (ama daha dinamik hareket eden hedefle)
        camera.lookAt(finalTarget);

        // ✨ CHARMING EFFECT: Dinamik ışıklandırma (kamera ile hareket eder)
        // Ana ışık kameranın arkasından gelir
        dynamicLight.position.copy(camera.position);
        dynamicLight.position.y += 5; // Biraz daha yukarıda

        // Rim light karşı taraftan (kenar ışığı)
        rimLight.position.set(-camera.position.x, camera.position.y + 3, -camera.position.z);

        // ✨ CHARMING EFFECT: Dinamik ışık rengi (gün batımı efekti)
        const timeOfDay = Math.sin(progress * Math.PI); // 0→1→0
        const sunsetColor = new THREE.Color();
        sunsetColor.setHSL(0.08 + timeOfDay * 0.05, 0.8, 0.5 + timeOfDay * 0.2); // Turuncu-sarı geçiş
        dynamicLight.color = sunsetColor;
    }

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

    // ✨ CHARMING EFFECT 4: Cinematic Vignette Overlay
    const vignetteDiv = document.createElement('div');
    vignetteDiv.style.position = 'fixed';
    vignetteDiv.style.top = '0';
    vignetteDiv.style.left = '0';
    vignetteDiv.style.width = '100%';
    vignetteDiv.style.height = '100%';
    vignetteDiv.style.pointerEvents = 'none';
    vignetteDiv.style.background = 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)';
    vignetteDiv.style.zIndex = '999';
    vignetteDiv.style.mixBlendMode = 'multiply';
    document.body.appendChild(vignetteDiv);

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
        const cameraDistance = camera.position.length().toFixed(1);
        const cameraHeight = camera.position.y.toFixed(1);
        const cameraAngle = ((frameCounter / totalFrames) * 450).toFixed(0); // 1.25 tam tur için 450°
        const rollAngle = (camera.rotation.z * 180 / Math.PI).toFixed(1); // Roll açısı derece cinsinden
        const progressPercent = ((frameCounter / totalFrames) * 100).toFixed(0);

        // ✨ CHARMING: HUD rengi animasyon ilerlemesine göre değişiyor
        const hudHue = (frameCounter / totalFrames) * 120; // 0 (kırmızı) → 120 (yeşil)
        const hudColor = `hsl(${hudHue + 120}, 100%, 60%)`; // Lime'dan cyan'a

        infoDiv.innerHTML = `
        <div style="margin-bottom:10px;"><strong>NACA:</strong> ${formatNaca(currentNacaNums)}</div>
        ${createBar('Cranked Wing', startPercent, 1, hudColor)}
        ${createBar('Taper Ratio', thicknessFactor, 1, hudColor)}
        ${createBar('Cranked amount', shiftAmount, 2, 'cyan')}
        ${createBar('Dihedral °', dihedralAngle * 180 / Math.PI, 90, 'magenta')}
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,255,0,0.3);">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">
                📹 Cam: ${cameraDistance}m | ${cameraAngle}° | ↕ ${cameraHeight}m
            </div>
            <div style="font-size:10px;opacity:0.6;">
                🎬 Roll: ${rollAngle}° | ⏱️ ${(frameCounter / fps).toFixed(1)}s / ${duration}s
            </div>
            <div style="margin-top:8px;background:rgba(0,255,0,0.1);border-radius:4px;overflow:hidden;">
                <div style="width:${progressPercent}%;height:4px;background:${hudColor};transition:width 0.1s;box-shadow:0 0 10px ${hudColor};"></div>
            </div>
        </div>
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
            if (typeof rightController.setNaca === 'function') {
                rightController.setNaca(newNacaStr);
            }
        } else {
            try {
                controller = addSpanMorphUI({
                    naca: newNacaStr, chord: 1.7, points: 200, depth: 3, scale: 3.0
                }, foil, naca4Coordinates);
                rightController = addSpanMorphUI({
                    naca: newNacaStr, chord: 1.7, points: 200, depth: 3, scale: 3.0
                }, rightWing, naca4Coordinates);
            } catch (err) {
                console.warn('NACA update failed:', err);
            }
        }
        lastAppliedNaca = newNacaStr;
    }

    function animate() {
        requestAnimationFrame(animate);

        // Calculate animation progress (0 to 1)
        const progress = Math.min(1, frameCounter / totalFrames);

        // Update cinematic camera movement
        updateCinematicCamera(progress);

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
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);

        renderer.render(scene, camera);

        updateInfoDisplay();

        frameCounter++;
        if (frameCounter > duration * fps) {
            recorder.stop();
        }
    }

    animate();
}
