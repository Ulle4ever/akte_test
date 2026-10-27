/* ============================================================
   PUSH-BENACHRICHTIGUNGEN - Cloud Functions
   Zwei Trigger:
   1. onCalendarEventCreated: sobald ein neuer Kalender-Termin angelegt
      wird, bekommen alle betroffenen Spieler (Team- oder Einzel-
      Zuordnung, wie im Kalender selbst) eine Push-Benachrichtigung.
   2. dailyMonitoringReminder: laeuft taeglich um 18 Uhr und erinnert
      alle Spieler, die diese Woche noch kein Wellness-/Monitoring-
      Check-in gemacht haben.

   Dazu der DBB-Abgleich (syncDbbScheduled Fr 7 Uhr + So 22 Uhr / syncDbbNow per Klick): holt fuer jedes
   Team mit hinterlegter DBB-Team-ID Spielplan, Ergebnisse und Tabelle von
   basketball-bund.net, speichert sie in dbbTeams/{teamId} und traegt die
   Spiele in den Kalender ein.

   Deploy: siehe README.md im Projekt-Wurzelverzeichnis.
   ============================================================ */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

function isoWeekKey(dateStr) {
    const d = new Date(dateStr + "T00:00:00Z");
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatDateDE(dateStr) {
    const parts = (dateStr || "").split("-");
    if (parts.length !== 3)
        return dateStr;
    const [y, m, d] = parts;
    return `${d}.${m}.${y}`;
}

// Heutiges Datum in deutscher Zeit (die Functions laufen in UTC)
function todayIso() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
}
function addDaysIsoFn(iso, days) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
// Team-Zugriff eines Trainer-Zugangs: Liste oder null (= Main Account)
function accountTeamIdsFn(acc) {
    if (Array.isArray(acc.teamIds) && acc.teamIds.length)
        return acc.teamIds;
    return acc.teamId ? [acc.teamId] : null;
}

// Exakt dieselbe Logik wie getEventAttendees() in index.html - welche
// Spieler ein Kalender-Termin betrifft (Team-Zuordnung minus Ausnahmen,
// plus einzeln eingeladene Spieler).
function getEventAttendeePlayerIds(event, allPlayers) {
    return allPlayers
        .filter((p) => {
            const matchesTeam = !!event.teamId && event.teamId === p.teamId;
            const isExcluded = matchesTeam && (event.excludedPlayerIds || []).includes(p.id);
            const isInvited = (event.includedPlayerIds || []).includes(p.id);
            return (matchesTeam && !isExcluded) || isInvited;
        })
        .map((p) => p.id);
}

async function loadAllPlayers() {
    const snap = await db.collection("players").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Sucht die Firebase-Accounts, die zu den gegebenen Spieler-IDs gehoeren,
// sammelt deren Geraete-Tokens und verschickt eine Push-Nachricht an alle.
// Ungueltig gewordene Tokens (App deinstalliert, Berechtigung entzogen)
// werden danach automatisch aus dem jeweiligen Account entfernt.
async function sendToPlayerIds(playerIds, title, body, data) {
    if (playerIds.length === 0)
        return;
    const accountDocs = [];
    for (let i = 0; i < playerIds.length; i += 30) {
        // Firestore "in" erlaubt max. 30 Werte pro Abfrage
        const chunk = playerIds.slice(i, i + 30);
        const snap = await db.collection("accounts").where("playerId", "in", chunk).get();
        accountDocs.push(...snap.docs);
    }
    await sendToAccountDocs(accountDocs, title, body, data);
}
// Trainer-Zugaenge, die filter(account) erfuellen (z. B. nur Main Accounts)
async function sendToTrainers(filter, title, body, data) {
    const snap = await db.collection("accounts").where("role", "==", "trainer").get();
    await sendToAccountDocs(snap.docs.filter((d) => filter(d.data())), title, body, data);
}
async function sendToAccountDocs(accountDocs, title, body, data) {
    const tokenToUid = new Map();
    accountDocs.forEach((doc) => (doc.data().notificationTokens || []).forEach((t) => tokenToUid.set(t, doc.id)));
    if (tokenToUid.size === 0)
        return;
    const tokens = Array.from(tokenToUid.keys());
    const res = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data: data || {} });
    const cleanupByUid = new Map();
    res.responses.forEach((r, i) => {
        if (r.success)
            return;
        const code = r.error?.code || "";
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
            const token = tokens[i];
            const uid = tokenToUid.get(token);
            if (!cleanupByUid.has(uid))
                cleanupByUid.set(uid, []);
            cleanupByUid.get(uid).push(token);
        }
    });
    for (const [uid, badTokens] of cleanupByUid) {
        await db.collection("accounts").doc(uid).update({ notificationTokens: FieldValue.arrayRemove(...badTokens) });
    }
}

exports.onCalendarEventCreated = onDocumentCreated("calendarEvents/{eventId}", async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    // Automatisch aus dem DBB-Spielplan angelegte Spiele werden still eingetragen
    // (sonst kaemen beim ersten Abgleich viele Pushes auf einmal).
    if (data.source === "dbb")
        return;
    const allPlayers = await loadAllPlayers();
    const playerIds = getEventAttendeePlayerIds(data, allPlayers);
    if (playerIds.length === 0)
        return;
    const timeLabel = data.time ? ` um ${data.time}` : "";
    const body = `"${data.title}", am ${formatDateDE(data.date)}${timeLabel}`;
    await sendToPlayerIds(playerIds, "Neuer Termin", body, { type: "calendarEvent", eventId: event.params.eventId });
});

// Trainer fordert Feedback zu einem Training/Spiel an -> der betroffene Spieler
// bekommt eine Push-Benachrichtigung (umgekehrte Richtung - Spieler fordert
// Feedback beim Trainer an - loest bewusst KEINE Push aus, der Trainer sieht das
// nur als Hinweis im eigenen Dashboard, siehe README/Absprache).
exports.onFeedbackToPlayerCreated = onDocumentCreated("feedbackTrainerToPlayer/{requestId}", async (event) => {
    const data = event.data?.data();
    if (!data || !data.playerId)
        return;
    const eventLabel = data.eventLabel || "eurem letzten Training";
    await sendToPlayerIds([data.playerId], "Feedback angefragt", `Dein Trainer möchte dein Feedback zu ${eventLabel}.`, { type: "feedbackTrainerToPlayer", requestId: event.params.requestId });
});

// "Zugang entfernen" in der App loescht bisher nur den Firestore-Eintrag - das
// eigentliche Login-Konto bei Firebase Auth kann ein Client aus Sicherheitsgruenden
// nicht selbst fuer einen ANDEREN Nutzer loeschen, das geht nur mit Admin-Rechten
// hier in der Cloud Function. Ohne das bleibt ein entfernter Code weiterhin
// gueltig zum Anmelden, landet dann aber ohne Zugangsdaten in der App.
exports.deleteAccountAuth = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Bitte eingeloggt sein.");
    const callerSnap = await db.collection("accounts").doc(request.auth.uid).get();
    const caller = callerSnap.exists ? callerSnap.data() : null;
    const isFullTrainer = caller && caller.role === "trainer" && !accountTeamIdsFn(caller);
    if (!isFullTrainer)
        throw new HttpsError("permission-denied", "Nur Vollzugriff-Trainer duerfen Zugaenge entfernen.");
    const uid = request.data?.uid;
    if (!uid || typeof uid !== "string")
        throw new HttpsError("invalid-argument", "uid fehlt.");
    try {
        await getAuth().deleteUser(uid);
    }
    catch (e) {
        // Login-Konto existiert schon nicht mehr (z.B. vorher schon entfernt) -
        // dann ist das Ziel (kein gueltiges Login mehr) bereits erreicht.
        if (e.code !== "auth/user-not-found")
            throw e;
    }
    return { ok: true };
});

exports.dailyMonitoringReminder = onSchedule({ schedule: "0 18 * * *", timeZone: "Europe/Berlin" }, async () => {
    const allPlayers = await loadAllPlayers();
    const weekKey = isoWeekKey(todayIso());
    const missing = [];
    for (const p of allPlayers) {
        const wellSnap = await db.collection("playerWellness").doc(p.id).get();
        const entries = wellSnap.exists ? (wellSnap.data().entries || []) : [];
        const hasThisWeek = entries.some((e) => e.weekKey === weekKey);
        if (!hasThisWeek)
            missing.push(p.id);
    }
    if (missing.length === 0)
        return;
    await sendToPlayerIds(missing, "Monitoring-Erinnerung", "Bitte trag dein Wohlbefinden für diese Woche ein.", { type: "wellnessReminder" });
});

/* ---------------- DBB-Abgleich (basketball-bund.net) ----------------
   Die DBB-Seite erlaubt keine direkten Abrufe aus dem Browser (kein CORS),
   deshalb laeuft der Abruf hier. Ergebnis pro App-Team in dbbTeams/{teamId}:
   matches (ganze Saison), tables (Tabelle je Liga), updatedAt, error.
   Kalender: jedes Spiel wird ein Termin vom Typ "spiel" (source "dbb",
   dbbMatchId). Ein von Hand angelegtes Spiel am selben Tag fuers selbe Team
   wird mit dem DBB-Spiel verknuepft statt doppelt angelegt. */
const DBB_BASE = "https://www.basketball-bund.net/rest";
const DBB_VENUE_LOOKUPS_PER_TEAM = 8;

async function dbbGet(path) {
    const res = await fetch(DBB_BASE + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok)
        throw new Error(`DBB ${path}: HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "0")
        throw new Error(`DBB ${path}: ${json.message || "keine Daten"}`);
    return json.data;
}

// "163312", ".../team/163312", "...teamId=163312" -> 163312
function parseDbbTeamId(value) {
    const s = String(value || "").trim();
    const m = s.match(/team(?:id)?[\/=](\d{4,})/i) || s.match(/^(\d{4,})$/);
    return m ? Number(m[1]) : null;
}

function berlinNow() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
        .formatToParts(new Date()).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: parts.weekday };
}

// Der DBB fuehrt manche Teams doppelt in der Tabelle (z. B. ProA: "SBB Boerde
// Baskets" mit allen Spielen und "SBB Baskets" mit 0 Spielen). Ein Eintrag ohne
// Spiele fliegt raus, wenn alle Woerter seines Namens im Namen eines Teams mit
// Spielen vorkommen; danach werden die Plaetze neu durchgezaehlt.
function dropDuplicateTableEntries(entries) {
    const words = (name) => String(name || "").toLowerCase().match(/[a-z0-9äöüß]+/g) || [];
    const isPartOf = (a, b) => { const wb = words(b); const wa = words(a); return wa.length > 0 && wa.every((w) => wb.includes(w)); };
    const kept = entries.filter((e) => e.isUs || Number(e.games) > 0
        || !entries.some((o) => o !== e && Number(o.games) > 0 && isPartOf(e.name, o.name)));
    return kept.length === entries.length ? entries : kept.map((e, i) => ({ ...e, rank: i + 1 }));
}

function mapDbbTeam(t) {
    return { id: t.teamPermanentId || null, name: t.teamname || "", short: t.teamnameSmall || "" };
}

async function syncDbbTeam(team) {
    const dbbTeamId = parseDbbTeamId(team.dbbTeamId);
    const ref = db.collection("dbbTeams").doc(team.id);
    if (!dbbTeamId) {
        await ref.delete().catch(() => { });
        return { teamId: team.id, skipped: true };
    }
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? prevSnap.data() : {};
    const prevVenues = new Map((prev.matches || []).filter((m) => m.venue).map((m) => [m.matchId, m.venue]));
    try {
        const data = await dbbGet(`/team/id/${dbbTeamId}/matches`);
        const today = berlinNow().date;
        const matches = (data.matches || []).map((m) => {
            const isHome = m.homeTeam?.teamPermanentId === dbbTeamId;
            return {
                matchId: m.matchId,
                date: m.kickoffDate || "",
                time: m.kickoffTime || "",
                ligaId: m.ligaData?.ligaId || null,
                liganame: m.ligaData?.liganame || "",
                ligaShort: m.ligaData?.skNameSmall || "",
                home: mapDbbTeam(m.homeTeam || {}),
                guest: mapDbbTeam(m.guestTeam || {}),
                isHome,
                result: m.result || "",
                confirmed: !!m.ergebnisbestaetigt,
                cancelled: !!(m.abgesagt || m.verzicht),
                venue: prevVenues.get(m.matchId) || null,
            };
        }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        // Halle nur fuer kommende Spiele nachschlagen (eigener Abruf pro Spiel)
        let lookups = 0;
        for (const m of matches) {
            if (m.venue || m.date < today || lookups >= DBB_VENUE_LOOKUPS_PER_TEAM)
                continue;
            lookups++;
            try {
                const info = await dbbGet(`/match/id/${m.matchId}/matchInfo`);
                const f = info.matchInfo?.spielfeld;
                if (f)
                    m.venue = { name: (f.bezeichnung || "").trim(), street: f.strasse || "", city: [f.plz, f.ort].filter(Boolean).join(" ") };
            }
            catch (e) { /* Halle ist optional */ }
        }
        // Tabellen der Ligen dieser Saison, neueste Liga zuerst
        const ligaIds = [];
        [...matches].reverse().forEach((m) => { if (m.ligaId && !ligaIds.includes(m.ligaId)) ligaIds.push(m.ligaId); });
        const tables = [];
        for (const ligaId of ligaIds.slice(0, 3)) {
            try {
                const t = await dbbGet(`/competition/table/id/${ligaId}`);
                const rawEntries = (t.tabelle?.entries || []).map((e) => ({
                    rank: e.rang, ...mapDbbTeam(e.team || {}), games: e.anzspiele, won: e.s, lost: e.n,
                    points: e.anzGewinnpunkte, scored: e.koerbe, against: e.gegenKoerbe, diff: e.korbdiff,
                    isUs: e.team?.teamPermanentId === dbbTeamId,
                }));
                const entries = dropDuplicateTableEntries(rawEntries);
                if (entries.length > 0)
                    tables.push({ ligaId, liganame: t.ligaData?.liganame || "", ligaShort: t.ligaData?.skNameSmall || "", entries });
            }
            catch (e) { /* Liga ohne Tabelle (z.B. Pokal) */ }
        }
        await ref.set({
            teamId: team.id, dbbTeamId, dbbTeamName: data.team?.teamName || "", dbbAk: data.team?.teamAkj || "",
            matches, tables, error: null, updatedAt: FieldValue.serverTimestamp(),
        });
        const cal = await syncDbbCalendar(team, matches);
        return { teamId: team.id, matches: matches.length, ...cal };
    }
    catch (e) {
        await ref.set({ teamId: team.id, dbbTeamId, error: String(e.message || e), errorAt: FieldValue.serverTimestamp() }, { merge: true });
        return { teamId: team.id, error: String(e.message || e) };
    }
}

function dbbEventFields(m) {
    const opponent = m.isHome ? m.guest : m.home;
    const venue = m.venue ? [m.venue.name, m.venue.street, m.venue.city].filter(Boolean).join(", ") : "";
    return {
        title: `${m.cancelled ? "Abgesagt: " : ""}Spiel ${m.isHome ? "vs" : "@"} ${opponent.name}`,
        date: m.date, time: m.time, location: venue,
        dbbMatchId: m.matchId, dbbResult: m.result || "", dbbHome: m.isHome, dbbLiga: m.liganame,
        dbbCancelled: m.cancelled,
    };
}

async function syncDbbCalendar(team, matches) {
    const snap = await db.collection("calendarEvents").where("teamId", "==", team.id).get();
    const events = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    const byMatch = new Map(events.filter((e) => e.dbbMatchId).map((e) => [e.dbbMatchId, e]));
    let created = 0, updated = 0;
    const batch = db.batch();
    for (const m of matches) {
        if (!m.date)
            continue;
        const fields = dbbEventFields(m);
        const existing = byMatch.get(m.matchId);
        if (existing) {
            // Von Hand angelegte, verknuepfte Spiele behalten Titel und Ort
            const changes = existing.source === "dbb" ? fields : { ...fields, title: existing.title, location: existing.location || fields.location };
            if (Object.keys(changes).some((k) => existing[k] !== changes[k])) {
                batch.set(existing.ref, changes, { merge: true });
                updated++;
            }
            continue;
        }
        const manual = events.find((e) => e.type === "spiel" && !e.dbbMatchId && e.date === m.date);
        if (manual) {
            batch.set(manual.ref, { ...fields, title: manual.title, location: manual.location || fields.location, time: fields.time || manual.time || "" }, { merge: true });
            manual.dbbMatchId = m.matchId;
            updated++;
            continue;
        }
        if (m.cancelled)
            continue;
        batch.set(db.collection("calendarEvents").doc(`dbb_${m.matchId}`), {
            ...fields, endTime: "", type: "spiel", teamId: team.id, notes: m.liganame,
            excludedPlayerIds: [], includedPlayerIds: [], involvedTeamIds: [team.id], source: "dbb",
        });
        created++;
    }
    if (created + updated > 0)
        await batch.commit();
    return { created, updated };
}

const DBB_SYNC_CONCURRENCY = 4; // so viele Teams gleichzeitig (bei ~15 Teams sonst zu langsam)
async function syncAllDbbTeams(onlyTeamIds) {
    const meta = await db.collection("club").doc("meta").get();
    const allTeams = (meta.exists ? meta.data().teams : null) || [];
    const teams = [];
    for (const team of allTeams) {
        if (onlyTeamIds && !onlyTeamIds.includes(team.id))
            continue;
        if (team.dbbTeamId || (await db.collection("dbbTeams").doc(team.id).get()).exists)
            teams.push(team);
    }
    const results = [];
    for (let i = 0; i < teams.length; i += DBB_SYNC_CONCURRENCY)
        results.push(...await Promise.all(teams.slice(i, i + DBB_SYNC_CONCURRENCY).map(syncDbbTeam)));
    return results;
}

// Automatisch nur zweimal pro Woche: Freitag 7 Uhr (Ansetzungen fuers
// Wochenende) und Sonntag 22 Uhr (Ergebnisse/Tabelle). Sonst per Klick in der App.
exports.syncDbbScheduled = onSchedule({ schedule: "0 7,22 * * 0,5", timeZone: "Europe/Berlin", region: "europe-west1", timeoutSeconds: 540 }, async () => {
    const now = berlinNow();
    if (!((now.weekday === "Fri" && now.hour === 7) || (now.weekday === "Sun" && now.hour === 22)))
        return;
    await syncAllDbbTeams();
});

// Team-Trainer duerfen die Einstellungen IHRER Teams aendern (Name, Cheftrainer,
// DBB-Link, Logo). club/meta ist per Regel nur fuer Main Accounts beschreibbar,
// weil sich in einer Teams-Liste nicht pruefen laesst, welches Team geaendert
// wurde - deshalb hier serverseitig, nur fuer erlaubte Teams und Felder.
const OWN_TEAM_FIELDS = ["name", "trainer", "dbbTeamId", "logoUrl"];
exports.updateOwnTeam = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Bitte eingeloggt sein.");
    const callerSnap = await db.collection("accounts").doc(request.auth.uid).get();
    const acc = callerSnap.exists ? callerSnap.data() : null;
    if (!acc || acc.role !== "trainer")
        throw new HttpsError("permission-denied", "Nur Trainer duerfen Teams bearbeiten.");
    const ownTeamIds = Array.isArray(acc.teamIds) && acc.teamIds.length ? acc.teamIds : (acc.teamId ? [acc.teamId] : null);
    const { teamId, changes } = request.data || {};
    if (!teamId || (ownTeamIds && !ownTeamIds.includes(teamId)))
        throw new HttpsError("permission-denied", "Dieses Team gehoert nicht zu deinem Zugang.");
    const clean = {};
    for (const k of OWN_TEAM_FIELDS) {
        if (changes && typeof changes[k] === "string")
            clean[k] = changes[k].trim().slice(0, 500);
    }
    if ("name" in clean && !clean.name)
        throw new HttpsError("invalid-argument", "Bitte einen Teamnamen eingeben.");
    const ref = db.collection("club").doc("meta");
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const teams = (snap.exists ? snap.data().teams : null) || [];
        if (!teams.some((t) => t.id === teamId))
            throw new HttpsError("not-found", "Team nicht gefunden.");
        tx.update(ref, { teams: teams.map((t) => (t.id === teamId ? { ...t, ...clean } : t)) });
    });
    return { ok: true };
});

// "Jetzt aktualisieren" in der App (nur Trainer)
exports.syncDbbNow = onCall({ region: "europe-west1", timeoutSeconds: 300 }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Bitte eingeloggt sein.");
    const callerSnap = await db.collection("accounts").doc(request.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "trainer")
        throw new HttpsError("permission-denied", "Nur Trainer duerfen den DBB-Abgleich starten.");
    // Team-Trainer: nur die eigenen Teams abgleichen (geht schneller)
    const acc = callerSnap.data();
    const ownTeamIds = Array.isArray(acc.teamIds) && acc.teamIds.length ? acc.teamIds : (acc.teamId ? [acc.teamId] : null);
    return { results: await syncAllDbbTeams(ownTeamIds) };
});

/* ---------------- Wochenbericht (nur Main Accounts) ----------------
   Der Bericht selbst wird in der App aus den aktuellen Daten erstellt (und dort
   als PDF exportiert). Montags 7 Uhr bekommen die Main Accounts nur den Hinweis. */
exports.weeklyReportReminder = onSchedule({ schedule: "0 7 * * 1", timeZone: "Europe/Berlin", region: "europe-west1" }, async () => {
    const lastWeek = isoWeekKey(addDaysIsoFn(todayIso(), -3)).split("-W")[1];
    await sendToTrainers((acc) => !accountTeamIdsFn(acc), `Wochenbericht KW ${Number(lastWeek)}`, "Ergebnisse, Top-Spieler, Verletzungen und offene Punkte der letzten Woche sind fertig.", { type: "weeklyReport" });
});

/* ---------------- Verletzung: Rueckkehr faellig ----------------
   Taeglich 8 Uhr: Spieler, deren voraussichtliche Rueckkehr heute ist, an die
   Trainer seines Teams und die Main Accounts melden. */
exports.injuryReturnReminder = onSchedule({ schedule: "0 8 * * *", timeZone: "Europe/Berlin", region: "europe-west1" }, async () => {
    const t = todayIso();
    const due = (await loadAllPlayers()).filter((p) => ["verletzt", "reha"].includes(p.status) && p.injuryUntil === t);
    for (const p of due) {
        const body = `${p.name}${p.injuryReason ? " (" + p.injuryReason + ")" : ""} ist laut Plan ab heute wieder fit - bitte Status prüfen.`;
        await sendToTrainers((acc) => { const ids = accountTeamIdsFn(acc); return !ids || ids.includes(p.teamId); }, "Rückkehr fällig", body, { type: "injuryReturn", playerId: p.id });
    }
});

/* ---------------- Kalender-Abo (ICS) ----------------
   Jeder Zugang kann sich einen geheimen Abo-Link erzeugen (icsToken im
   Account). Handy-/Outlook-Kalender holen darueber regelmaessig die Termine:
   Spieler: eigenes Team (+ Doppellizenz-Teams) und Einladungen,
   Team-Trainer: ihre Teams, Main Accounts: alle Teams. */
const CALENDAR_FEED_BASE = "https://rsk-test-dev.web.app/kalender/";
exports.getCalendarFeedUrl = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Bitte eingeloggt sein.");
    const ref = db.collection("accounts").doc(request.auth.uid);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError("permission-denied", "Kein Zugang hinterlegt.");
    let token = snap.data().icsToken;
    if (!token || request.data?.reset) {
        token = crypto.randomBytes(18).toString("hex");
        await ref.update({ icsToken: token });
    }
    return { url: CALENDAR_FEED_BASE + token + ".ics" };
});
function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsFold(line) {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
        out.push(rest.slice(0, 74));
        rest = " " + rest.slice(74);
    }
    out.push(rest);
    return out.join("\r\n");
}
const ICS_DEFAULT_MINUTES = { spiel: 120, training: 90 };
function eventToIcs(e, stamp, prefix) {
    const d = (e.date || "").replace(/-/g, "");
    const lines = ["BEGIN:VEVENT", `UID:${e.id}@rsk-spieler-akte`, `DTSTAMP:${stamp}`];
    if (/^\d{1,2}:\d{2}$/.test(e.time || "")) {
        const [h, m] = e.time.split(":").map(Number);
        let end = e.endTime && /^\d{1,2}:\d{2}$/.test(e.endTime) ? e.endTime.split(":").map(Number) : null;
        if (!end) {
            const total = h * 60 + m + (ICS_DEFAULT_MINUTES[e.type] || 90);
            end = [Math.min(23, Math.floor(total / 60)), total >= 24 * 60 ? 59 : total % 60];
        }
        const hhmm = (x, y) => `${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}00`;
        lines.push(`DTSTART;TZID=Europe/Berlin:${d}T${hhmm(h, m)}`, `DTEND;TZID=Europe/Berlin:${d}T${hhmm(end[0], end[1])}`);
    }
    else {
        lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDaysIsoFn(e.date, 1).replace(/-/g, "")}`);
    }
    const title = (prefix ? prefix + " · " : "") + (e.dbbResult ? `${e.title} (${e.dbbResult})` : e.title);
    lines.push(`SUMMARY:${icsEscape(title)}`);
    if (e.location)
        lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.notes)
        lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
    lines.push("END:VEVENT");
    return lines.map(icsFold).join("\r\n");
}
exports.calendarFeed = onRequest({ region: "europe-west1" }, async (req, res) => {
    const token = (req.path.match(/([a-f0-9]{24,64})(\.ics)?$/) || [])[1];
    if (!token) {
        res.status(404).send("Kalender nicht gefunden.");
        return;
    }
    const accSnap = await db.collection("accounts").where("icsToken", "==", token).limit(1).get();
    if (accSnap.empty) {
        res.status(404).send("Kalender nicht gefunden.");
        return;
    }
    const acc = accSnap.docs[0].data();
    const since = addDaysIsoFn(todayIso(), -60);
    let events = [];
    const meta = await db.collection("club").doc("meta").get();
    const teams = (meta.exists ? meta.data().teams : null) || [];
    let calName = "RheinStars";
    let multiTeam = true, ownTeamId = null;
    const teamNameOf = (id) => (teams.find((t) => t.id === id) || {}).name || "";
    if (acc.role === "player" && acc.playerId) {
        const pSnap = await db.collection("players").doc(acc.playerId).get();
        const p = pSnap.exists ? pSnap.data() : {};
        const teamIds = [p.teamId, ...(p.dlTeamIds || [])].filter(Boolean);
        const snaps = await Promise.all([
            ...teamIds.map((t) => db.collection("calendarEvents").where("teamId", "==", t).get()),
            db.collection("calendarEvents").where("includedPlayerIds", "array-contains", acc.playerId).get(),
        ]);
        const byId = new Map();
        snaps.forEach((sn) => sn.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() })));
        events = [...byId.values()].filter((e) => !(e.teamId === p.teamId && (e.excludedPlayerIds || []).includes(acc.playerId)));
        calName = `RheinStars · ${p.name || "Spieler"}`;
        multiTeam = false;
        ownTeamId = p.teamId;
    }
    else if (acc.role === "trainer") {
        const ids = accountTeamIdsFn(acc);
        const snaps = ids
            ? await Promise.all(ids.map((t) => db.collection("calendarEvents").where("involvedTeamIds", "array-contains", t).get()))
            : [await db.collection("calendarEvents").where("date", ">=", since).get()];
        const byId = new Map();
        snaps.forEach((sn) => sn.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() })));
        events = [...byId.values()];
        calName = ids ? `RheinStars · ${ids.map(teamNameOf).filter(Boolean).join(", ")}` : "RheinStars · alle Teams";
        multiTeam = !ids || ids.length > 1;
    }
    events = events.filter((e) => e.date && e.date >= since);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const body = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RheinStars//Spieler-Akte//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        icsFold(`X-WR-CALNAME:${icsEscape(calName)}`), "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        ...events.map((e) => eventToIcs(e, stamp, e.teamId && (multiTeam || e.teamId !== ownTeamId) ? teamNameOf(e.teamId) : "")),
        "END:VCALENDAR",
    ].join("\r\n");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "private, max-age=900");
    res.status(200).send(body);
});

/* ---------------- Backup ----------------
   Laeuft ueber die eingebauten Firestore-Backups (kein Code noetig):
   taeglich (7 Tage aufbewahrt) + sonntags (14 Wochen aufbewahrt), eingerichtet mit
   firebase firestore:backups:schedules:create. Wiederherstellen siehe README. */
