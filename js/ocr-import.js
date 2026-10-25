// ocr-import.js - Screenshot-Erkennung per Tesseract-OCR: Kalender-Screenshots und DBB-Scores.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
let tesseractLoadPromise = null;
function loadTesseractScript() {
    if (window.Tesseract)
        return Promise.resolve();
    if (tesseractLoadPromise)
        return tesseractLoadPromise;
    tesseractLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/2.1.5/tesseract.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Bilderkennungs-Bibliothek konnte nicht geladen werden."));
        document.head.appendChild(s);
    });
    return tesseractLoadPromise;
}
function isNearWhite(r, g, b) {
    return r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
}
function colorDistance(c1, c2) {
    return Math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2);
}
// Screenshot-Hintergrund schaetzen statt "weiss" fest anzunehmen - noetig fuer
// Dark-Mode-Kalender-Apps (dunkler Hintergrund, helle Kaestchen) und farbige
// Seitenhintergruende (z.B. beige/cremefarbene Themes). Die Randpixel des
// Bildes sind so gut wie immer echter Seitenhintergrund, nie ein Termin-
// Kaestchen - die haeufigste Randfarbe ist daher eine robuste Schaetzung.
function estimateBackgroundColor(canvas) {
    const width = canvas.width, height = canvas.height;
    const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
    const counts = new Map();
    // Ueber das GANZE Bild sparsam abtasten statt nur den Bildrand - ein eng
    // zugeschnittener Screenshot kann eine Rasterlinie oder ein Kaestchen genau
    // an den Rand legen, was den Rand selbst zur falschen Schaetzung machen
    // wuerde. Der Hintergrund ist so gut wie immer die haeufigste Farbe im
    // gesamten Bild, weil Kaestchen/Linien/Text immer nur einen Bruchteil der
    // Flaeche einnehmen.
    const stepX = Math.max(1, Math.floor(width / 150));
    const stepY = Math.max(1, Math.floor(height / 150));
    for (let y = 0; y < height; y += stepY) {
        for (let x = 0; x < width; x += stepX) {
            const p = (y * width + x) * 4;
            // Auf ein 8er-Raster quantisieren, damit minimale Kompressions-/
            // Antialiasing-Abweichungen nicht als eigene Farben zaehlen.
            const key = `${data[p] >> 3},${data[p + 1] >> 3},${data[p + 2] >> 3}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    let bestKey = "31,31,31", bestCount = -1;
    counts.forEach((c, k) => { if (c > bestCount) {
        bestCount = c;
        bestKey = k;
    } });
    return bestKey.split(",").map((v) => Number(v) * 8 + 4);
}
function isBackgroundColor(r, g, b, bg) {
    return colorDistance([r, g, b], bg) < 28;
}
function detectColoredBlocks(canvas, bg) {
    const width = canvas.width, height = canvas.height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const n = width * height;
    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    const blocks = [];
    const background = bg || estimateBackgroundColor(canvas);
    function pixelAt(idx) {
        const p = idx * 4;
        return [data[p], data[p + 1], data[p + 2]];
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx])
                continue;
            visited[idx] = 1;
            const seedColor = pixelAt(idx);
            if (isBackgroundColor(seedColor[0], seedColor[1], seedColor[2], background))
                continue;
            let sp = 0;
            stack[sp++] = idx;
            let minX = x, maxX = x, minY = y, maxY = y, count = 0;
            let rSum = 0, gSum = 0, bSum = 0;
            while (sp > 0) {
                const cur = stack[--sp];
                const cx = cur % width, cy = (cur / width) | 0;
                const cColor = pixelAt(cur);
                count++;
                rSum += cColor[0];
                gSum += cColor[1];
                bSum += cColor[2];
                if (cx < minX)
                    minX = cx;
                if (cx > maxX)
                    maxX = cx;
                if (cy < minY)
                    minY = cy;
                if (cy > maxY)
                    maxY = cy;
                const candidates = [];
                if (cx > 0)
                    candidates.push(cur - 1);
                if (cx < width - 1)
                    candidates.push(cur + 1);
                if (cy > 0)
                    candidates.push(cur - width);
                if (cy < height - 1)
                    candidates.push(cur + width);
                for (const nb of candidates) {
                    if (visited[nb])
                        continue;
                    const nColor = pixelAt(nb);
                    if (isBackgroundColor(nColor[0], nColor[1], nColor[2], background)) {
                        visited[nb] = 1;
                        continue;
                    }
                    if (colorDistance(nColor, seedColor) > 90)
                        continue;
                    visited[nb] = 1;
                    stack[sp++] = nb;
                }
            }
            // Schwarzer/grauer Text ausserhalb der farbigen Kaestchen (z.B. ein
            // "OPTIONAL"-Label ueber einem Termin) besteht aus Pixeln, die nicht
            // Hintergrundfarbe sind - wuerde ohne diese Pruefung faelschlich als
            // eigener Termin-Block erkannt. Echte Termin-Kaestchen haben eine
            // klar erkennbare Eigenfarbe (Orange/Lila/Blau usw. - auch pastellig
            // oder im Dark Mode), reiner Text ist dagegen (fast) grau/neutral -
            // R/G/B liegen nah beieinander.
            const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count;
            const saturation = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
            if (count > 300 && maxX - minX > 20 && maxY - minY > 15 && saturation > 18) {
                blocks.push({ minX, maxX, minY, maxY, count });
            }
        }
    }
    return blocks;
}
function assignColumnsByWidth(blocks, numDays) {
    if (blocks.length === 0)
        return blocks;
    // Spalten anhand der tatsächlichen Kästchen-Ausdehnung berechnen statt der
    // vollen Bildbreite - sonst verschiebt eine Zeitachsen-Spalte links (oder ein
    // beschnittener Screenshot) alle Tage falsch, weil sie nicht Teil des Rasters ist.
    const minX = Math.min(...blocks.map((b) => b.minX));
    const maxX = Math.max(...blocks.map((b) => b.maxX));
    const span = Math.max(1, maxX - minX);
    const colWidth = span / numDays;
    return blocks.map((b) => ({ ...b, column: Math.min(numDays - 1, Math.max(0, Math.floor((((b.minX + b.maxX) / 2) - minX) / colWidth))) }));
}
/* Zweiter Erkennungsweg neben den farbigen Kaestchen: echte Tabellen-Screenshots
   (Excel/Sheets-Export mit Wochentags-Kopfzeile und sichtbaren Rasterlinien).
   Dort haben viele Termine GAR KEINE Farbe (weisser Zellenhintergrund) und
   wuerden von detectColoredBlocks komplett uebersehen, weil die nur nach
   gesaettigten Farbflaechen sucht. Stattdessen hier direkt die Rasterlinien
   selbst finden (duenne graue/schwarze Linien, die fast die volle Breite bzw.
   Hoehe durchlaufen) und daraus die Zellgrenzen ableiten - unabhaengig davon,
   ob eine Zelle eingefaerbt ist oder nicht. */
function isGridLineColor(r, g, b, bg) {
    // Bei bekanntem Seitenhintergrund reicht "deutlich anders als der Hintergrund" -
    // das erkennt Linien unabhaengig davon, ob der Hintergrund hell oder dunkel
    // ist. Die alte Grau/Dunkel-Heuristik unten ging von einem HELLEN Hintergrund
    // aus (Linie = dunkler/grau) - bei einem dunklen, selbst schon grauen
    // Hintergrund (z.B. Dark Mode #1e1e1e) haette sie sonst JEDEN Hintergrund-
    // Pixel faelschlich als Linie gezaehlt, weil "dunkelgrau" eben auch auf den
    // Hintergrund selbst zutrifft.
    if (bg)
        return colorDistance([r, g, b], bg) > 40;
    const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
    // Grau/schwarz (Linie oder graue Kopfzeilen-Flaeche), aber nicht reines Weiss
    // und nicht zu bunt (das waeren dann eingefaerbte Termin-Zellen, keine Linie).
    const grayish = maxc < 235 && (maxc - minc) < 20;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return grayish || luma < 140;
}
function extractLinePositions(isLine, length) {
    const positions = [];
    let inRun = false, runStart = 0;
    for (let i = 0; i < length; i++) {
        if (isLine[i] && !inRun) {
            inRun = true;
            runStart = i;
        }
        if (!isLine[i] && inRun) {
            inRun = false;
            positions.push(runStart, i - 1);
        }
    }
    if (inRun)
        positions.push(runStart, length - 1);
    const sorted = Array.from(new Set(positions)).sort((a, b) => a - b);
    const merged = [];
    sorted.forEach((v) => {
        if (merged.length && v - merged[merged.length - 1] <= 2)
            return;
        merged.push(v);
    });
    return merged;
}
function detectGridLines(canvas, bg) {
    const width = canvas.width, height = canvas.height;
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, width, height);
    const background = bg || estimateBackgroundColor(canvas);
    const rowIsLine = new Uint8Array(height);
    const colIsLine = new Uint8Array(width);
    const rowCount = new Int32Array(height);
    const colCount = new Int32Array(width);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = (y * width + x) * 4;
            if (isGridLineColor(data[p], data[p + 1], data[p + 2], background)) {
                rowCount[y]++;
                colCount[x]++;
            }
        }
    }
    for (let y = 0; y < height; y++)
        rowIsLine[y] = rowCount[y] > width * 0.5 ? 1 : 0;
    for (let x = 0; x < width; x++)
        colIsLine[x] = colCount[x] > height * 0.5 ? 1 : 0;
    return {
        rowLines: extractLinePositions(rowIsLine, height),
        colLines: extractLinePositions(colIsLine, width),
    };
}
function hasVisibleContent(canvas, block, bg) {
    const ctx = canvas.getContext("2d");
    // Ein paar Pixel Rand weglassen - direkt an der Zellgrenze faerbt die
    // (leicht verwischte) Rasterlinie sonst auch komplett leere Zellen ein
    // bisschen ein und wuerde faelschlich als "hat Inhalt" durchgehen.
    const inset = 3;
    const w = block.maxX - block.minX - inset * 2, h = block.maxY - block.minY - inset * 2;
    if (w <= 0 || h <= 0)
        return false;
    const { data } = ctx.getImageData(block.minX + inset, block.minY + inset, w, h);
    const background = bg || estimateBackgroundColor(canvas);
    let content = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (!isBackgroundColor(data[i], data[i + 1], data[i + 2], background))
            content++;
    }
    return content / (data.length / 4) > 0.015;
}
/* Aus den erkannten Rasterlinien die einzelnen Zellen bilden - die erste
   Zeilen-Bande (Kopfzeile mit den Wochentagsnamen) wird uebersprungen, ihre
   Spaltengrenzen aber fuer alle folgenden Zeilen weiterverwendet. Leere
   Zellen (kein Text/Inhalt) werden gleich verworfen, um unnoetiges OCR zu
   vermeiden. */
function detectGridCells(canvas, rowLines, colLines, bg) {
    const background = bg || estimateBackgroundColor(canvas);
    const cells = [];
    for (let r = 1; r < rowLines.length - 1; r++) {
        const minY = rowLines[r], maxY = rowLines[r + 1];
        if (maxY - minY < 10)
            continue;
        for (let c = 0; c < colLines.length - 1; c++) {
            const minX = colLines[c], maxX = colLines[c + 1];
            if (maxX - minX < 10)
                continue;
            // Etwas nach innen einruecken: prepareOcrCanvas() polstert den
            // Ausschnitt fuer die OCR spaeter noch zusaetzlich nach AUSSEN -
            // ohne dieses Einruecken wuerde das die Rasterlinie selbst mit
            // einschliessen, die Tesseract dann leicht als Buchstaben (z.B.
            // ein stoerendes "l") missversteht.
            const inset = 3;
            const block = { minX: minX + inset, maxX: maxX - inset, minY: minY + inset, maxY: maxY - inset, column: c };
            if (block.maxX - block.minX > 4 && block.maxY - block.minY > 4 && hasVisibleContent(canvas, block, background))
                cells.push(block);
        }
    }
    return cells;
}
function prepareOcrCanvas(sourceCanvas, block, padding) {
    const sx = Math.max(0, block.minX - padding);
    const sy = Math.max(0, block.minY - padding);
    const ex = Math.min(sourceCanvas.width, block.maxX + padding);
    const ey = Math.min(sourceCanvas.height, block.maxY + padding);
    const w = ex - sx, h = ey - sy;
    // Auf eine Mindesthöhe hochskalieren - Tesseract erkennt kleine, per Screenshot
    // verkleinerte Schrift in den Kästchen sonst sehr schlecht.
    let scale = Math.max(1, Math.min(4, 120 / h));
    // Schmale Kaestchen (z.B. zwei ueberlappende Termine nebeneinander) bleiben
    // nach dem rein hoehenbasierten Hochskalieren oft trotzdem zu schmal fuer
    // zuverlaessiges OCR - deshalb zusaetzlich auf eine Mindestbreite skalieren.
    const minOutW = 200;
    if (w * scale < minOutW) {
        scale = Math.min(6, minOutW / w);
    }
    const outW = Math.round(w * scale), outH = Math.round(h * scale);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = outW;
    cropCanvas.height = outH;
    const cctx = cropCanvas.getContext("2d");
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(sourceCanvas, sx, sy, w, h, 0, 0, outW, outH);
    // Google-Calendar-Kästchen haben meist weiße Schrift auf farbigem/dunklem
    // Grund - Tesseract ist auf dunkle Schrift auf hellem Grund trainiert.
    // Deshalb: in Graustufen wandeln und bei insgesamt dunklem Kästchen invertieren.
    const imgData = cctx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
        sum += gray;
    }
    const avg = sum / (d.length / 4);
    if (avg < 140) {
        for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
        }
    }
    // Danach ist der Hintergrund nur ein mittleres Grau (Graustufe der
    // ursprünglichen Kästchenfarbe), kein reines Weiß - für Tesseract bei
    // kleiner Schrift zu wenig Kontrast. Deshalb per Otsu-Schwellenwert hart
    // auf Schwarz/Weiß binarisieren (Standard-Trick zur OCR-Verbesserung).
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4)
        hist[d[i]]++;
    const total = d.length / 4;
    let sumAll = 0;
    for (let t = 0; t < 256; t++)
        sumAll += t * hist[t];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0)
            continue;
        const wF = total - wB;
        if (wF === 0)
            break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sumAll - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) {
            maxVar = varBetween;
            threshold = t;
        }
    }
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i] > threshold ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    cctx.putImageData(imgData, 0, 0);
    return cropCanvas;
}
async function ocrBlock(worker, sourceCanvas, block, padding) {
    const cropCanvas = prepareOcrCanvas(sourceCanvas, block, padding);
    const result = await worker.recognize(cropCanvas);
    return result.data.text || "";
}
function guessCategoryFromTitle(title) {
    const t = (title || "").toUpperCase();
    // Kuerzel (mit Wortgrenzen, damit z.B. "STATISTIK" nicht faelschlich als
    // "AT"/"IT" erkannt wird) UND die ausgeschriebenen Woerter - Trainer tippen
    // oft "Individualtraining"/"Athletiktraining" ohne Abkuerzung. Zusaetzlich
    // ein paar Begriffe aus englischsprachigen Trainingsplaenen (z.B. Tabellen-
    // Screenshots): LIFT = Athletik/Kraft, GAME = Spiel, MEETING/MEDICAL/DINNER
    // sind organisatorische Termine ohne echtes Training -> Sonstiges.
    if (/\bAT\b/.test(t) || t.includes("ATHLETIK") || t.includes("LIFT"))
        return "at";
    if (/\b(IT|INDI|IND)\b/.test(t) || t.includes("INDIVIDUAL"))
        return "it";
    if (/\bTT\b/.test(t) || t.includes("TEAMTRAINING"))
        return "tt";
    if (t.includes("GAME") || t.includes("SPIEL"))
        return "spiel";
    if (t.includes("MEETING") || t.includes("MEDICAL") || t.includes("DINNER"))
        return "individuell";
    return "tt";
}
// 12-Stunden-Format (AM/PM) auf 24h normalisieren, BEVOR die eigentliche
// Zeilen-Erkennung laeuft - viele (v.a. englischsprachige/US-) Kalender-Apps
// zeigen Zeiten als "6:00 PM" statt "18:00". Ersetzt jedes Vorkommen einzeln,
// damit z.B. "10:00 AM - 11:30 AM" beide Seiten trifft.
function normalizeAmPmTimes(text) {
    return (text || "").replace(/(\d{1,2})[.:](\d{2})\s*([AaPp])\.?\s*[Mm]\.?/g, (match, hh, mm, ap) => {
        let h = Number(hh) % 12;
        if (/p/i.test(ap))
            h += 12;
        return `${String(h).padStart(2, "0")}:${mm}`;
    });
}
function parseBlockText(rawText) {
    // Je nach Screenshot-Quelle steht die Uhrzeit mal UEBER dem Titel (Tabellen-
    // Export: "10:00" / "Lift / Individuals"), mal DARUNTER (Google-Calendar-
    // Kaestchen: "Teamtraining" / "18:00-19:30"), und manchmal beides in einer
    // Zeile ("16:00 Walk In"). Deshalb nicht mehr strikt von oben nach unten
    // lesen, sondern jede Zeile einzeln pruefen: die ERSTE Zeile, die wie eine
    // Uhrzeit aussieht, liefert die Uhrzeit (egal an welcher Position) - alle
    // anderen Zeilen (bzw. der Rest einer gemischten Zeile) ergeben den Titel.
    const cleaned = normalizeAmPmTimes((rawText || "").replace(/\r/g, "").trim());
    const rangeRe = /(\d{1,2})[.:]?(\d{0,2})\s*(?:bis|-|–|bs)\s*(\d{1,2})[.:](\d{2})/i;
    const soloTimeRe = /^(\d{1,2})[.:](\d{2})$/;
    const leadingTimeRe = /^(\d{1,2})[.:](\d{2})\s+(.+)$/;
    // Manchmal liest die Bilderkennung vor der eigentlichen Uhrzeit noch ein,
    // zwei stoerende Zeichen mit (z.B. ein Rest einer Rasterlinie, der als "l"
    // gelesen wird) - dann greift leadingTimeRe nicht mehr (Zeile faengt ja
    // nicht mit einer Ziffer an). Als Ausweichloesung: bis zu drei fuehrende
    // Nicht-Ziffern-Zeichen ignorieren, wenn direkt danach eine Uhrzeit folgt.
    const noisyLeadingTimeRe = /^.{0,3}?(\d{1,2})[.:](\d{2})\s*(.*)$/;
    // Eine ANGEFANGENE Zeitangabe (z.B. "18:30 bis 2" - Endzeit vom Kaestchen
    // abgeschnitten) liefert zwar keine Endzeit, soll aber trotzdem nicht als
    // Rest-Text im Titel landen.
    const danglingRe = /^(bis|-|–|bs)\s*\d*[.:]?\d*$/i;
    const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
    const titleParts = [];
    let startTime = "", endTime = "", consumedTime = false;
    for (const line of lines) {
        if (!consumedTime) {
            const rangeMatch = line.match(rangeRe);
            if (rangeMatch) {
                const startMin = rangeMatch[2] || "00";
                startTime = `${rangeMatch[1].padStart(2, "0")}:${startMin}`;
                endTime = `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`;
                consumedTime = true;
                const remainder = line.replace(rangeRe, "").trim();
                if (remainder && !danglingRe.test(remainder))
                    titleParts.push(remainder);
                continue;
            }
            if (soloTimeRe.test(line)) {
                const m = line.match(soloTimeRe);
                startTime = `${m[1].padStart(2, "0")}:${m[2]}`;
                consumedTime = true;
                continue;
            }
            const leadingMatch = line.match(leadingTimeRe);
            if (leadingMatch) {
                startTime = `${leadingMatch[1].padStart(2, "0")}:${leadingMatch[2]}`;
                consumedTime = true;
                const remainder = leadingMatch[3].trim();
                if (remainder && !danglingRe.test(remainder))
                    titleParts.push(remainder);
                continue;
            }
            if (danglingRe.test(line)) {
                consumedTime = true;
                continue;
            }
            const noisyMatch = line.match(noisyLeadingTimeRe);
            if (noisyMatch) {
                startTime = `${noisyMatch[1].padStart(2, "0")}:${noisyMatch[2]}`;
                consumedTime = true;
                const remainder = noisyMatch[3].trim();
                if (remainder && !danglingRe.test(remainder))
                    titleParts.push(remainder);
                continue;
            }
        }
        titleParts.push(line);
    }
    const title = titleParts.join(" ").replace(/\s+/g, " ").trim() || "Termin";
    return { title, startTime, endTime };
}
/* Dritter Erkennungsweg, wenn weder Raster noch farbige Kaestchen gefunden
   werden: eine reine Text-/Listenansicht (z.B. Listenansicht von Apple-
   Kalender/Outlook, ein Trainingsplan als Fliesstext, ein abfotografierter
   Aushang). Dort steht kein Termin in einem abgegrenzten Kaestchen, sondern
   die Tage stehen als Ueberschrift (Wochentag oder Datum) ueber einer Reihe
   von Zeilen mit Uhrzeit + Titel. */
const WEEKDAY_TOKENS = [
    { re: /\b(mo|montag|mon|monday)\b/i, offset: 0 },
    { re: /\b(di|dienstag|tue|tues|tuesday)\b/i, offset: 1 },
    { re: /\b(mi|mittwoch|wed|wednesday)\b/i, offset: 2 },
    { re: /\b(do|donnerstag|thu|thur|thurs|thursday)\b/i, offset: 3 },
    { re: /\b(fr|freitag|fri|friday)\b/i, offset: 4 },
    { re: /\b(sa|samstag|sat|saturday)\b/i, offset: 5 },
    { re: /\b(so|sonntag|sun|sunday)\b/i, offset: 6 },
];
function matchDateHeader(line, mondayDate) {
    const trimmed = line.trim();
    // Ein explizites Datum ist eindeutig und hat Vorrang vor einem blossen
    // Wochentagsnamen (der sich auf die vom Nutzer angegebene Woche bezieht).
    const dateMatch = trimmed.match(/(\d{1,2})[.\/](\d{1,2})\.?(?:[.\/](\d{2,4}))?/);
    if (dateMatch) {
        const day = Number(dateMatch[1]), month = Number(dateMatch[2]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            let year = dateMatch[3] ? Number(dateMatch[3]) : mondayDate.getFullYear();
            if (year < 100)
                year += 2000;
            const d = new Date(year, month - 1, day);
            if (!isNaN(d))
                return d;
        }
    }
    for (const wd of WEEKDAY_TOKENS) {
        if (new RegExp("^" + wd.re.source, "i").test(trimmed)) {
            const d = new Date(mondayDate);
            d.setDate(mondayDate.getDate() + wd.offset);
            return d;
        }
    }
    return null;
}
// Bei einer echten Kaestchen-/Zellen-OCR steht die Uhrzeit fast immer allein
// oder am Zeilenanfang (das deckt parseBlockText() ab) - in Fliesstext-Listen
// steckt sie aber oft mitten im Satz ("Spiel um 20:00 Uhr", "Training ab
// 18:00"). Dafuer zusaetzlich nach einer Uhrzeit IRGENDWO in der Zeile suchen
// und sie samt gaengiger Fuellwoerter aus dem Titel herausschneiden.
function parseFreeTextLine(line) {
    const primary = parseBlockText(line);
    if (primary.startTime)
        return primary;
    const stripFiller = (s) => s.replace(/\b(um|ab|von|bis|at|uhr|o'?clock)\b/gi, "").replace(/\s+/g, " ").trim() || "Termin";
    const rangeMatch = line.match(/(\d{1,2})[.:](\d{2})\s*(?:bis|-|–)\s*(\d{1,2})[.:](\d{2})/);
    if (rangeMatch) {
        return {
            title: stripFiller(line.replace(rangeMatch[0], "")),
            startTime: `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2]}`,
            endTime: `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`,
        };
    }
    const soloMatch = line.match(/(\d{1,2})[.:](\d{2})/);
    if (soloMatch) {
        return { title: stripFiller(line.replace(soloMatch[0], "")), startTime: `${soloMatch[1].padStart(2, "0")}:${soloMatch[2]}`, endTime: "" };
    }
    return primary;
}
function parseFreeTextSchedule(rawText, mondayDate) {
    const lines = normalizeAmPmTimes((rawText || "").replace(/\r/g, "")).split("\n").map((l) => l.trim()).filter(Boolean);
    const events = [];
    let currentDate = null;
    for (const line of lines) {
        const headerDate = matchDateHeader(line, mondayDate);
        if (headerDate) {
            currentDate = headerDate;
            continue;
        }
        // Zeilen vor der ersten erkannten Datums-/Wochentags-Ueberschrift
        // ueberspringen (z.B. ein Bildschirmtitel wie "Mein Wochenplan").
        if (!currentDate)
            continue;
        const { title, startTime, endTime } = parseFreeTextLine(line);
        // Eine Zeile ohne erkennbare Uhrzeit ist meist kein eigener Termin,
        // sondern z.B. eine umgebrochene Fortsetzung des vorigen Titels.
        if (!startTime)
            continue;
        events.push({ title, date: isoDate(currentDate), time: startTime, endTime });
    }
    return events.map((e, i) => ({ id: `txt-${i}`, ...e }));
}
async function extractEventsFromCalendarScreenshot(imgEl, mondayDate, numDays, onProgress) {
    await loadTesseractScript();
    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0);
    // Drei grundverschiedene Screenshot-Arten kommen vor: (1) Google-Calendar-
    // Wochenansicht mit frei schwebenden farbigen Kaestchen auf einfarbigem
    // Grund (hell ODER dunkel - Dark Mode), ohne sichtbare Rasterlinien,
    // (2) ein Tabellen-Export (Excel/Sheets) mit Wochentags-Kopfzeile und
    // durchgezogenen Rasterlinien, wo auch nicht eingefaerbte Zellen echte
    // Termine enthalten koennen, oder (3) eine reine Text-/Listenansicht ganz
    // ohne Kaestchen/Raster (Listenansicht, Fliesstext-Plan, Aushang-Foto).
    // Deshalb zuerst nach einem Raster suchen, dann nach Farbkaestchen, und
    // nur wenn beides nichts findet auf die Fliesstext-Erkennung zurueckfallen.
    const bg = estimateBackgroundColor(canvas);
    const { rowLines, colLines } = detectGridLines(canvas, bg);
    const gridColumns = colLines.length - 1;
    const gridRows = rowLines.length - 1;
    let blocks;
    if (gridColumns >= Math.max(2, numDays - 1) && gridColumns <= numDays + 2 && gridRows >= 2) {
        blocks = detectGridCells(canvas, rowLines, colLines, bg);
    }
    else {
        const rawBlocks = detectColoredBlocks(canvas, bg);
        blocks = assignColumnsByWidth(rawBlocks, numDays);
    }
    blocks.sort((a, b) => a.column - b.column || a.minY - b.minY);
    // Ein Worker für alle Kästchen wiederverwenden (deutlich schneller als pro
    // Kästchen neu zu laden) und auf "ein einzelner Textblock" statt volle
    // Seitenerkennung stellen - passt viel besser zu kurzen Kästchen-Texten.
    const worker = typeof window.Tesseract.createWorker === "function" ? await window.Tesseract.createWorker() : null;
    if (worker) {
        await worker.load();
        await worker.loadLanguage("deu");
        await worker.initialize("deu");
        // Erlaubte Zeichen einschraenken auf das, was in den Kaestchen realistisch
        // vorkommt (Titel-Kuerzel, Zeiten) - verhindert, dass Tesseract bei
        // unklaren Pixeln auf exotische Symbole wie "]" oder "{" raet.
        await worker.setParameters({
            ...(window.Tesseract.PSM ? { tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_BLOCK } : {}),
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöü0123456789:.,-+/ ",
        });
    }
    if (blocks.length === 0) {
        // Weder Raster noch farbige Kaestchen gefunden - letzter Versuch: das
        // ganze Bild als einen Fliesstext erkennen (volle Seitenerkennung statt
        // "ein einzelner Textblock") und zeilenweise nach Datum/Wochentag plus
        // Uhrzeit+Titel durchsuchen.
        try {
            if (worker && window.Tesseract.PSM)
                await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.AUTO });
            if (onProgress)
                onProgress(0, 1);
            const fullText = worker ? await worker.recognize(canvas).then((r) => r.data.text) : (await window.Tesseract.recognize(canvas, "deu")).data.text;
            if (onProgress)
                onProgress(1, 1);
            return parseFreeTextSchedule(fullText, mondayDate);
        }
        finally {
            if (worker)
                await worker.terminate();
        }
    }
    const rawResults = [];
    try {
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (onProgress)
                onProgress(i + 1, blocks.length);
            const text = worker ? await ocrBlock(worker, canvas, block, 4) : (await window.Tesseract.recognize(prepareOcrCanvas(canvas, block, 4), "deu")).data.text;
            const { title, startTime, endTime } = parseBlockText(text);
            rawResults.push({ block, title, startTime, endTime });
        }
    }
    finally {
        if (worker)
            await worker.terminate();
    }
    // Bei Tabellen-Exporten (Raster-Zellen statt Farbkaestchen) stehen Uhrzeit
    // und Titel manchmal in zwei getrennten Tabellenzeilen statt in einer
    // gemeinsamen Zelle. Eine Zelle, die NUR eine blanke Uhrzeit enthielt (kein
    // eigener Titel -> "Termin"-Fallback), gehoert dann zur unmittelbar
    // folgenden Zelle derselben Spalte, wenn die einen echten Titel ohne
    // eigene Uhrzeit hat - beide zu einem Termin zusammenfuehren.
    const merged = [];
    for (let i = 0; i < rawResults.length; i++) {
        const cur = rawResults[i];
        if (cur.__used)
            continue;
        const next = rawResults[i + 1];
        // "Termin" (echter Leer-Fallback) oder ein/zwei einzelne Zeichen (typisches
        // OCR-Rauschen, z.B. ein Rest der Rasterlinie, der als "l" gelesen wurde)
        // zaehlen beide als "diese Zelle enthielt nur die Uhrzeit, sonst nichts".
        const isBareTime = (cur.title === "Termin" || cur.title.length <= 2) && cur.startTime;
        const canMerge = isBareTime && next && next.block.column === cur.block.column
            && next.block.minY <= cur.block.maxY + 6 && next.title !== "Termin" && !next.startTime;
        if (canMerge) {
            merged.push({ block: cur.block, title: next.title, startTime: cur.startTime, endTime: cur.endTime });
            next.__used = true;
        }
        else {
            merged.push(cur);
        }
    }
    return merged.map((r, i) => {
        const date = new Date(mondayDate);
        date.setDate(mondayDate.getDate() + r.block.column);
        return { id: `blk-${i}`, title: r.title, date: isoDate(date), time: r.startTime, endTime: r.endTime };
    });
}
/* ============================================================
   DBB-SCORES-SCREENSHOT-IMPORT (fuer U12/U14/U16/U18 - JBBL/NBBL
   haben eigene, ausfuehrlichere Statistik-Quellen).
   Die DBB-Scores-App zeigt pro Spiel eine Spieler-Tabelle mit
   Trikot-Nummer (blauer Kreis) + Name links und 4 Werte-Spalten
   rechts, weil die App selbst keine breitere Ansicht anbietet
   muessen Trainer zwei Screenshots hochladen: einmal
   Minuten/Punkte/Feldwuerfe/FW%, einmal 2Pkt/3Pkt/Fouls/Plus-Minus.
   Beide Tabellen haben exakt das gleiche Zeilenraster (Trikot-Kreis
   in derselben Spalte, feste Zeilenhoehe), nur die 4 Werte-Spalten
   rechts unterscheiden sich - deshalb werden Zeilen anhand des
   blauen Trikot-Kreises erkannt statt anhand von Trennlinien.
   ============================================================ */
function findDbbRowBands(canvas) {
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext("2d").getImageData(0, 0, W, H).data;
    const badgeX = Math.round(W * 0.0908);
    function isBlue(r, g, b) { return b > 150 && b > r + 30 && b > g + 10 && r < 140; }
    const runs = [];
    let inRun = false, start = 0;
    for (let y = 0; y < H; y++) {
        const i = (y * W + badgeX) * 4;
        const blue = isBlue(data[i], data[i + 1], data[i + 2]);
        if (blue && !inRun) { inRun = true; start = y; }
        if (!blue && inRun) { inRun = false; if (y - start > 10) runs.push([start, y]); }
    }
    if (inRun) runs.push([start, H]);
    if (runs.length < 2)
        return [];
    const badgeH = runs[0][1] - runs[0][0];
    const rowH = runs[1][0] - runs[0][0];
    const pad = (rowH - badgeH) / 2;
    return runs.map(([bTop]) => ({ top: Math.round(bTop - pad), bottom: Math.round(bTop - pad + rowH) }));
}
function findDbbHeaderRegion(canvas, rowBands) {
    const W = canvas.width;
    const data = canvas.getContext("2d").getImageData(0, 0, W, canvas.height).data;
    const headerTop = rowBands.length ? Math.max(0, rowBands[0].top - 97) : 415;
    const headerBottom = rowBands.length ? rowBands[0].top : 515;
    // Drei Abtastzeilen ueber die Kopfzeilen-Hoehe verteilt: die "SPIELER/IN"-
    // Beschriftung links ist nur an einzelnen Textstrichen dunkel, die echte
    // dunkle Spalten-Kopfzeile rechts ist ueber ihre gesamte Hoehe durchgehend
    // dunkel gefuellt - so lassen sich beide zuverlaessig unterscheiden.
    const ys = [0.2, 0.5, 0.8].map((f) => Math.round(headerTop + (headerBottom - headerTop) * f));
    function luma(x, y) { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; }
    // Gleitender Mittelwert statt Pixel-fuer-Pixel-Test: einzelne helle Kanten-
    // /Antialiasing-Pixel innerhalb der dunklen Kopfzeile duerfen die Erkennung
    // nicht abbrechen lassen (sonst rutscht die Grenze zu weit nach rechts).
    const win = 30;
    let nameColEnd = Math.round(W * 0.5);
    for (let x = 0; x < W - win; x++) {
        let sum = 0;
        for (const y of ys) {
            for (let k = 0; k < win; k += 3)
                sum += luma(x + k, y);
        }
        const avg = sum / (ys.length * Math.ceil(win / 3));
        if (avg < 140) { nameColEnd = x; break; }
    }
    return { minX: nameColEnd, minY: headerTop, maxX: W, maxY: headerBottom };
}
async function findDbbColumnBands(worker, canvas, headerRegion) {
    const crop = prepareOcrCanvas(canvas, headerRegion, 4);
    const scale = crop.width / (headerRegion.maxX - headerRegion.minX + 8);
    await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz%/+- " });
    const result = await worker.recognize(crop);
    const words = (result.data.words || [])
        // Sehr schmale "Woerter" sind fast immer OCR-Rauschen an der Kante des
        // Zuschnitts (z.B. ein einzelnes Antialiasing-Pixel), keine echte Spalte.
        .filter((w) => w.text && w.text.trim() && (w.bbox.x1 - w.bbox.x0) > 15)
        .map((w) => (headerRegion.minX - 4) + (w.bbox.x0 + w.bbox.x1) / 2 / scale)
        .sort((a, b) => a - b);
    if (words.length === 0)
        return [];
    const bands = [];
    for (let i = 0; i < words.length; i++) {
        const prevMid = i === 0 ? headerRegion.minX : (words[i - 1] + words[i]) / 2;
        const nextMid = i === words.length - 1 ? headerRegion.maxX : (words[i] + words[i + 1]) / 2;
        bands.push({ minX: Math.round(prevMid), maxX: Math.round(nextMid) });
    }
    return bands;
}
async function extractDbbScoresScreenshot(imgEl, columnLabels, onProgress) {
    await loadTesseractScript();
    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    canvas.getContext("2d").drawImage(imgEl, 0, 0);
    const rowBands = findDbbRowBands(canvas);
    if (rowBands.length === 0)
        return { rows: [], error: "Konnte keine Spielerzeilen erkennen. Ist der Screenshot vollstaendig und unbeschnitten?" };
    const worker = typeof window.Tesseract.createWorker === "function" ? await window.Tesseract.createWorker() : null;
    if (worker) {
        await worker.load();
        await worker.loadLanguage("deu");
        await worker.initialize("deu");
    }
    if (!worker)
        return { rows: [], error: "Bilderkennungs-Bibliothek konnte nicht initialisiert werden." };
    try {
        const headerRegion = findDbbHeaderRegion(canvas, rowBands);
        const colBands = await findDbbColumnBands(worker, canvas, headerRegion);
        if (colBands.length !== columnLabels.length) {
            return { rows: [], error: `Es wurden ${colBands.length} statt ${columnLabels.length} Spalten erkannt - bitte prüfen, ob der Screenshot die Spalten ${columnLabels.join(", ")} unbeschnitten zeigt, und erneut hochladen.` };
        }
        const nameRegion = { minX: Math.round(canvas.width * 0.14), maxX: headerRegion.minX - 8 };
        const rows = [];
        for (let i = 0; i < rowBands.length; i++) {
            const band = rowBands[i];
            if (onProgress)
                onProgress(i + 1, rowBands.length);
            await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß- " });
            const nameText = (await worker.recognize(prepareOcrCanvas(canvas, { minX: nameRegion.minX, minY: band.top, maxX: nameRegion.maxX, maxY: band.bottom }, 2))).data.text.trim().replace(/\s+/g, " ");
            if (!nameText)
                continue;
            const values = {};
            await worker.setParameters({ tessedit_char_whitelist: "0123456789:.%/-+ " });
            for (let c = 0; c < colBands.length; c++) {
                const cell = { minX: colBands[c].minX, minY: band.top, maxX: colBands[c].maxX, maxY: band.bottom };
                const text = (await worker.recognize(prepareOcrCanvas(canvas, cell, 2))).data.text.trim().replace(/\s+/g, " ");
                values[columnLabels[c]] = text;
            }
            rows.push({ name: nameText, values });
        }
        return { rows, error: rows.length === 0 ? "Keine Spielerzeilen gefunden." : null };
    }
    finally {
        await worker.terminate();
    }
}
