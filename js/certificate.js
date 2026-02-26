// js/certificate.js
// SAT Score Report PDF generator — ALFA SAT branded
// Requires: window.jspdf and window.QRCode
// Adapted from standalone score report generator design

async function generateCertificatePDF(data = {}, userName = 'Student Name') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const PW = 595.28;  // page width
    const PH = 841.89;  // page height
    const M = 40;       // margin
    const CW = PW - M * 2; // content width

    // Colors
    const BLK = [15, 15, 15];
    const TXT = [30, 30, 30];
    const G_TXT = [100, 100, 100];
    const G_LIGHT = [210, 210, 210];
    const PURPLE = [46, 27, 143];
    const CARD_BG = [255, 255, 255];

    // Date helper
    let testedOn = 'N/A';
    if (data.completedAt?.toDate) {
        testedOn = data.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else if (data.completedAt) {
        testedOn = new Date(data.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
        testedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    const aiScore = data.aiEstimatedScore;
    const total = Number((aiScore && aiScore.totalScore) ? aiScore.totalScore : (data.totalScore ?? 400));
    const rw = Number((aiScore && aiScore.rwScore) ? aiScore.rwScore : (data.rwScore ?? 200));
    const math = Number((aiScore && aiScore.mathScore) ? aiScore.mathScore : (data.mathScore ?? 200));
    const tName = data.testName ?? 'Practice Test';

    // ──────── PAGE BACKGROUND (white) ────────
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PW, PH, 'F');

    // ──────── 1. HEADER SECTION ────────

    // Logo — just the emblem, slightly bigger
    try {
        const logoImg = await loadImageAsBase64('assets/logo.png');
        if (logoImg) {
            doc.addImage(logoImg, 'PNG', M, 44, 52, 52);
        }
    } catch (e) { /* logo load failed */ }

    // "Your Scores" title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.setTextColor(...BLK);
    doc.text('Your Scores', M, 130);

    // Student info block — right aligned
    const infoX = 320;
    const valX = 390;
    let yInfo = 55;
    const lineH = 16;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...BLK);
    doc.text('Name:', infoX, yInfo);
    doc.text('Test:', infoX, yInfo + lineH);
    doc.text('Tested on:', infoX, yInfo + lineH * 2);

    // Values
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TXT);
    // Truncate long names
    const displayName = (userName || 'Student').length > 28
        ? (userName || 'Student').substring(0, 28) + '…'
        : (userName || 'Student');
    doc.text(displayName, valX, yInfo);
    doc.setFont('helvetica', 'normal');
    const shortTestName = tName.length > 28 ? tName.substring(0, 28) + '…' : tName;
    doc.text(shortTestName, valX, yInfo + lineH);
    doc.text(testedOn, valX, yInfo + lineH * 2);


    // ──────── 2. MAIN CARD ────────
    const cardY = 160;
    const cardH = 390;

    // Card with border
    doc.setFillColor(...CARD_BG);
    doc.setDrawColor(...G_LIGHT);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, cardY, CW, cardH, 6, 6, 'FD');

    // Card title "SAT Scores"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...PURPLE);
    doc.text('SAT Scores', M + 15, cardY + 24);

    // Horizontal line below title
    doc.setDrawColor(...G_LIGHT);
    doc.setLineWidth(0.8);
    doc.line(M, cardY + 36, M + CW, cardY + 36);

    // Vertical split line
    const splitX = M + 175;
    doc.line(splitX, cardY + 36, splitX, cardY + cardH);


    // ──── LEFT PANEL: SCORES ────
    let lx = M + 15;
    let ly = cardY + 65;

    // Dotted line helper
    const drawDottedLine = (y) => {
        doc.setDrawColor(200, 200, 200);
        doc.setLineDashPattern([2, 3], 0);
        doc.line(lx, y, splitX - 15, y);
        doc.setLineDashPattern([], 0);
    };

    // TOTAL SCORE
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...G_TXT);
    doc.text('TOTAL SCORE', lx, ly);

    ly += 35;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(36); doc.setTextColor(...BLK);
    doc.text(String(total), lx, ly);

    const totWidth = doc.getTextWidth(String(total));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(200, 200, 200);
    doc.text('|', lx + totWidth + 6, ly - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...BLK);
    doc.text('400-1600', lx + totWidth + 16, ly - 5);

    ly += 22;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...G_TXT);
    doc.text(`Score Range: ${sRange(total, 400, 1600, 40)}`, lx, ly);

    ly += 15;
    drawDottedLine(ly);

    // SECTION SCORES
    ly += 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BLK);
    doc.text('SECTION SCORES', lx, ly);

    // Reading & Writing
    ly += 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLK);
    doc.text('Reading and Writing', lx, ly);

    ly += 32;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...BLK);
    doc.text(String(rw), lx, ly);

    const rwWidth = doc.getTextWidth(String(rw));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(200, 200, 200);
    doc.text('|', lx + rwWidth + 6, ly - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...BLK);
    doc.text('200-800', lx + rwWidth + 16, ly - 4);

    ly += 20;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...G_TXT);
    doc.text(`Your Score Range: ${sRange(rw)}`, lx, ly);
    if (data.rwRaw !== undefined) {
        doc.text(`Raw: ${data.rwRaw}/${data.rwTotal || 54}`, lx, ly + 11);
    }

    ly += 15;
    drawDottedLine(ly);

    // Math
    ly += 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLK);
    doc.text('Math', lx, ly);

    ly += 32;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...BLK);
    doc.text(String(math), lx, ly);

    const mathWidth = doc.getTextWidth(String(math));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(200, 200, 200);
    doc.text('|', lx + mathWidth + 6, ly - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...BLK);
    doc.text('200-800', lx + mathWidth + 16, ly - 4);

    ly += 20;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...G_TXT);
    doc.text(`Your Score Range: ${sRange(math)}`, lx, ly);
    if (data.mathRaw !== undefined) {
        doc.text(`Raw: ${data.mathRaw}/${data.mathTotal || 44}`, lx, ly + 11);
    }

    ly += 15;
    drawDottedLine(ly);

    // Score range footnote
    ly += 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLK);
    doc.text('Score range:', lx, ly);
    const srW = doc.getTextWidth('Score range:');
    doc.setFont('helvetica', 'normal');
    doc.text(' This is the range of scores you', lx + srW, ly);
    doc.text('could possibly get if you took the SAT multiple', lx, ly + 10);
    doc.text('times on different days.', lx, ly + 20);


    // ──── RIGHT PANEL: KNOWLEDGE AND SKILLS ────
    let rx = splitX + 15;
    let ry = cardY + 65;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...BLK);
    doc.text('Knowledge and Skills', rx, ry);

    ry += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...BLK);
    const ksDesc = doc.splitTextToSize('View your performance across the 8 content domains measured on the SAT.', CW - (splitX - M) - 30);
    doc.text(ksDesc, rx, ry);

    // Sub-columns
    ry += ksDesc.length * 12 + 18;
    const colW = 155;
    const rxMath = rx + 160;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...BLK);
    doc.text('Reading and Writing', rx, ry);
    doc.text('Math', rxMath, ry);

    // Domain data
    const rwDomains = [
        { name: 'Information and Ideas', desc: '(26% of test section, 12-14 questions)' },
        { name: 'Craft and Structure', desc: '(28% of test section, 13-15 questions)' },
        { name: 'Expression of Ideas', desc: '(20% of test section, 8-12 questions)' },
        { name: 'Standard English Conventions', desc: '(26% of test section, 11-15 questions)' }
    ];

    const mathDomains = [
        { name: 'Algebra', desc: '(35% of test section, 13-15 questions)' },
        { name: 'Advanced Math', desc: '(35% of test section, 13-15 questions)' },
        { name: 'Problem-Solving and Data Analysis', desc: '(15% of test section, 5-7 questions)' },
        { name: 'Geometry and Trigonometry', desc: '(15% of test section, 5-7 questions)' }
    ];

    // Render domains
    let dyRW = ry + 25;
    let dyMath = ry + 25;

    for (let i = 0; i < 4; i++) {
        dyRW = drawDomainBlock(doc, rx, dyRW, colW, rwDomains[i], rw, i, PURPLE);
        dyMath = drawDomainBlock(doc, rxMath, dyMath, colW, mathDomains[i], math, i, PURPLE);
    }


    // ──────── 3. FOOTER ────────
    const footerY = cardY + cardH + 75;

    // Footer text
    doc.setFont('times', 'normal');
    doc.setFontSize(18);
    const footerText = 'For more resources, Scan the ';
    const ftWidth = doc.getTextWidth(footerText);
    const textX = 140;

    doc.setTextColor(...BLK);
    doc.text(footerText, textX, footerY + 45);
    doc.setTextColor(...PURPLE);
    doc.text('QR code', textX + ftWidth, footerY + 45);

    // QR code — load from assets/bing_generated_qrcode.svg
    try {
        const qrImg = await loadSvgAsBase64('assets/bing_generated_qrcode.svg', 200);
        if (qrImg) {
            doc.addImage(qrImg, 'PNG', PW - M - 120, footerY - 10, 100, 100);
        } else {
            throw new Error('SVG load failed');
        }
    } catch (err) {
        // Fallback: try QRCode.js if available
        try {
            if (typeof QRCode !== 'undefined') {
                const qrCanvas = document.createElement('canvas');
                await QRCode.toCanvas(qrCanvas, 'https://t.me/SAT_ALFA', {
                    width: 140, margin: 0,
                    color: { dark: '#000000', light: '#ffffff' }
                });
                doc.addImage(qrCanvas.toDataURL('image/png'), 'PNG', PW - M - 120, footerY - 10, 100, 100);
            }
        } catch (e2) {
            // Final fallback: placeholder box
            doc.setDrawColor(...G_LIGHT); doc.setFillColor(255, 255, 255);
            doc.rect(PW - M - 120, footerY - 10, 100, 100, 'FD');
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...G_TXT);
            doc.text('QR Code', PW - M - 90, footerY + 40);
        }
    }

    // Copyright
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...G_TXT);
    doc.text('ALFA SAT | 2026', M, PH - 20);

    // ──────── SAVE ────────
    const safeName = (userName || 'Student').replace(/[^a-z0-9]/gi, '_');
    doc.save(`ALFA_SAT_Score_${total}_${safeName}.pdf`);
}


// ─── Draw a single domain with 7-segment progress bar ───
function drawDomainBlock(doc, x, y, colW, domainData, subjectScore, idx, accentColor) {
    // Domain name
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 15, 15);
    const wrappedName = doc.splitTextToSize(domainData.name, colW);
    doc.text(wrappedName, x, y);

    let currentY = y + (wrappedName.length * 10);

    // Domain description
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    const wrappedDesc = doc.splitTextToSize(domainData.desc, colW);
    doc.text(wrappedDesc, x, currentY);

    currentY += (wrappedDesc.length * 9) + 4;

    // 7-Segment progress bar
    const segments = 7;
    const segW = 20;
    const segH = 6;
    const gap = 1.5;

    const basePerf = (subjectScore - 200) / 600;
    const variation = [0.1, -0.05, 0.15, -0.1][idx % 4];
    const perfLevel = Math.max(0.1, Math.min(1.0, basePerf + variation));
    const filledCount = Math.max(1, Math.round(perfLevel * segments));

    for (let i = 0; i < segments; i++) {
        const sx = x + (i * (segW + gap));
        if (i < filledCount) {
            doc.setFillColor(...accentColor);
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(0.5);
            doc.rect(sx, currentY, segW, segH, 'FD');
        } else {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(40, 40, 40);
            doc.setLineWidth(0.6);
            doc.rect(sx, currentY, segW, segH, 'FD');
        }
    }

    return currentY + 28;
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


// ─── SVG loader (renders SVG to canvas → PNG base64) ───
function loadSvgAsBase64(src, size = 200) {
    return new Promise((resolve) => {
        fetch(src)
            .then(res => res.text())
            .then(svgText => {
                const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = size;
                    c.height = size;
                    const ctx = c.getContext('2d');
                    // White background for QR readability
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, size, size);
                    ctx.drawImage(img, 0, 0, size, size);
                    URL.revokeObjectURL(url);
                    resolve(c.toDataURL('image/png'));
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };
                img.src = url;
            })
            .catch(() => resolve(null));
    });
}

