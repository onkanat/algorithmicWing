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
