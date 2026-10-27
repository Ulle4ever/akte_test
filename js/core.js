// core.js - Grundkonstanten (Positionen, Status, Kategorien), Datums-/Format-Helfer und die Parser fuer CSV-, Boxscore- und ICS-Importe.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const POSITIONS = ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"];
const POSITION_ABBR = { "Point Guard": "PG", "Shooting Guard": "SG", "Small Forward": "SF", "Power Forward": "PF", "Center": "C" };
const STATUS_OPTIONS = [
    { value: "aktiv", label: "Aktiv" },
    { value: "verletzt", label: "Verletzt" },
    { value: "reha", label: "Reha" },
];
const STATUS_STYLES = {
    aktiv: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700" },
    verletzt: { dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 border-rose-200", text: "text-rose-700" },
    reha: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-700" },
};
// Verletzung/Reha: Grund + voraussichtliches Rueckkehrdatum (injuryUntil),
// daraus zaehlt die App die verbleibenden Tage herunter.
const INJURY_STATUSES = ["verletzt", "reha"];
function isInjured(p) {
    return !!p && INJURY_STATUSES.includes(p.status);
}
function addDaysIso(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysUntilIso(iso) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((new Date(iso + "T00:00:00") - t) / 86400000);
}
// { days, label, overdue } fuer verletzte Spieler, sonst null
function injuryCountdown(p) {
    if (!isInjured(p))
        return null;
    if (!p.injuryUntil)
        return { days: null, label: "Dauer offen", overdue: false };
    const days = daysUntilIso(p.injuryUntil);
    if (days > 1)
        return { days, label: `noch ${days} Tage`, overdue: false };
    if (days === 1)
        return { days, label: "noch 1 Tag", overdue: false };
    if (days === 0)
        return { days, label: "Rückkehr heute", overdue: false };
    return { days, label: `Rückkehr überfällig (${-days} T.)`, overdue: true };
}
const VIDEO_TYPES = ["Spielszene", "Trainingsdrill", "Analyse", "Wurftechnik"];
const RADAR_SKILLS = [
    { id: "wurf", label: "Wurf", autoCapable: true, defaultMode: "auto" },
    { id: "verteidigung", label: "Verteidigung", autoCapable: true, defaultMode: "manual" },
    { id: "athletik", label: "Athletik", autoCapable: true, defaultMode: "auto" },
    { id: "spielintelligenz", label: "Spielintelligenz", autoCapable: false, defaultMode: "manual" },
    { id: "teamplay", label: "Teamplay", autoCapable: false, defaultMode: "manual" },
];
// Welche Test-Richtung "besser" bedeutet, fürs automatische Athletik-Achse (nur Standard-Testarten,
// eigene/umbenannte Testarten werden für die Automatik ignoriert).
const TEST_DIRECTION = { sprint20: "lower", laneAgility: "lower", cmj: "higher", beepTest: "higher", bench1rm: "higher" };
function normalizeMinMax(value, min, max) {
    if (min === max)
        return 5;
    const t = (value - min) / (max - min);
    return Math.round((1 + t * 9) * 10) / 10;
}
function computeAutoRadar(teamPlayers, statCategories, privateData, isTrainer, testTypes) {
    const labelToTestTypeId = {};
    (testTypes || []).forEach((t) => { labelToTestTypeId[t.label] = t.id; });
    const hasField = (id) => statCategories.some((c) => c.fields.some((f) => f.id === id));
    const shootingFieldIds = ["fg", "tp", "ft"].filter(hasField);
    const hasSteals = hasField("steals");
    const hasBlocks = hasField("blocks");
    const wurfRaw = {}, defRaw = {}, athRawByType = {};
    teamPlayers.forEach((p) => {
        const stats = p.stats || [];
        if (shootingFieldIds.length && stats.length) {
            let pctSum = 0, pctCount = 0;
            shootingFieldIds.forEach((fid) => {
                const made = stats.reduce((s, e) => s + (Number(e[`${fid}_m`]) || 0), 0);
                const att = stats.reduce((s, e) => s + (Number(e[`${fid}_a`]) || 0), 0);
                if (att > 0) {
                    pctSum += (made / att) * 100;
                    pctCount++;
                }
            });
            if (pctCount > 0)
                wurfRaw[p.id] = pctSum / pctCount;
        }
        if ((hasSteals || hasBlocks) && stats.length) {
            const stealsAvg = hasSteals ? stats.reduce((s, e) => s + (Number(e.steals) || 0), 0) / stats.length : 0;
            const blocksAvg = hasBlocks ? stats.reduce((s, e) => s + (Number(e.blocks) || 0), 0) / stats.length : 0;
            defRaw[p.id] = stealsAvg + blocksAvg;
        }
        if (isTrainer) {
            const tests = (privateData[p.id]?.tests) || [];
            const latestByType = {};
            tests.forEach((t) => { if (!latestByType[t.testType] || t.date > latestByType[t.testType].date)
                latestByType[t.testType] = t; });
            Object.entries(latestByType).forEach(([label, t]) => {
                const typeId = labelToTestTypeId[label] || label;
                if (!TEST_DIRECTION[typeId])
                    return;
                const val = Number(t.result);
                if (isNaN(val))
                    return;
                athRawByType[typeId] = athRawByType[typeId] || {};
                athRawByType[typeId][p.id] = val;
            });
        }
    });
    const wurfVals = Object.values(wurfRaw);
    const wurfMin = Math.min(...wurfVals), wurfMax = Math.max(...wurfVals);
    const defVals = Object.values(defRaw);
    const defMin = Math.min(...defVals), defMax = Math.max(...defVals);
    const athNormByPlayer = {};
    Object.entries(athRawByType).forEach(([typeId, byPlayer]) => {
        const vals = Object.values(byPlayer);
        const min = Math.min(...vals), max = Math.max(...vals);
        const invert = TEST_DIRECTION[typeId] === "lower";
        Object.entries(byPlayer).forEach(([pid, val]) => {
            let t = min === max ? 0.5 : (val - min) / (max - min);
            if (invert)
                t = 1 - t;
            athNormByPlayer[pid] = athNormByPlayer[pid] || [];
            athNormByPlayer[pid].push(t);
        });
    });
    const result = {};
    teamPlayers.forEach((p) => {
        const athScores = athNormByPlayer[p.id];
        result[p.id] = {
            wurf: wurfRaw[p.id] !== undefined ? normalizeMinMax(wurfRaw[p.id], wurfMin, wurfMax) : null,
            verteidigung: defRaw[p.id] !== undefined ? normalizeMinMax(defRaw[p.id], defMin, defMax) : null,
            athletik: athScores && athScores.length ? Math.round((1 + (athScores.reduce((a, b) => a + b, 0) / athScores.length) * 9) * 10) / 10 : null,
        };
    });
    return result;
}
const HANDEDNESS_LABELS = { rechts: "Rechts", links: "Links", beidhaendig: "Beidhändig" };
const NOTE_CATEGORIES = [
    { value: "technisch", label: "Technisch" },
    { value: "taktisch", label: "Taktisch" },
    { value: "athletisch", label: "Athletisch" },
    { value: "mental", label: "Mental" },
];
const CATEGORY_STYLES = {
    technisch: "bg-blue-50 text-blue-700 border-blue-200",
    taktisch: "bg-purple-50 text-purple-700 border-purple-200",
    athletisch: "bg-red-50 text-red-700 border-red-200",
    mental: "bg-pink-50 text-pink-700 border-pink-200",
};
const GRADE_OPTIONS = ["1+", "1", "1-", "2+", "2", "2-", "3+", "3", "3-", "4+", "4", "4-", "5+", "5", "5-", "6"];
const GRADE_CRITICAL_INDEX = GRADE_OPTIONS.indexOf("3-");
// Bewusst entfernte Statistik-Kategorien - werden beim Laden/Speichern immer
// herausgefiltert, auch wenn eine alte App-Version sie zurueckschreibt.
const REMOVED_STAT_CATEGORY_IDS = ["hustle"];
const DEFAULT_STAT_CATEGORIES = [
    {
        id: "normal", label: "Normale Statistiken",
        fields: [
            { id: "punkte", label: "Punkte", kind: "number" },
            { id: "rebounds", label: "Rebounds", kind: "number" },
            { id: "assists", label: "Assists", kind: "number" },
            { id: "blocks", label: "Blocks", kind: "number" },
            { id: "steals", label: "Steals", kind: "number" },
            { id: "turnovers", label: "Turnovers", kind: "number" },
        ],
    },
    {
        id: "shooting", label: "Wurfquoten",
        fields: [
            { id: "fg", label: "Feldwürfe", kind: "shooting" },
            { id: "tp", label: "Dreier", kind: "shooting" },
            { id: "ft", label: "Freiwürfe", kind: "shooting" },
        ],
    },
];
// Advanced Stats (ORtg, TS%, USG% ...) sind vorerst ausgeblendet. Kategorie,
// Werte und Import-Code bleiben erhalten - zum Wiedereinschalten auf true setzen.
const ADVANCED_STATS_ENABLED = false;
function visibleStatCategories(cats) {
    return ADVANCED_STATS_ENABLED ? cats : cats.filter((c) => c.id !== "advanced");
}
// Datenschutzhinweis: nur ein Entwurf - der Verein passt ihn in der Verwaltung
// an (Platzhalter in [eckigen Klammern]) und schaltet die Abfrage erst dann ein.
// Jede Textaenderung erhoeht die Version, Spieler-Zugaenge bestaetigen neu.
const DEFAULT_PRIVACY_TEXT = `Datenschutzhinweis zur Spieler-Akte

Verantwortlich
[Name des Vereins], [Anschrift], [E-Mail-Adresse]
Ansprechpartner für Datenschutz: [Name, E-Mail]

Wofür wir die Spieler-Akte nutzen
Die Spieler-Akte dient der sportlichen Betreuung und Entwicklung unserer Spielerinnen und Spieler: Planung von Training und Spielen, Auswertung von Spielstatistiken, Steuerung der Trainingsbelastung und Rücksicht auf Verletzungen.

Welche Daten gespeichert werden
- Stammdaten: Name, Geburtsdatum, Trikotnummer, Position, Größe, Gewicht, Schule, Wohnort, Porträtfoto
- Kontaktdaten und Notfallkontakt
- Spielstatistiken, Trainingsanwesenheit und Athletik-Tests
- Angaben zu Belastung und Befinden (Wellness-Abfrage) sowie Verletzungen mit Grund und voraussichtlicher Ausfallzeit – das sind Gesundheitsdaten
- Notizen, Feedback und Entwicklungspläne der Trainer

Wer die Daten sieht
Die Trainer des eigenen Teams und die sportliche Leitung des Vereins. Spielerinnen und Spieler sehen nur ihre eigenen Daten. Eine Weitergabe an Dritte findet nicht statt.

Wo die Daten liegen
Die Daten werden bei Google Firebase auf Servern in der EU gespeichert. Porträtfotos liegen beim Bilddienst Cloudinary. [Bitte prüfen: Serverstandort und Auftragsverarbeitungsvertrag]

Wie lange die Daten gespeichert werden
Bis zum Ende der Mitgliedschaft im Verein bzw. bis zum Ausscheiden aus dem Team, danach werden sie innerhalb von [Frist] gelöscht. Einträge zu Belastung und Befinden werden automatisch nach 6 Wochen gelöscht.

Deine Rechte
Du kannst jederzeit Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen und deine Einwilligung für die Zukunft widerrufen. Eine Nachricht an [E-Mail-Adresse] genügt.

Minderjährige
Bei Spielerinnen und Spielern unter 16 Jahren müssen die Erziehungsberechtigten zustimmen.`;
const DEFAULT_TEST_TYPES = [
    { id: "sprint20", label: "Sprint 20m" },
    { id: "cmj", label: "Vertikalsprung (CMJ)" },
    { id: "laneAgility", label: "Lane Agility" },
    { id: "beepTest", label: "Beep-Test" },
    { id: "bench1rm", label: "Bankdrücken 1RM" },
];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Lokales Datum (nicht UTC - sonst waere es zwischen 0 und 2 Uhr noch "gestern")
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Saisonbeginn (1. August) der laufenden Saison
function seasonStartIso() {
    const d = new Date();
    return `${d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1}-08-01`;
}
function isoWeekKey(dateStr) {
    // Datum bewusst direkt als UTC-Mitternacht des Y-M-D bauen statt per
    // "new Date(str + 'T00:00:00')" lokal zu parsen - sonst verschieben
    // Zeitzonen mit Offset (z.B. Europe/Berlin) das Datum bei den folgenden
    // UTC-Methoden um einen Tag, was Termine derselben Kalenderwoche je nach
    // Wochentag in unterschiedliche ISO-Wochen einsortieren konnte.
    const [y, m, day0] = (dateStr || today()).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, day0));
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function currentWeekMonday() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    monday.setHours(0, 0, 0, 0);
    return monday;
}
function mondayOfIsoWeek(year, week) {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Monday = new Date(year, 0, 4 - jan4Day);
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (week - 1) * 7);
    return monday;
}
function formatWeekRange(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    return `${fmt(monday)} – ${fmt(sunday)}${sunday.getFullYear()}`;
}
const WELLNESS_SCALE_FIELDS = [
    { id: "soreness", label: "Muskelkater / Erschöpfung", lowLabel: "Stark erschöpft", highLabel: "Frisch & erholt" },
    { id: "energy", label: "Energie / Stimmung", lowLabel: "Sehr niedrig", highLabel: "Top drauf" },
    { id: "stress", label: "Stress (Schule/Alltag)", lowLabel: "Sehr entspannt", highLabel: "Sehr gestresst" },
];
const sortByDateDesc = (arr) => [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
const fmtDate = (d) => {
    if (!d)
        return "–";
    const dt = new Date(d);
    if (isNaN(dt))
        return d;
    return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const calcAge = (birthdate) => {
    if (!birthdate)
        return null;
    const bd = new Date(birthdate);
    if (isNaN(bd))
        return null;
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const beforeBirthdayThisYear = today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate());
    if (beforeBirthdayThisYear)
        age--;
    return age;
};
const pct = (made, att) => (att ? Math.round((Number(made) / Number(att)) * 1000) / 10 : null);
const splitName = (fullName) => {
    const parts = (fullName || "").trim().split(/\s+/);
    if (parts.length <= 1)
        return { first: "", last: fullName || "" };
    return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
};
const fmtNum = (v, d = 1) => {
    const n = Number(v);
    if (v === undefined || v === null || v === "" || isNaN(n))
        return "–";
    return n.toFixed(d).replace(".", ",");
};
const getEmbedUrl = (url) => {
    try {
        const u = new URL(url);
        if (u.hostname.includes("youtube.com")) {
            const id = u.searchParams.get("v");
            if (id)
                return `https://www.youtube.com/embed/${id}`;
            const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
            if (shorts)
                return `https://www.youtube.com/embed/${shorts[1]}`;
        }
        if (u.hostname === "youtu.be") {
            const id = u.pathname.slice(1);
            if (id)
                return `https://www.youtube.com/embed/${id}`;
        }
        if (u.hostname.includes("drive.google.com")) {
            const m = u.pathname.match(/\/file\/d\/([^/]+)/);
            if (m)
                return `https://drive.google.com/file/d/${m[1]}/preview`;
        }
    }
    catch (e) { /* invalid URL, no embed */ }
    return null;
};
const normalizeName = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function codeToEmail(code) {
    return `${code.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@spieler-akte.local`;
}
function codeToPassword(code) {
    return code.trim().toLowerCase() + "-sak26!";
}
function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 8; i++)
        out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}
const findFieldId = (statCategories, labels) => {
    for (const c of statCategories) {
        const f = c.fields.find((f) => labels.includes(f.label.toLowerCase()));
        if (f)
            return f.id;
    }
    return null;
};
function parseGermanNumber(s) {
    if (s === undefined || s === null)
        return 0;
    const cleaned = String(s).replace("%", "").trim().replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}
function splitCsvLine(line, delimiter) {
    return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
}
function parseAttendanceCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
    const delimiter = (lines[0] || "").split(";").length > (lines[0] || "").split(",").length ? ";" : ",";
    let headerIdx = -1;
    let cols = {};
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const cells = splitCsvLine(lines[i], delimiter).map((c) => c.toLowerCase());
        const nameIdx = cells.findIndex((c) => c === "spieler" || c.includes("spieler") && !c.includes("id") && !c.includes("team"));
        const teamIdx = cells.findIndex((c) => c.includes("team"));
        if (nameIdx !== -1 && teamIdx !== -1) {
            headerIdx = i;
            cols = {
                name: nameIdx,
                team: teamIdx,
                anwesend: cells.findIndex((c) => c === "anwesend"),
                abwesend: cells.findIndex((c) => c === "abwesend"),
                entschuldigt: cells.findIndex((c) => c.includes("entschuldigt")),
                gesamt: cells.findIndex((c) => c.includes("gesamt")),
            };
            break;
        }
    }
    if (headerIdx === -1)
        return { rows: [], error: "Konnte die Spalten \"Spieler\" und \"Stammteam\" nicht finden. Ist das die richtige Datei/Seite?" };
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i], delimiter);
        if (/automatische wochen|aktuelle kw|vorwoche/i.test(cells[0] || ""))
            continue;
        const name = (cells[cols.name] || "").trim();
        if (!name)
            continue;
        const team = (cells[cols.team] || "").trim();
        rows.push({
            name,
            team: team === "0" ? "" : team,
            anwesend: cols.anwesend !== -1 ? Math.round(parseGermanNumber(cells[cols.anwesend])) : 0,
            abwesend: cols.abwesend !== -1 ? Math.round(parseGermanNumber(cells[cols.abwesend])) : 0,
            entschuldigt: cols.entschuldigt !== -1 ? Math.round(parseGermanNumber(cells[cols.entschuldigt])) : 0,
            einheitenGesamt: cols.gesamt !== -1 ? Math.round(parseGermanNumber(cells[cols.gesamt])) : 0,
        });
    }
    return { rows, error: null };
}
const BOX_ALIASES = {
    min: ["min", "minuten", "mp", "gespielte minuten"],
    pts: ["pts", "punkte", "points", "p"],
    reb: ["reb", "rebounds", "tr", "trb", "rb"],
    as: ["as", "ast", "assists", "a"],
    st: ["st", "stl", "steals"],
    bl: ["bl", "blk", "blocks"],
    to: ["to", "tov", "turnovers", "ballverluste", "tos"],
    f: ["f", "pf", "fouls", "fouls (pf)", "fouls(pf)"],
    or: ["or", "orb", "off. reb", "offensiverebounds", "oreb", "reb off"],
    dr: ["dr", "drb", "def. reb", "defensiverebounds", "dreb", "reb def"],
    ef: ["ef", "eff", "effizienz", "efficiency"],
    fgm: ["fgm", "fg m", "fg-m"],
    fga: ["fga", "fg a", "fg-a"],
    "3pm": ["3pm", "tpm", "3p m", "3p-m", "dreier m"],
    "3pa": ["3pa", "tpa", "3p a", "3p-a", "dreier a"],
    ftm: ["ftm", "ft m", "ft-m"],
    fta: ["fta", "ft a", "ft-a"],
    fg_combo: ["fg"],
    tp_combo: ["3fg", "3pt", "3-pt", "threes", "dreier"],
    ft_combo: ["ft"],
};
const TOTALS_ROW_RE = /^(team\s*)?(totals?|gesamt|summe)$/i;
const NAME_HEADER_RE = /^(name|spieler|player)$/i;
const NUM_HEADER_RE = /^(nr\.?|nummer|#|number|no\.?)$/i;
// ProA-Liveticker (2. Basketball-Bundesliga), Boxscore ohne Kopfzeile kopiert:
// "#10 Name", dann je Spieler 23 Zahlen in fester Reihenfolge:
// Min | 2P m-a-% | 3P m-a-% | FG m-a-% | FW m-a-% | Pkt Ass | OR-DR-REB | PF BS ST TO EFF
// Auch die ganze Seite (Strg+A) geht: Play-by-Play-Zeilen fallen raus, beide
// Teams werden erkannt (Team-Name steht vor den Spielerkarten "#0 Name / P F",
// "Gesamt" schliesst die Tabelle eines Teams ab).
const PROA_PLAYER_LINE_RE = /^#(\d+)\s+(\S.*)$/;
const PROA_VALUES_PER_PLAYER = 23;
function parseProaBoxscoreLines(lines) {
    const players = [];
    const teamLabels = [];
    let section = 0;
    let lastPlain = null;
    let i = 0;
    while (i < lines.length) {
        const head = lines[i].match(PROA_PLAYER_LINE_RE);
        if (!head) {
            if (/^gesamt\b/i.test(lines[i]))
                section++;
            else if (/[a-zäöü]/i.test(lines[i]) && !/[:\t]/.test(lines[i]))
                lastPlain = lines[i];
            i++;
            continue;
        }
        if (/^P\s+F$/.test(lines[i + 1] || "") && teamLabels[section] === undefined)
            teamLabels[section] = lastPlain;
        const tokens = [];
        let j = i + 1;
        while (j < lines.length && !PROA_PLAYER_LINE_RE.test(lines[j]) && !/^(teamaktionen|gesamt)/i.test(lines[j])) {
            // "3 - 6 - 50%" / "3-6-50%": Bindestriche zwischen Zahlen sind Trenner, kein Minus
            tokens.push(...(lines[j].replace(/(\d)\s*-\s*(?=\d)/g, "$1 ").match(/\d{1,3}:\d{2}|-?\d+/g) || []));
            if (/[a-zäöü]/i.test(lines[j]) && !/[:\t]/.test(lines[j]))
                lastPlain = lines[j];
            j++;
        }
        i = j;
        if (tokens.length < PROA_VALUES_PER_PLAYER || !tokens[0].includes(":"))
            continue;
        const [mm, ss] = tokens[0].split(":").map(Number);
        const v = tokens.slice(1).map((t) => parseInt(t, 10));
        // v: 0-2 2P, 3-5 3P, 6-8 FG, 9-11 FW, 12 Pkt, 13 Ass, 14 OR, 15 DR, 16 REB, 17 PF, 18 BS, 19 ST, 20 TO, 21 EFF
        players.push({
            number: parseInt(head[1], 10), name: head[2].trim(), team: teamLabels[section] || null,
            minuten: Math.round((mm + ss / 60) * 10) / 10,
            punkte: v[12], assists: v[13], rebOff: v[14], rebDef: v[15], rebounds: v[16],
            fouls: v[17], blocks: v[18], steals: v[19], turnovers: v[20], eff: v[21],
            fgm: v[6], fga: v[7], tpm: v[3], tpa: v[4], ftm: v[9], fta: v[10],
        });
    }
    return { players, error: players.length === 0 ? "Keine Spielerzeilen im ProA-Boxscore erkannt." : null };
}
function parseBoxscoreText(text) {
    const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l.length > 0);
    let headerIdx = -1;
    for (let idx = 0; idx < lines.length; idx++) {
        if (!lines[idx].includes("\t"))
            continue;
        const cells = lines[idx].split("\t").map((c) => c.trim().toLowerCase());
        const hasMin = cells.some((c) => BOX_ALIASES.min.includes(c));
        const hasPts = cells.some((c) => BOX_ALIASES.pts.includes(c));
        if (hasMin && hasPts) {
            headerIdx = idx;
            break;
        }
    }
    if (headerIdx === -1 && lines.some((l) => PROA_PLAYER_LINE_RE.test(l)))
        return parseProaBoxscoreLines(lines);
    if (headerIdx === -1)
        return { players: [], error: "Konnte die Kopfzeile mit Minuten- und Punkte-Spalte nicht finden. Wurde die Tabelle komplett kopiert?" };
    const headerCellsRaw = lines[headerIdx].split("\t").map((c) => c.trim());
    const headerCells = headerCellsRaw.map((c) => c.toLowerCase());
    const nameColIdx = headerCells.findIndex((c) => NAME_HEADER_RE.test(c));
    const numColIdx = headerCells.findIndex((c) => NUM_HEADER_RE.test(c));
    const hasSeparateNameCol = nameColIdx !== -1;
    // colIndex maps canonical stat key -> column index within a per-player data row.
    // In "separate columns" layout, the data row IS the header row's own indexing.
    // In the "combined Nr.+Name" layout (NBBL-style), number+name arrive as their own lines
    // before the tab-separated data row, which therefore excludes the header's first column.
    const colIndex = {};
    const offset = hasSeparateNameCol ? 0 : 1;
    headerCells.forEach((c, i) => {
        if (i < offset)
            return;
        for (const [canon, aliases] of Object.entries(BOX_ALIASES)) {
            if (aliases.includes(c))
                colIndex[canon] = i - offset;
        }
    });
    function buildPlayer(number, name, cells) {
        const get = (key) => {
            const idx = colIndex[key];
            if (idx === undefined || idx >= cells.length)
                return null;
            const v = (cells[idx] || "").trim().replace(",", ".");
            if (v === "")
                return null;
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };
        const getCombo = (comboKey, madeKey, attKey) => {
            const idx = colIndex[comboKey];
            if (idx !== undefined && idx < cells.length) {
                const raw = (cells[idx] || "").trim();
                const m = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (m)
                    return { made: parseInt(m[1], 10), att: parseInt(m[2], 10) };
            }
            const made = get(madeKey), att = get(attKey);
            return { made, att };
        };
        const minRaw = colIndex["min"] !== undefined ? (cells[colIndex["min"]] || "").trim() : "";
        let minuten = 0;
        if (minRaw.includes(":")) {
            const [mm, ss] = minRaw.split(":").map(Number);
            minuten = Math.round(((mm || 0) + (ss || 0) / 60) * 10) / 10;
        }
        else if (minRaw) {
            minuten = Math.round((parseFloat(minRaw.replace(",", ".")) || 0) * 10) / 10;
        }
        const fg = getCombo("fg_combo", "fgm", "fga");
        const tp = getCombo("tp_combo", "3pm", "3pa");
        const ft = getCombo("ft_combo", "ftm", "fta");
        const rebOff = get("or"), rebDef = get("dr");
        let rebounds = get("reb");
        if (rebounds === null && (rebOff !== null || rebDef !== null))
            rebounds = (rebOff || 0) + (rebDef || 0);
        return {
            number, name, minuten,
            punkte: get("pts"), rebounds, assists: get("as"), steals: get("st"),
            blocks: get("bl"), turnovers: get("to"), fouls: get("f"),
            rebOff, rebDef, eff: get("ef"),
            fgm: fg.made, fga: fg.att,
            tpm: tp.made, tpa: tp.att,
            ftm: ft.made, fta: ft.att,
        };
    }
    const players = [];
    if (hasSeparateNameCol) {
        // Layout B: one tab-separated line per player, number and name are their own columns.
        for (let i = headerIdx + 1; i < lines.length; i++) {
            if (!lines[i].includes("\t"))
                continue;
            let cells = lines[i].split("\t").map((c) => c.trim());
            // Some exports drop the number cell entirely (not even an empty one) when it's blank,
            // shifting every later column left by one. Detect and realign when plausible.
            if (numColIdx === 0 && cells.length === headerCells.length - 1 && !/^\d+$/.test(cells[0])) {
                cells = ["", ...cells];
            }
            const name = cells[nameColIdx] || "";
            if (!name || TOTALS_ROW_RE.test(name.trim()))
                continue;
            const number = numColIdx !== -1 ? parseInt((cells[numColIdx] || "").replace(/\D/g, ""), 10) : NaN;
            players.push(buildPlayer(isNaN(number) ? null : number, name, cells));
        }
    }
    else {
        // Layout A (NBBL-style): jersey number on its own line, name on the next line(s),
        // then a tab-separated data row (which does not repeat the number/name).
        let i = headerIdx + 1;
        while (i < lines.length) {
            const line = lines[i];
            if (/^\d+$/.test(line)) {
                const number = parseInt(line, 10);
                let j = i + 1;
                const nameParts = [];
                while (j < lines.length && !lines[j].includes("\t")) {
                    nameParts.push(lines[j]);
                    j++;
                }
                if (j < lines.length && lines[j].includes("\t")) {
                    const cells = lines[j].split("\t").map((c) => c.trim());
                    players.push(buildPlayer(number, nameParts.join(" ").trim(), cells));
                    i = j + 1;
                }
                else {
                    i = j;
                }
            }
            else {
                i++;
            }
        }
    }
    return { players, error: players.length === 0 ? "Keine Spielerzeilen erkannt. Falls das Format von einer anderen Seite kommt, schick mir gern ein Beispiel, dann passe ich die Erkennung an." : null };
}
function parseAdvancedStatsCsv(text) {
    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
    if (lines.length === 0)
        return { rows: [], error: "Datei ist leer." };
    const headerCells = lines[0].split(";").map((c) => c.trim());
    const nameIdx = headerCells.findIndex((c) => c.toLowerCase() === "spieler");
    if (nameIdx === -1)
        return { rows: [], error: "Konnte die Spalte \"Spieler\" nicht finden." };
    const skipCols = new Set(["mp", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "punkte"]);
    const advancedCols = headerCells
        .map((c, i) => ({ label: c.trim(), idx: i }))
        .filter((c) => c.idx !== nameIdx && !skipCols.has(c.label.toLowerCase()));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(";").map((c) => c.trim().replace(/^"|"$/g, ""));
        const name = cells[nameIdx];
        if (!name)
            continue;
        const values = {};
        advancedCols.forEach((c) => {
            const raw = cells[c.idx];
            if (raw === undefined || raw === "")
                return;
            const num = parseGermanNumber(raw);
            values[c.label] = num;
        });
        rows.push({ name, values });
    }
    return { rows, error: rows.length === 0 ? "Keine Spielerzeilen gefunden." : null };
}
function unfoldIcsLines(text) {
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rawLines = clean.split(/\r\n|\n|\r/);
    const lines = [];
    for (const line of rawLines) {
        if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
            lines[lines.length - 1] += line.slice(1);
        }
        else {
            lines.push(line);
        }
    }
    return lines;
}
function unescapeIcsText(s) {
    return (s || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseIcsDateTime(value) {
    const clean = (value || "").split(";").pop();
    const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m)
        return null;
    const [, y, mo, d, h, mi, se, z] = m;
    if (h === undefined)
        return { date: `${y}-${mo}-${d}`, time: "", isAllDay: true };
    if (z) {
        const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se));
        return { date: isoDate(dt), time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`, isAllDay: false };
    }
    return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, isAllDay: false };
}
const ICS_WEEKDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function expandWeeklyIcsRule(startDate, startTime, isAllDay, rrule) {
    const interval = Number(rrule.INTERVAL) || 1;
    const start = new Date(startDate + "T00:00:00");
    const byday = rrule.BYDAY ? rrule.BYDAY.split(",").map((d) => ICS_WEEKDAY_MAP[d.trim()]).filter((d) => d !== undefined) : [start.getDay()];
    let until = null;
    if (rrule.UNTIL) {
        const p = parseIcsDateTime(rrule.UNTIL);
        if (p)
            until = new Date(p.date + "T23:59:59");
    }
    const count = rrule.COUNT ? Number(rrule.COUNT) : null;
    const maxCap = 300;
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const results = [];
    let weekIndex = 0;
    while (results.length < maxCap && weekIndex < 520) {
        const thisWeekStart = new Date(weekStart);
        thisWeekStart.setDate(thisWeekStart.getDate() + weekIndex * 7 * interval);
        if (until && thisWeekStart > until)
            break;
        if (!until && !count && weekIndex >= 104)
            break;
        byday.forEach((wd) => {
            const occ = new Date(thisWeekStart);
            occ.setDate(occ.getDate() + wd);
            if (occ < start)
                return;
            if (until && occ > until)
                return;
            results.push(isoDate(occ));
        });
        weekIndex++;
    }
    results.sort();
    const limited = count ? results.slice(0, count) : results;
    return limited.slice(0, maxCap).map((date) => ({ date, time: startTime, isAllDay }));
}
function parseIcsRRule(rruleStr) {
    const parts = {};
    rruleStr.split(";").forEach((p) => {
        const [k, v] = p.split("=");
        if (k)
            parts[k.trim().toUpperCase()] = v;
    });
    return parts;
}
function parseIcsFile(text) {
    try {
        const lines = unfoldIcsLines(text);
        const rawEvents = [];
        let cur = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "BEGIN:VEVENT") {
                cur = {};
                continue;
            }
            if (trimmed === "END:VEVENT") {
                if (cur)
                    rawEvents.push(cur);
                cur = null;
                continue;
            }
            if (!cur)
                continue;
            const idx = line.indexOf(":");
            if (idx === -1)
                continue;
            const rawKey = line.slice(0, idx);
            const value = line.slice(idx + 1);
            const key = rawKey.split(";")[0].toUpperCase();
            if (key === "SUMMARY")
                cur.title = unescapeIcsText(value);
            else if (key === "LOCATION")
                cur.location = unescapeIcsText(value);
            else if (key === "DTSTART")
                cur.dtstart = value;
            else if (key === "RRULE")
                cur.rrule = value;
            else if (key === "UID")
                cur.uid = value;
        }
        if (rawEvents.length === 0)
            return { events: [], error: "Keine Termine (VEVENT) in der Datei gefunden. Ist es wirklich eine .ics-Datei?" };
        let result = [];
        let truncated = false;
        rawEvents.forEach((ev, idx) => {
            if (!ev.dtstart)
                return;
            const start = parseIcsDateTime(ev.dtstart);
            if (!start)
                return;
            const rrule = ev.rrule ? parseIcsRRule(ev.rrule) : null;
            const occurrences = rrule && rrule.FREQ === "WEEKLY"
                ? expandWeeklyIcsRule(start.date, start.time, start.isAllDay, rrule)
                : [{ date: start.date, time: start.time, isAllDay: start.isAllDay }];
            occurrences.forEach((occ) => {
                result.push({ id: `${ev.uid || idx}-${occ.date}-${occ.time}`, title: ev.title || "Ohne Titel", date: occ.date, time: occ.isAllDay ? "" : occ.time, location: ev.location || "" });
            });
        });
        result.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
        if (result.length > 400) {
            result = result.slice(0, 400);
            truncated = true;
        }
        return { events: result, error: result.length === 0 ? "Keine verwertbaren Termine gefunden." : null, truncated };
    }
    catch (e) {
        return { events: [], error: "Datei konnte nicht gelesen werden. Ist es wirklich eine .ics-Datei?" };
    }
}
