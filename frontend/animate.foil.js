// animateFoil.js
import * as THREE from 'three';
import { addSpanMorphUI } from './utils.js';
import { naca4Coordinates, naca5Coordinates } from './nacaprofile.js';

export function animateFoil(scene, foil, renderer, camera, controls, duration = 30, fps = 60) {
    // OrbitControls'u devre dışı bırak (kamera animasyonu sırasında)
    controls.enabled = false;

    // read initial parameters from URL so cinematic mode mirrors normal mode state
    // Use the project's standard default NACA code (keep consistent with normal mode)
    let initParams = { naca: '2412', chord: 1.0, points: 200, depth: 3, scale: 3.0 };
    try {
        const p = new URLSearchParams(window.location.search);
        const n = p.get('naca'); if (n) initParams.naca = String(n).replace(/\D/g, '');
        const chord = parseFloat(p.get('chord')); if (!Number.isNaN(chord)) initParams.chord = chord;
        const points = parseInt(p.get('points'), 10); if (!Number.isNaN(points)) initParams.points = points;
        const depth = parseFloat(p.get('depth')); if (!Number.isNaN(depth)) initParams.depth = depth;
        const scale = parseFloat(p.get('scale')); if (!Number.isNaN(scale)) initParams.scale = scale;
    } catch (e) { }

    // read span morph params from URL
    let initSpan = {};
    try {
        const p = new URLSearchParams(window.location.search);
        const s = parseFloat(p.get('start')); if (!Number.isNaN(s)) initSpan.startPercent = Math.max(0, Math.min(1, s));
        const f = parseFloat(p.get('factor')); if (!Number.isNaN(f)) initSpan.thicknessFactor = f;
        const slices = parseInt(p.get('slices'), 10); if (!Number.isNaN(slices)) initSpan.slices = slices;
        const shift = parseFloat(p.get('shift')); if (!Number.isNaN(shift)) initSpan.shiftAmount = shift;
        const dihedral = parseFloat(p.get('dihedral')); if (!Number.isNaN(dihedral)) initSpan.dihedralAngle = dihedral * Math.PI / 180;
    } catch (e) { }

    // controller ile span morph ve dihedral kontrolü (no panel)
    let controller = addSpanMorphUI(initParams, foil, naca4Coordinates, Object.assign({ appendPanel: false }, initSpan));

    // --- Mirror the right wing ---
    const rightWing = foil.clone();
    rightWing.scale.z = -1; // Mirror along span axis
    rightWing.position.z = -foil.position.z - 10; // offset to the other side
    scene.add(rightWing);

    // Create a second controller for the right wing so it can be morphed independently
    let rightController = addSpanMorphUI(initParams, rightWing, naca4Coordinates, Object.assign({ appendPanel: false }, initSpan));

    // ✨ CHARMING EFFECT 1: Dynamic Directional Light (Kamera ile hareket eden ışık)
    const dynamicLight = new THREE.DirectionalLight(0xffd4a3, 2);
    scene.add(dynamicLight);

    // ✨ CHARMING EFFECT 2: Rim Light (Kenar ışığı)
    const rimLight = new THREE.DirectionalLight(0x4488ff, 1.5);
    scene.add(rimLight);

    // Kullanıcı kontrollü parametreler (UI'dan değişecek) — initialize from URL-derived values
    let startPercent = (typeof initSpan.startPercent === 'number') ? initSpan.startPercent : 0.5;
    let thicknessFactor = (typeof initSpan.thicknessFactor === 'number') ? initSpan.thicknessFactor : 1.0;
    let shiftAmount = (typeof initSpan.shiftAmount === 'number') ? initSpan.shiftAmount : 0.0;
    let dihedralAngle = (typeof initSpan.dihedralAngle === 'number') ? initSpan.dihedralAngle : 0.0;
    let nacaCode = initParams.naca || '2412';

    let frameCounter = 0;

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

    // 🎮 UI KONTROL PANELİ - Kullanıcı Parametreleri
    const controlPanel = document.createElement('div');
    Object.assign(controlPanel.style, {
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '280px',
        background: 'rgba(20,30,40,0.95)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '13px',
        padding: '20px',
        borderRadius: '12px',
        border: '2px solid #00ff00',
        zIndex: '10000',
        boxShadow: '0 0 20px rgba(0,255,0,0.3)'
    });

    function createSlider(label, min, max, step, defaultValue, unit = '') {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';

        const labelDiv = document.createElement('div');
        labelDiv.style.marginBottom = '5px';
        labelDiv.style.color = '#00ff00';
        labelDiv.innerHTML = `<strong>${label}</strong>`;

        const valueDisplay = document.createElement('span');
        valueDisplay.style.float = 'right';
        valueDisplay.style.color = '#0ff';
        valueDisplay.textContent = defaultValue.toFixed(2) + unit;
        labelDiv.appendChild(valueDisplay);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultValue;
        slider.style.width = '100%';
        slider.style.cursor = 'pointer';

        container.appendChild(labelDiv);
        container.appendChild(slider);

        return { container, slider, valueDisplay, unit };
    }

    function createTextInput(label, defaultValue, maxLen = 4) {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';

        const labelDiv = document.createElement('div');
        labelDiv.style.marginBottom = '5px';
        labelDiv.style.color = '#00ff00';
        labelDiv.innerHTML = `<strong>${label}</strong>`;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.maxLength = maxLen;
        Object.assign(input.style, {
            width: '100%',
            padding: '8px',
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid #0ff',
            borderRadius: '4px',
            color: '#0ff',
            fontFamily: 'monospace',
            fontSize: '14px',
            textAlign: 'center'
        });

        container.appendChild(labelDiv);
        container.appendChild(input);

        return { container, input };
    }

    // NACA Input
    // make this input accept 4 or 5 digits (user will type 4-digit normally,
    // but we allow 5-digit entries for cinematic override)
    const nacaInput = createTextInput('NACA Airfoil (4 or 5 digits)', nacaCode, 5);
    // only allow digits while typing
    nacaInput.input.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 5); });
    controlPanel.appendChild(nacaInput.container);

    // Cranked Wing Slider
    const crankedSlider = createSlider('Cranked Wing', 0, 1, 0.01, startPercent);
    controlPanel.appendChild(crankedSlider.container);

    // Taper Ratio Slider
    const taperSlider = createSlider('Taper Ratio', 0.1, 1, 0.01, thicknessFactor);
    controlPanel.appendChild(taperSlider.container);

    // Cranked Amount Slider
    const shiftSlider = createSlider('Cranked Amount', 0, 2, 0.01, shiftAmount);
    controlPanel.appendChild(shiftSlider.container);

    // Dihedral Angle Slider
    const dihedralSlider = createSlider('Dihedral Angle', -45, 65, 1, dihedralAngle * 180 / Math.PI, '°');
    controlPanel.appendChild(dihedralSlider.container);

    document.body.appendChild(controlPanel);

    // NACA değişimi için rebuild fonksiyonu

    function rebuildWithNewNACA(newNaca) {
        const raw = String(newNaca).replace(/\D/g, '');
        let coordsFunc = naca4Coordinates;
        let nacaStr = '2412';
        if (raw.length === 5) {
            nacaStr = raw;
            coordsFunc = naca5Coordinates;
        } else if (raw.length === 4) {
            nacaStr = raw.padStart(4, '0');
            coordsFunc = naca4Coordinates;
        } else {
            // fallback keep previous
            nacaStr = controller ? (controller.naca || '2412') : '2412';
        }

        // Sol kanat için yeni controller (panel eklenmesin)
        controller = addSpanMorphUI({ naca: nacaStr, chord: initParams.chord, points: initParams.points, depth: initParams.depth, scale: initParams.scale }, foil, coordsFunc, { appendPanel: false });

        // Sağ kanat için yeni controller (panel eklenmesin)
        rightController = addSpanMorphUI({ naca: nacaStr, chord: initParams.chord, points: initParams.points, depth: initParams.depth, scale: initParams.scale }, rightWing, coordsFunc, { appendPanel: false });

        // Mevcut morph parametrelerini uygula
        // update local naca code and reapply morphs
        nacaCode = nacaStr;
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);

        // update URL so the new NACA is visible to normal mode when toggling back
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('naca', nacaStr);
            // preserve mode (cinematic)
            ps.set('mode', 'cinematic');
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) { }
    }

    // Event listeners for UI controls
    nacaInput.input.addEventListener('input', (e) => {
        nacaCode = e.target.value;
    });

    // NACA input için Enter veya blur eventi
    nacaInput.input.addEventListener('blur', (e) => {
        rebuildWithNewNACA(e.target.value);
    });

    nacaInput.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            rebuildWithNewNACA(e.target.value);
            e.target.blur(); // Focus'u kaldır
        }
    });

    crankedSlider.slider.addEventListener('input', (e) => {
        startPercent = parseFloat(e.target.value);
        crankedSlider.valueDisplay.textContent = startPercent.toFixed(2);
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        // persist span morph values to URL so normal mode picks them up
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('start', String(startPercent));
            ps.set('mode', 'cinematic');
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) { }
    });

    taperSlider.slider.addEventListener('input', (e) => {
        thicknessFactor = parseFloat(e.target.value);
        taperSlider.valueDisplay.textContent = thicknessFactor.toFixed(2);
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('factor', String(thicknessFactor));
            ps.set('mode', 'cinematic');
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) { }
    });

    shiftSlider.slider.addEventListener('input', (e) => {
        shiftAmount = parseFloat(e.target.value);
        shiftSlider.valueDisplay.textContent = shiftAmount.toFixed(2);
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('shift', String(shiftAmount));
            ps.set('mode', 'cinematic');
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) { }
    });

    dihedralSlider.slider.addEventListener('input', (e) => {
        const degrees = parseFloat(e.target.value);
        dihedralAngle = degrees * Math.PI / 180;
        dihedralSlider.valueDisplay.textContent = degrees.toFixed(0) + '°';
        controller.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        rightController.applySpanMorph(startPercent, thicknessFactor, 40, shiftAmount, dihedralAngle);
        try {
            const ps = new URLSearchParams(window.location.search);
            ps.set('dihedral', String(degrees));
            ps.set('mode', 'cinematic');
            history.replaceState(null, '', '?' + ps.toString());
        } catch (e) { }
    });

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
        <div style="margin-bottom:10px;"><strong>🎥 Cinematic Mode</strong></div>
        <div style="margin-bottom:8px;"><strong>NACA:</strong> <span style="color:#0ff;">${nacaCode}</span></div>
        <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">
            📹 Distance: ${cameraDistance}m
        </div>
        <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">
            � Angle: ${cameraAngle}° | ↕ ${cameraHeight}m
        </div>
        <div style="font-size:11px;opacity:0.8;margin-bottom:8px;">
            🎬 Roll: ${rollAngle}° | ⏱️ ${(frameCounter / fps).toFixed(1)}s
        </div>
        <div style="margin-top:8px;background:rgba(0,255,0,0.1);border-radius:4px;overflow:hidden;">
            <div style="width:${progressPercent}%;height:4px;background:${hudColor};transition:width 0.1s;box-shadow:0 0 10px ${hudColor};"></div>
        </div>
    `;
    }

    function animate() {
        requestAnimationFrame(animate);

        // Calculate animation progress (0 to 1)
        const progress = Math.min(1, frameCounter / totalFrames);

        // Update cinematic camera movement
        updateCinematicCamera(progress);

        // Parametreler UI'dan kontrol ediliyor (slider event listeners ile)
        // Her frame'de sadece render yapıyoruz

        renderer.render(scene, camera);

        updateInfoDisplay();

        frameCounter++;

        // Animasyon bittiğinde OrbitControls'u geri aç
        if (frameCounter >= totalFrames) {
            controls.enabled = true;
            console.log('🎬 Animasyon tamamlandı! OrbitControls aktif.');
        }
    }

    animate();
}
