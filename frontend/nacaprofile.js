import * as THREE from 'three';

function parseNACA(code) {
    const s = String(code).padStart(4, '0');
    const m = parseInt(s[0], 10) / 100.0;     // max camber
    const p = parseInt(s[1], 10) / 10.0;      // location of max camber
    const t = parseInt(s.slice(2, 4), 10) / 100.0; // thickness
    return { m, p, t };
}

export function naca4Coordinates(code, chord = 1, n = 200) {
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

// Approximate NACA 5-digit support (initial implementation).
// NOTE: This is an initial, compatible generator that maps a 5-digit code
// into a camber/thickness set and reuses the 4-digit camber logic. It is
// intentionally conservative so we can test UI and wiring first. If you
// want the full airfoiltools-accurate 5-digit equations, I will replace
// this implementation with the standard K1/K2-based formulation next.
export function naca5Coordinates(code, chord = 1, n = 200) {
    const s = String(code).replace(/\D/g, '').padStart(5, '0');
    const L = parseInt(s[0], 10); // lift coefficient code (L -> Cl = L * 3/20)
    const P = parseInt(s[1], 10); // position code (P -> p = P/20)
    const Q = parseInt(s[2], 10); // reflex flag (0 = normal, 1 = reflex)
    const t = parseInt(s.slice(3, 5), 10) / 100.0; // thickness

    // design lift coefficient and linear scaling from base CL=0.3 used in tables
    const Cl = (L * 3.0) / 20.0; // e.g. L=2 -> Cl=0.3
    const scale = Cl / 0.3; // multiply k1/k2 by this scale

    // position of maximum camber (p) and table key
    const p = P / 20.0; // e.g. P=3 -> p=0.15
    const key = String(P * 5); // 3 -> '15'

    // Tables from AirfoilTools / NACA documentation
    const standard = {
        '5': { r: 0.10, k1: 0.0580 },
        '10': { r: 0.20, k1: 0.1260 },
        '15': { r: 0.30, k1: 0.2025 },
        '20': { r: 0.40, k1: 0.2900 },
        '25': { r: 0.50, k1: 0.3910 }
    };
    const reflex = {
        '10': { r: 0.20, k1: 0.1300, k2k1: 0.000764 },
        '15': { r: 0.30, k1: 0.2170, k2k1: 0.00677 },
        '20': { r: 0.40, k1: 0.3180, k2k1: 0.0303 },
        '25': { r: 0.50, k1: 0.4410, k2k1: 0.1355 }
    };

    // choose table entry
    let entry;
    let isReflex = (Q === 1);
    if (isReflex) entry = reflex[key] || reflex['15'];
    else entry = standard[key] || standard['15'];

    const r = entry.r;
    const k1 = (entry.k1 || 0) * Math.max(0, scale);
    const k2 = (isReflex && entry.k2k1) ? (k1 * entry.k2k1) : 0;

    // camber line and slope functions for NACA 5-digit
    function yc_and_dyc(x) {
        // x is fraction of chord [0..1]
        if (x < r) {
            // polynomial region
            const yc = (k1 / 6) * (Math.pow(x, 3) - 3 * r * Math.pow(x, 2) + Math.pow(r, 2) * (3 - r) * x) + (k2 ? (k2 / 6) * Math.pow(1 - x, 3) : 0);
            const dyc = (k1 / 6) * (3 * Math.pow(x, 2) - 6 * r * x + Math.pow(r, 2) * (3 - r)) - (k2 ? (k2 / 2) * Math.pow(1 - x, 2) : 0);
            return { yc, dyc };
        } else {
            // linear + possible reflex term
            const yc = (k1 / 6) * Math.pow(r, 3) * (1 - x) + (k2 ? (k2 / 6) * Math.pow(1 - x, 3) : 0);
            const dyc = -(k1 / 6) * Math.pow(r, 3) - (k2 ? (k2 / 2) * Math.pow(1 - x, 2) : 0);
            return { yc, dyc };
        }
    }

    const ptsUpper = [];
    const ptsLower = [];

    // cosine spacing for better leading-edge resolution
    for (let i = 0; i <= n; i++) {
        const beta = (i / n) * Math.PI;
        const x = (1 - Math.cos(beta)) / 2 * chord; // 0..chord
        const xf = x / chord;

        // thickness distribution (same as 4-digit standard)
        const yt = (t * chord / 0.2) * (0.2969 * Math.sqrt(xf) - 0.1260 * xf - 0.3516 * Math.pow(xf, 2) + 0.2843 * Math.pow(xf, 3) - 0.1015 * Math.pow(xf, 4));

        const { yc, dyc } = yc_and_dyc(xf);
        const theta = Math.atan(dyc);

        const xu = x - yt * Math.sin(theta);
        const yu = yc * chord + yt * Math.cos(theta);

        const xl = x + yt * Math.sin(theta);
        const yl = yc * chord - yt * Math.cos(theta);

        ptsUpper.push(new THREE.Vector2(xu, yu));
        ptsLower.push(new THREE.Vector2(xl, yl));
    }

    const coords = [];
    for (let i = 0; i < ptsUpper.length; i++) coords.push(ptsUpper[i]);
    for (let i = ptsLower.length - 1; i >= 0; i--) coords.push(ptsLower[i]);

    const shifted = coords.map(p => new THREE.Vector2(p.x - chord / 2, p.y));
    return shifted;
}
