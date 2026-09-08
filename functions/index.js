/* ============================================================
   PUSH-BENACHRICHTIGUNGEN - Cloud Functions
   Zwei Trigger:
   1. onCalendarEventCreated: sobald ein neuer Kalender-Termin angelegt
      wird, bekommen alle betroffenen Spieler (Team- oder Einzel-
      Zuordnung, wie im Kalender selbst) eine Push-Benachrichtigung.
   2. dailyMonitoringReminder: laeuft taeglich um 18 Uhr und erinnert
      alle Spieler, die diese Woche noch kein Wellness-/Monitoring-
      Check-in gemacht haben.

   Deploy: siehe README.md im Projekt-Wurzelverzeichnis.
   ============================================================ */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

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
    const allPlayers = await loadAllPlayers();
    const playerIds = getEventAttendeePlayerIds(data, allPlayers);
    if (playerIds.length === 0)
        return;
    const timeLabel = data.time ? ` um ${data.time}` : "";
    const body = `"${data.title}", am ${formatDateDE(data.date)}${timeLabel}`;
    await sendToPlayerIds(playerIds, "Neuer Termin", body, { type: "calendarEvent", eventId: event.params.eventId });
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
