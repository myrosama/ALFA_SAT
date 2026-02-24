// js/certificate.js
// DSAT-style score report PDF generator (layout-focused template)
// Requires: window.jspdf and window.QRCode

async function generateCertificatePDF(data = {}, userName = 'Student Name') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 38;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const C = {
        bg: '#efefef',
        black: '#111111',
        text: '#1f1f1f',
        gray700: '#3d3d3d',
        gray500: '#7a7a7a',
        gray300: '#cfcfcf',
        gray200: '#dfdfdf',
        gray100: '#f6f6f6',
        white: '#ffffff',
        link: '#2f3bb7'
    };

    const toRgb = (hex) => {
        const clean = hex.replace('#', '');
        return [
            parseInt(clean.slice(0, 2), 16),
            parseInt(clean.slice(2, 4), 16),
            parseInt(clean.slice(4, 6), 16)
        ];
    };
    const setText = (color) => doc.setTextColor(...toRgb(color));
    const setDraw = (color) => doc.setDrawColor(...toRgb(color));
    const setFill = (color) => doc.setFillColor(...toRgb(color));
    const font = (style = 'normal', size = 10, color = C.text) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        setText(color);
    };
    const hLine = (x1, y, x2, color = C.gray300, w = 0.7) => {
        setDraw(color);
        doc.setLineWidth(w);
        doc.line(x1, y, x2, y);
    };
    const rect = (x, y, w, h, fill = null, stroke = null, radius = 0) => {
        if (fill) setFill(fill);
        if (stroke) setDraw(stroke);
        if (radius > 0) {
            doc.roundedRect(x, y, w, h, radius, radius, fill ? (stroke ? 'FD' : 'F') : 'S');
        } else {
            doc.rect(x, y, w, h, fill ? (stroke ? 'FD' : 'F') : 'S');
        }
    };

    // Auto-compute testedOn from completedAt
    let testedOnStr = data.testedOn || 'N/A';
    if (!data.testedOn && data.completedAt?.toDate) {
        testedOnStr = data.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else if (!data.testedOn) {
        testedOnStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    const safe = {
        grade: data.grade ?? '12',
        testName: data.testName ?? 'Practice Test',
        testedOn: testedOnStr,
        recordLocator: data.recordLocator ?? '',
        totalScore: Number(data.totalScore ?? 400),
        rwScore: Number(data.rwScore ?? 200),
        mathScore: Number(data.mathScore ?? 200),
        totalPercentile: data.totalPercentile ?? '-',
        rwPercentile: data.rwPercentile ?? '-',
        mathPercentile: data.mathPercentile ?? '-'
    };

    const rwDomains = [
        { name: 'Information and Ideas', pct: '(26% of test section, 12-14 questions)' },
        { name: 'Craft and Structure', pct: '(28% of test section, 13-15 questions)' },
        { name: 'Expression of Ideas', pct: '(20% of test section, 8-12 questions)' },
        { name: 'Standard English Conventions', pct: '(26% of test section, 11-15 questions)' }
    ];
    const mathDomains = [
        { name: 'Algebra', pct: '(35% of test section, 13-15 questions)' },
        { name: 'Advanced Math', pct: '(35% of test section, 13-15 questions)' },
        { name: 'Problem-Solving and Data Analysis', pct: '(15% of test section, 5-7 questions)' },
        { name: 'Geometry and Trigonometry', pct: '(15% of test section, 5-7 questions)' }
    ];

    // PAGE BACKGROUND
    rect(0, 0, PAGE_W, PAGE_H, C.bg);

    // HEADER: logo + identity block
    let y = 46;
    const logoW = 85;
    const logoH = 34;
    rect(MARGIN, y, logoW, logoH, C.white, C.gray300);
    // Load ALFA SAT logo
    try {
        const logoImg = await loadImageAsBase64('assets/logo.png');
        if (logoImg) {
            doc.addImage(logoImg, 'PNG', MARGIN + 4, y + 2, 30, 30);
        }
    } catch (e) { /* silent */ }
    font('bold', 10, C.black);
    doc.text('ALFA', MARGIN + 38, y + 16);
    doc.text('SAT', MARGIN + 38, y + 28);

    const infoX = PAGE_W - MARGIN - 210;
    const valueGap = 86;
    font('normal', 14, C.text);
    doc.text('Name:', infoX, y + 8);
    doc.text('Grade:', infoX, y + 30);
    doc.text('Test administration:', infoX, y + 52);
    doc.text('Tested on:', infoX, y + 74);
    doc.text('Record Locator:', infoX, y + 96);

    font('bold', 14, C.text);
    doc.text(userName || 'Student Name', infoX + valueGap, y + 8);
    doc.text(String(safe.grade), infoX + valueGap, y + 30);
    doc.text(String(safe.testName), infoX + valueGap, y + 52);
    doc.text(String(safe.testedOn), infoX + valueGap, y + 74);
    doc.text(String(safe.recordLocator), infoX + valueGap, y + 96);

    y += 78;
    font('bold', 54, C.black);
    doc.text('Your Scores', MARGIN, y);

    // MAIN CARD
    y += 36;
    const cardY = y;
    const cardH = 380;
    rect(MARGIN, cardY, CONTENT_W, cardH, C.bg, C.gray300, 10);

    font('bold', 24, C.text);
    doc.text('SAT Scores', MARGIN + 10, cardY + 28);
    hLine(MARGIN, cardY + 46, MARGIN + CONTENT_W, C.gray300, 1);

    const leftW = 168;
    const splitX = MARGIN + leftW;
    doc.line(splitX, cardY + 46, splitX, cardY + cardH);

    // LEFT PANEL: scores
    let lx = MARGIN + 10;
    let ly = cardY + 64;

    font('bold', 10.5, C.text);
    doc.text('TOTAL SCORE', lx, ly);
    ly += 38;
    font('bold', 52, C.black);
    doc.text(String(safe.totalScore), lx, ly);
    font('normal', 7, C.gray700);
    doc.text('400-', lx + 74, ly - 10);
    doc.text('1600', lx + 74, ly - 2);
    drawPercentileBadge(doc, lx + 104, ly - 16, safe.totalPercentile);

    ly += 20;
    font('normal', 8, C.text);
    doc.text(`Score Range: ${scoreRange(safe.totalScore, 400, 1600, 40)}`, lx, ly);
    doc.text(`3-Year Average Score (all testers): ${data.totalAvg ?? 1037}`, lx, ly + 12);

    ly += 24;
    hLine(lx, ly, splitX - 8, C.gray300, 0.9);
    ly += 16;

    font('bold', 10.5, C.text);
    doc.text('SECTION SCORES', lx, ly);

    ly += 28;
    drawSectionScore(doc, {
        x: lx,
        y: ly,
        title: 'Reading and Writing',
        score: safe.rwScore,
        percentile: safe.rwPercentile,
        avg: data.rwAvg ?? 525
    });

    ly += 84;
    hLine(lx, ly - 12, splitX - 8, C.gray300, 0.9);

    drawSectionScore(doc, {
        x: lx,
        y: ly,
        title: 'Math',
        score: safe.mathScore,
        percentile: safe.mathPercentile,
        avg: data.mathAvg ?? 512
    });

    ly += 106;
    hLine(lx, ly - 8, splitX - 8, C.gray300, 0.9);
    font('normal', 6.7, C.gray700);
    const note1 = doc.splitTextToSize('* Percentiles represent the percent of 12th grade test takers from the past 3 years who scored the same as or below you.', leftW - 18);
    doc.text(note1, lx, ly + 3);
    const note2 = doc.splitTextToSize('score range: This is the range of scores you could possibly get if you took the SAT multiple times on different days.', leftW - 18);
    doc.text(note2, lx, ly + 38);

    // RIGHT PANEL: knowledge and skills
    const rx = splitX + 8;
    let ry = cardY + 68;
    const rightW = CONTENT_W - leftW - 18;
    const colW = (rightW - 18) / 2;

    font('bold', 20, C.text);
    doc.text('Knowledge and Skills', rx, ry);
    ry += 20;
    font('normal', 9, C.text);
    const paragraph = doc.splitTextToSize(
        'View your performance across the 8 content domains measured on the SAT. For more information on performance score bands, visit ',
        rightW - 10
    );
    doc.text(paragraph, rx, ry);
    const pHeight = paragraph.length * 10;
    font('normal', 9, C.link);
    doc.text('satsuite.collegeboard.org/skills-insight.', rx + 252, ry + pHeight - 10);

    ry += 32;
    font('bold', 14, C.text);
    doc.text('Reading and Writing', rx, ry);
    doc.text('Math', rx + colW + 18, ry);
    ry += 16;

    for (let i = 0; i < 4; i++) {
        const dy = ry + i * 64;
        drawDomainBand(doc, rx, dy, colW, rwDomains[i], safe.rwScore, i);
        drawDomainBand(doc, rx + colW + 18, dy, colW, mathDomains[i], safe.mathScore, i + 4);
    }

    // FOOTER CTA CARD
    const footY = cardY + cardH + 16;
    const footH = 88;
    rect(MARGIN, footY, CONTENT_W, footH, C.bg, C.gray300, 8);
    const split2 = MARGIN + CONTENT_W - 128;
    doc.line(split2, footY, split2, footY + footH);

    // Placeholder icon block
    const iconX = MARGIN + 12;
    const iconY = footY + 16;
    rect(iconX, iconY, 50, 50, C.gray200, C.gray300, 25);
    font('bold', 7, C.gray700);
    doc.text('ICON', iconX + 14, iconY + 28);

    font('bold', 20, C.text);
    const cta = doc.splitTextToSize('Join our Telegram channel for SAT resources, tips, and updates!', CONTENT_W - 220);
    doc.text(cta, iconX + 62, footY + 30);

    try {
        const qrCanvas = document.createElement('canvas');
        await QRCode.toCanvas(qrCanvas, 'https://t.me/SAT_ALFA', {
            width: 220,
            margin: 1,
            color: { dark: '#111111', light: '#ffffff' }
        });
        const qrImg = qrCanvas.toDataURL('image/png');
        doc.addImage(qrImg, 'PNG', split2 + 32, footY + 14, 60, 60);
    } catch (err) {
        rect(split2 + 32, footY + 14, 60, 60, C.white, C.gray300);
        font('bold', 8, C.gray500);
        doc.text('QR', split2 + 56, footY + 48, { align: 'center' });
    }

    font('bold', 14, C.text);
    doc.text('t.me/SAT_ALFA', split2 + 64, footY + 80, { align: 'center' });

    font('normal', 8, C.gray700);
    doc.text('© 2026 ALFA SAT', MARGIN, PAGE_H - 24);

    const safeName = (userName || 'Student').replace(/[^a-z0-9]/gi, '_');
    doc.save(`ALFA_SAT_Score_${safe.totalScore}_${safeName}.pdf`);
}

function drawPercentileBadge(doc, x, y, text) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(165, 165, 165);
    doc.roundedRect(x, y, 33, 14, 5, 5, 'FD');
    doc.text(String(text), x + 16.5, y + 10, { align: 'center' });
}

function drawSectionScore(doc, { x, y, title, score, percentile, avg }) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    doc.text(title, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(37);
    doc.text(String(score), x, y + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text('200-', x + 48, y + 13);
    doc.text('800', x + 48, y + 21);

    drawPercentileBadge(doc, x + 78, y + 2, percentile);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(`Your Score Range: ${scoreRange(score)}`, x, y + 42);
    doc.text(`3-Year Average Score (all testers): ${avg}`, x, y + 54);
}

function drawDomainBand(doc, x, y, w, domain, score, index) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(domain.name, x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(domain.pct, x, y + 12);

    const segments = 7;
    const gap = 1.8;
    const barY = y + 18;
    const segW = (w - gap * (segments - 1)) / segments;
    const segH = 9;

    const base = (score - 200) / 600;
    const variance = [0.12, 0.02, -0.15, -0.28, 0.04, -0.12, 0.19, 0.08];
    const perf = Math.max(0.12, Math.min(1, base + variance[index % variance.length]));
    const filled = Math.max(1, Math.round(perf * segments));

    for (let i = 0; i < segments; i++) {
        const sx = x + i * (segW + gap);
        if (i < filled) {
            doc.setFillColor(0, 0, 0);
            doc.rect(sx, barY, segW, segH, 'F');
        } else {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(80, 80, 80);
            doc.rect(sx, barY, segW, segH, 'FD');
        }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(`Performance: ${scoreBand(score, index)}`, x, barY + 19);
}

function scoreRange(score, min = 200, max = 800, delta = 30) {
    const lo = Math.max(min, score - delta);
    const hi = Math.min(max, score + delta);
    return `${lo}-${hi}`;
}

function scoreBand(score, idx = 0) {
    const offsets = [[-10, 110], [-80, -20], [-20, 40], [-140, -90], [-50, 20], [-80, -20], [-10, 110], [10, 120]];
    const [a, b] = offsets[idx % offsets.length];
    const lo = Math.max(200, Math.min(800, score + a));
    const hi = Math.max(lo, Math.min(800, score + b));
    return `${lo}-${hi}`;
}

// ─── Image loader for logo ───
function loadImageAsBase64(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}
