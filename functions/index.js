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
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const tokenToUid = new Map();
    for (let i = 0; i < playerIds.length; i += 30) {
        // Firestore "in" erlaubt max. 30 Werte pro Abfrage
        const chunk = playerIds.slice(i, i + 30);
        const snap = await db.collection("accounts").where("playerId", "in", chunk).get();
        snap.forEach((doc) => {
            const acc = doc.data();
            (acc.notificationTokens || []).forEach((t) => tokenToUid.set(t, doc.id));
        });
    }
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
    const isFullTrainer = caller && caller.role === "trainer" && !caller.teamId;
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
                const entries = (t.tabelle?.entries || []).map((e) => ({
                    rank: e.rang, ...mapDbbTeam(e.team || {}), games: e.anzspiele, won: e.s, lost: e.n,
                    points: e.anzGewinnpunkte, scored: e.koerbe, against: e.gegenKoerbe, diff: e.korbdiff,
                    isUs: e.team?.teamPermanentId === dbbTeamId,
                }));
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
