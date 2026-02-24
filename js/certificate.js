// js/certificate.js
// DSAT-style score report PDF generator — ALFA SAT branded
// Requires: window.jspdf and window.QRCode

async function generateCertificatePDF(data = {}, userName = 'Student Name') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const PW = 595.28;  // page width
    const PH = 841.89;  // page height
    const M = 40;       // margin
    const CW = PW - M * 2; // content width

    // Colors
    const BLK = [17, 17, 17];
    const TXT = [33, 33, 33];
    const G7 = [61, 61, 61];
    const G5 = [122, 122, 122];
    const G3 = [195, 195, 195];
    const G2 = [220, 220, 220];
    const BG = [239, 239, 239];
    const WHT = [255, 255, 255];
    const LNK = [47, 59, 183];

    // Date helper
    let testedOn = 'N/A';
    if (data.completedAt?.toDate) {
        testedOn = data.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
        testedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    const total = Number(data.totalScore ?? 400);
    const rw = Number(data.rwScore ?? 200);
    const math = Number(data.mathScore ?? 200);
    const tName = data.testName ?? 'Practice Test';

    // ──────── PAGE BACKGROUND ────────
    doc.setFillColor(...BG);
    doc.rect(0, 0, PW, PH, 'F');

    // ──────── HEADER: Logo + Student Info ────────
    let y = 36;

    // Logo box
    doc.setFillColor(...WHT);
    doc.setDrawColor(...G3);
    doc.roundedRect(M, y, 78, 32, 4, 4, 'FD');
    try {
        const logoImg = await loadImageAsBase64('assets/logo.png');
        if (logoImg) doc.addImage(logoImg, 'PNG', M + 4, y + 2, 28, 28);
    } catch (e) { }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BLK);
    doc.text('ALFA', M + 36, y + 14);
    doc.text('SAT', M + 36, y + 25);

    // Student info — right column
    const infoX = 310;
    const valX = 420;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...G7);
    doc.text('Name:', infoX, y + 10);
    doc.text('Grade:', infoX, y + 22);
    doc.text('Test:', infoX, y + 34);
    doc.text('Tested on:', infoX, y + 46);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TXT);
    doc.text(userName || 'Student', valX, y + 10);
    doc.text(String(data.grade ?? '12'), valX, y + 22);
    // Truncate long test names
    const shortName = tName.length > 28 ? tName.substring(0, 28) + '…' : tName;
    doc.text(shortName, valX, y + 34);
    doc.text(testedOn, valX, y + 46);

    // "Your Scores" title
    y += 62;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...BLK);
    doc.text('Your Scores', M, y);

    // Thin separator
    y += 8;
    doc.setDrawColor(...G3); doc.setLineWidth(0.7);
    doc.line(M, y, PW - M, y);

    // ──────── MAIN CARD ────────
    y += 12;
    const cardY = y;
    const cardH = 368;
    doc.setFillColor(...BG); doc.setDrawColor(...G3);
    doc.roundedRect(M, cardY, CW, cardH, 8, 8, 'FD');

    // Card title
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...TXT);
    doc.text('SAT Scores', M + 12, cardY + 20);
    doc.setDrawColor(...G3); doc.setLineWidth(0.7);
    doc.line(M, cardY + 28, M + CW, cardY + 28);

    // Left/Right split
    const leftW = 150;
    const splitX = M + leftW;
    doc.setDrawColor(...G3); doc.setLineWidth(0.5);
    doc.line(splitX, cardY + 28, splitX, cardY + cardH);

    // ──── LEFT PANEL: Scores ────
    let lx = M + 10;
    let ly = cardY + 42;

    // TOTAL SCORE
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...G7);
    doc.text('TOTAL SCORE', lx, ly);
    ly += 28;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(36); doc.setTextColor(...BLK);
    doc.text(String(total), lx, ly);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...G5);
    doc.text('400-1600', lx + 64, ly - 6);

    ly += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...G7);
    doc.text(`Score Range: ${sRange(total, 400, 1600, 40)}`, lx, ly);

    // Separator
    ly += 14;
    doc.setDrawColor(...G3); doc.line(lx, ly, splitX - 8, ly);
    ly += 14;

    // SECTION SCORES
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...G7);
    doc.text('SECTION SCORES', lx, ly);
    ly += 14;

    // R&W score
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...TXT);
    doc.text('Reading and Writing', lx, ly);
    ly += 20;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...BLK);
    doc.text(String(rw), lx, ly);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...G5);
    doc.text('200-800', lx + 42, ly - 5);
    ly += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...G7);
    doc.text(`Score Range: ${sRange(rw)}`, lx, ly);
    if (data.rwRaw !== undefined) {
        doc.text(`Raw: ${data.rwRaw}/${data.rwTotal || 54}`, lx, ly + 9);
    }

    // Separator
    ly += 20;
    doc.setDrawColor(...G3); doc.line(lx, ly, splitX - 8, ly);
    ly += 14;

    // Math score
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...TXT);
    doc.text('Math', lx, ly);
    ly += 20;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...BLK);
    doc.text(String(math), lx, ly);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...G5);
    doc.text('200-800', lx + 42, ly - 5);
    ly += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...G7);
    doc.text(`Score Range: ${sRange(math)}`, lx, ly);
    if (data.mathRaw !== undefined) {
        doc.text(`Raw: ${data.mathRaw}/${data.mathTotal || 44}`, lx, ly + 9);
    }

    // Footnote
    ly += 28;
    doc.setDrawColor(...G3); doc.line(lx, ly, splitX - 8, ly);
    ly += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...G5);
    const fn = doc.splitTextToSize('Score range: the range of scores you could get if you took the SAT multiple times.', leftW - 22);
    doc.text(fn, lx, ly);

    // ──── RIGHT PANEL: Knowledge & Skills ────
    const rx = splitX + 10;
    let ry = cardY + 42;
    const rw2 = CW - leftW - 20;
    const colW = (rw2 - 14) / 2;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TXT);
    doc.text('Knowledge and Skills', rx, ry);
    ry += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...G7);
    const desc = doc.splitTextToSize('View your performance across the 8 content domains measured on the SAT.', rw2 - 4);
    doc.text(desc, rx, ry);
    ry += desc.length * 8 + 6;

    // Column headers
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TXT);
    doc.text('Reading and Writing', rx, ry);
    doc.text('Math', rx + colW + 14, ry);
    ry += 10;

    // Domain data
    const rwDomains = [
        { name: 'Information and Ideas', pct: '26%, 12-14 Qs' },
        { name: 'Craft and Structure', pct: '28%, 13-15 Qs' },
        { name: 'Expression of Ideas', pct: '20%, 8-12 Qs' },
        { name: 'Standard English Conv.', pct: '26%, 11-15 Qs' }
    ];
    const mathDomains = [
        { name: 'Algebra', pct: '35%, 13-15 Qs' },
        { name: 'Advanced Math', pct: '35%, 13-15 Qs' },
        { name: 'Problem-Solving & Data', pct: '15%, 5-7 Qs' },
        { name: 'Geometry & Trig', pct: '15%, 5-7 Qs' }
    ];

    const domSpacing = 76;
    for (let i = 0; i < 4; i++) {
        const dy = ry + i * domSpacing;
        drawDomain(doc, rx, dy, colW, rwDomains[i], rw, i);
        drawDomain(doc, rx + colW + 14, dy, colW, mathDomains[i], math, i + 4);
    }

    // ──────── FOOTER: QR + CTA ────────
    const footY = cardY + cardH + 14;
    const footH = 62;
    doc.setFillColor(...BG); doc.setDrawColor(...G3);
    doc.roundedRect(M, footY, CW, footH, 6, 6, 'FD');

    // CTA text
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TXT);
    doc.text('Join our Telegram for SAT resources & updates!', M + 14, footY + 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...LNK);
    doc.text('t.me/SAT_ALFA', M + 14, footY + 38);

    // QR Code
    const qrX = PW - M - 56;
    try {
        const qrCanvas = document.createElement('canvas');
        await QRCode.toCanvas(qrCanvas, 'https://t.me/SAT_ALFA', {
            width: 200, margin: 1,
            color: { dark: '#111111', light: '#ffffff' }
        });
        const qrImg = qrCanvas.toDataURL('image/png');
        doc.addImage(qrImg, 'PNG', qrX, footY + 6, 50, 50);
    } catch (err) {
        doc.setDrawColor(...G3); doc.setFillColor(...WHT);
        doc.rect(qrX, footY + 6, 50, 50, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...G5);
        doc.text('QR Code', qrX + 10, footY + 34);
    }

    // Copyright
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...G5);
    doc.text('© 2026 ALFA SAT', M, PH - 20);

    // Save
    const safeName = (userName || 'Student').replace(/[^a-z0-9]/gi, '_');
    doc.save(`ALFA_SAT_Score_${total}_${safeName}.pdf`);
}

// ─── Draw a single domain bar ───
function drawDomain(doc, x, dy, w, domain, score, idx) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(33, 33, 33);
    doc.text(domain.name, x, dy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(100, 100, 100);
    doc.text(`(${domain.pct})`, x, dy + 8);

    // Bar
    const segments = 7;
    const gap = 1.5;
    const barY = dy + 12;
    const segW = (w - gap * (segments - 1)) / segments;
    const segH = 7;

    const base = (score - 200) / 600;
    const v = [0.12, 0.02, -0.12, -0.25, 0.04, -0.10, 0.16, 0.06];
    const perf = Math.max(0.12, Math.min(1, base + v[idx % v.length]));
    const filled = Math.max(1, Math.round(perf * segments));

    for (let i = 0; i < segments; i++) {
        const sx = x + i * (segW + gap);
        if (i < filled) {
            doc.setFillColor(17, 17, 17);
            doc.rect(sx, barY, segW, segH, 'F');
        } else {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(140, 140, 140);
            doc.rect(sx, barY, segW, segH, 'FD');
        }
    }

    // Performance text
    const lo = Math.max(200, score - 30 + (idx * 7 - 20));
    const hi = Math.min(800, lo + 80 + idx * 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(80, 80, 80);
    doc.text(`Performance: ${lo}-${hi}`, x, barY + segH + 7);
}

// ─── Score range helper ───
function sRange(score, min = 200, max = 800, delta = 30) {
    return `${Math.max(min, score - delta)}-${Math.min(max, score + delta)}`;
}

// ─── Image loader ───
function loadImageAsBase64(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}
