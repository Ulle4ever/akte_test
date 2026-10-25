// app.js - Haupt-Komponente SpielerAkte (Login, Datenladen, Navigation, Spieler-Akte) und App-Start.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const TABS = [
    { key: "uebersicht", label: "Übersicht", icon: IconUsers },
    { key: "steckbrief", label: "Steckbrief", icon: IconFile },
    { key: "kalender", label: "Kalender", icon: IconCalendar },
    { key: "statistik", label: "Statistiken", icon: IconActivity },
    { key: "test", label: "Athletik-Tests", icon: IconClipboard },
    { key: "anwesenheit", label: "Anwesenheit", icon: IconCalendar },
    { key: "wellness", label: "Monitoring", icon: IconHeart },
    { key: "noten", label: "Schule", icon: IconFile },
    { key: "video", label: "Videos", icon: IconVideo },
    { key: "notiz", label: "Notizen", icon: IconNote },
    { key: "entwicklung", label: "Development Plan", icon: IconClipboard },
    { key: "feedback", label: "Feedback", icon: IconMessage },
];
const PLAYER_ROLE_TABS = ["uebersicht", "kalender", "wellness", "noten", "video", "notiz", "entwicklung", "feedback"];
// Die Reiter der Spieler-Akte sind in vier Bereiche gegliedert (obere Leiste),
// die Unterreiter erscheinen darunter - statt zwoelf Reitern in einer Reihe.
const TAB_GROUPS = [
    { key: "profil", label: "Profil", icon: IconUsers, tabs: ["uebersicht", "steckbrief"] },
    { key: "leistung", label: "Leistung", icon: IconActivity, tabs: ["statistik", "test"] },
    { key: "betreuung", label: "Betreuung", icon: IconHeart, tabs: ["wellness", "anwesenheit", "kalender", "noten"] },
    { key: "entwicklung", label: "Entwicklung", icon: IconTrendUp, tabs: ["entwicklung", "feedback", "notiz", "video"] },
];
// Feedback-Loop: Fragen/Kategorien, falls in club/meta noch nichts Eigenes
// hinterlegt ist (ueber Verwaltung -> Feedback-Fragen anpassbar).
const DEFAULT_FEEDBACK_QUESTIONS = {
    selfRatingLabel: "Wie zufrieden warst du mit deiner eigenen Leistung heute?",
    energyRatingLabel: "Wie war deine körperliche Verfassung/Energie?",
    messageLabel: "Möchtest du dem Trainer etwas mitteilen? (optional)",
};
const DEFAULT_FEEDBACK_CATEGORIES = [
    { id: "einsatz", label: "Einsatz/Einstellung" },
    { id: "technik", label: "Technische Ausführung" },
    { id: "spielverstaendnis", label: "Spielverständnis/Taktik" },
    { id: "athletik", label: "Athletik/Fitness" },
];
function SpielerAkte() {
    const [loading, setLoading] = useState(true);
    const [saveError, setSaveError] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState("all");
    const [showPlayerList, setShowPlayerList] = useState(false);
    const [showTeamCalendar, setShowTeamCalendar] = useState(false);
    const [showGlobalCalendar, setShowGlobalCalendar] = useState(false);
    const [showVerwaltung, setShowVerwaltung] = useState(false);
    const [showAllUnits, setShowAllUnits] = useState(false);
    const [showAttendance, setShowAttendance] = useState(false);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [activeTab, setActiveTab] = useState("uebersicht");
    const [expandedCats, setExpandedCats] = useState(() => new Set());
    const [expandedVideos, setExpandedVideos] = useState(() => new Set());
    const [openHeaderMenu, setOpenHeaderMenu] = useState(null);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [editingStat, setEditingStat] = useState(null);
    const [editingTeam, setEditingTeam] = useState(null);
    const [editingTest, setEditingTest] = useState(null);
    const [videoDefaultType, setVideoDefaultType] = useState(null);
    function toggleVideo(id) {
        setExpandedVideos((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    function toggleCat(id) {
        setExpandedCats((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    const [search, setSearch] = useState("");
    const [modal, setModal] = useState(null);
    const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = noch am prüfen, null = ausgeloggt
    const [account, setAccount] = useState(null); // { role: "trainer"|"player", playerId?, email }
    const [notifPermission, setNotifPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
    const [notifBusy, setNotifBusy] = useState(false);
    const [notifError, setNotifError] = useState("");
    const [meta, setMeta] = useState(null); // { teams, statCategories, testTypes }
    const [players, setPlayers] = useState([]);
    const [privateData, setPrivateData] = useState({}); // { [playerId]: { notes, tests, attendance } }, nur für Trainer geladen
    const [wellnessData, setWellnessData] = useState({}); // { [playerId]: { entries: [] } }, Trainer: alle, Spieler: nur eigene
    const [trainingLoadData, setTrainingLoadData] = useState({}); // { [playerId]: { entries: [] } }, sRPE-Trainingsbelastung, Trainer: alle, Spieler: nur eigene
    const [gradesData, setGradesData] = useState({}); // { [playerId]: { subjects: [] } }, Trainer: alle, Spieler: nur eigene
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [devPlanWaiting, setDevPlanWaiting] = useState([]); // Zyklen, die der Spieler freigegeben hat, der Trainer aber noch nicht (fuer Dashboard-Hinweis)
    const [feedbackWaiting, setFeedbackWaiting] = useState([]); // Offene Spieler->Trainer-Feedback-Anfragen (fuer Dashboard-Hinweis, keine Push)
    const [eventAttendance, setEventAttendance] = useState({}); // { [eventId]: { [playerId]: "present"|"absent" } } - direkt in "Alle Einheiten" markiert
    const [teamNotes, setTeamNotes] = useState([]);
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginBusy, setLoginBusy] = useState(false);
    const prevUidRef = useRef(undefined);
    const steckbriefRef = useRef(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    async function exportSteckbriefPdf(playerName) {
        if (!steckbriefRef.current || !window.html2canvas || !window.jspdf)
            return;
        setPdfBusy(true);
        try {
            const canvas = await window.html2canvas(steckbriefRef.current, { scale: 2, backgroundColor: "#ffffff" });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const imgWidth = pageWidth - 20;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
            pdf.save(`Steckbrief-${(playerName || "Spieler").replace(/[^a-z0-9]+/gi, "_")}.pdf`);
        }
        catch (e) {
            setSaveError(true);
        }
        setPdfBusy(false);
    }
    useEffect(() => {
        if (firebaseUser?.uid !== prevUidRef.current) {
            prevUidRef.current = firebaseUser?.uid;
            setSelectedPlayerId(null);
            setSelectedTeamId("all");
            setShowTeamCalendar(false);
            setActiveTab("uebersicht");
            setConfirmDeletePlayer(false);
        }
    }, [firebaseUser]);
    useEffect(() => {
        const unsub = auth.onAuthStateChanged(async (user) => {
            setFirebaseUser(user);
            setLoadError(null);
            if (!user) {
                setAccount(null);
                setMeta(null);
                setPlayers([]);
                setPrivateData({});
                setWellnessData({});
                setTrainingLoadData({});
                setGradesData({});
                setLoading(false);
                return;
            }
            try {
                const accSnap = await db.collection("accounts").doc(user.uid).get();
                if (!accSnap.exists) {
                    setLoadError("Für dieses Konto ist kein Zugang hinterlegt. Bitte an einen Trainer wenden.");
                    setLoading(false);
                    return;
                }
                setAccount(accSnap.data());
            }
            catch (e) {
                setLoadError(e.message || "Fehler beim Laden des Zugangs.");
                setLoading(false);
            }
        });
        return () => unsub();
    }, []);
    useEffect(() => {
        if (!messaging)
            return;
        // Kommt eine Push-Nachricht an, waehrend die App gerade offen ist, zeigt der
        // Browser sie NICHT automatisch an (das macht er nur im Hintergrund via
        // Service Worker) - hier deshalb selbst als Benachrichtigung anzeigen.
        const unsub = messaging.onMessage((payload) => {
            const title = payload.notification?.title || "Spieler-Akte";
            const body = payload.notification?.body || "";
            try {
                const notif = new Notification(title, { body, icon: "icon-192.png" });
                notif.onclick = () => { window.focus(); notif.close(); };
            }
            catch (e) { }
        });
        return () => { if (typeof unsub === "function")
            unsub(); };
    }, []);
    useEffect(() => {
        if (!account)
            return;
        let cancelled = false;
        async function loadData() {
            try {
                const metaSnap = await db.collection("club").doc("meta").get();
                const metaDefaults = { teams: [], statCategories: DEFAULT_STAT_CATEGORIES, testTypes: DEFAULT_TEST_TYPES, feedbackQuestions: DEFAULT_FEEDBACK_QUESTIONS, feedbackCategories: DEFAULT_FEEDBACK_CATEGORIES };
                const loadedMeta = metaSnap.exists ? { ...metaDefaults, ...metaSnap.data() } : metaDefaults;
                // Entfernte Statistik-Kategorien (z. B. "Habbit Stats") herausfiltern und -
                // falls eine noch offene alte App-Version sie zurueckgeschrieben hat -
                // gleich wieder aus den Daten loeschen.
                const cleanedStatCategories = (loadedMeta.statCategories || []).filter((c) => !REMOVED_STAT_CATEGORY_IDS.includes(c.id));
                if (cleanedStatCategories.length !== (loadedMeta.statCategories || []).length) {
                    loadedMeta.statCategories = cleanedStatCategories;
                    if (account.role === "trainer")
                        db.collection("club").doc("meta").set({ statCategories: cleanedStatCategories }, { merge: true }).catch(() => { });
                }
                if (!cancelled)
                    setMeta(loadedMeta);
                let loadedPlayerTeamId = null;
                if (account.role === "trainer") {
                    // Team-beschraenkter Trainer-Zugang (account.teamId gesetzt): alle
                    // Abfragen werden auf das eigene Team eingeschraenkt - passend zu den
                    // Firestore-Regeln, die serverseitig genau das Gleiche durchsetzen.
                    const scopeTeamId = account.teamId || null;
                    const playersQuery = scopeTeamId ? db.collection("players").where("teamId", "==", scopeTeamId) : db.collection("players");
                    const playersSnap = await playersQuery.get();
                    const loadedPlayers = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                    if (!cancelled)
                        setPlayers(loadedPlayers);
                    const privDefaults = { notes: [], tests: [], attendance: [], grades: [] };
                    const privEntries = await Promise.all(loadedPlayers.map(async (p) => {
                        const s = await db.collection("playerPrivate").doc(p.id).get();
                        return [p.id, s.exists ? { ...privDefaults, ...s.data() } : privDefaults];
                    }));
                    if (!cancelled)
                        setPrivateData(Object.fromEntries(privEntries));
                    const wellEntries = await Promise.all(loadedPlayers.map(async (p) => {
                        const s = await db.collection("playerWellness").doc(p.id).get();
                        return [p.id, s.exists ? { entries: s.data().entries || [] } : { entries: [] }];
                    }));
                    if (!cancelled)
                        setWellnessData(Object.fromEntries(wellEntries));
                    // In try/catch: neue Collection, deren Firestore-Regel der Nutzer erst
                    // noch manuell in der Console nachtragen muss (siehe firestore.rules) -
                    // bis dahin soll ein permission-denied hier nicht den kompletten Login
                    // abbrechen, sondern die Trainingsbelastung einfach leer bleiben.
                    try {
                        const loadEntries = await Promise.all(loadedPlayers.map(async (p) => {
                            const s = await db.collection("playerTrainingLoad").doc(p.id).get();
                            return [p.id, s.exists ? { entries: s.data().entries || [] } : { entries: [] }];
                        }));
                        if (!cancelled)
                            setTrainingLoadData(Object.fromEntries(loadEntries));
                    }
                    catch (e) {
                        if (!cancelled)
                            setTrainingLoadData({});
                    }
                    try {
                        const gradeEntries = await Promise.all(loadedPlayers.map(async (p) => {
                            const s = await db.collection("playerGrades").doc(p.id).get();
                            return [p.id, { subjects: s.exists ? (s.data().subjects || []) : [] }];
                        }));
                        if (!cancelled)
                            setGradesData(Object.fromEntries(gradeEntries));
                    }
                    catch (e) {
                        if (!cancelled)
                            setGradesData({});
                    }
                    // Termine des eigenen Teams PLUS Termine anderer Teams, bei denen ein
                    // eigener Spieler einzeln eingeladen ist (involvedTeamIds deckt beides ab).
                    const eventsQuery = scopeTeamId ? db.collection("calendarEvents").where("involvedTeamIds", "array-contains", scopeTeamId) : db.collection("calendarEvents");
                    const evSnap = await eventsQuery.get();
                    const loadedEvents = evSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                    if (!cancelled)
                        setCalendarEvents(loadedEvents);
                    const teamNotesQuery = scopeTeamId ? db.collection("teamNotes").where("teamId", "==", scopeTeamId) : db.collection("teamNotes");
                    const tnSnap = await teamNotesQuery.get();
                    if (!cancelled)
                        setTeamNotes(tnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                    async function fetchByPlayerIdChunks(collName) {
                        if (!scopeTeamId)
                            return (await db.collection(collName).get()).docs;
                        const playerIds = loadedPlayers.map((p) => p.id);
                        if (playerIds.length === 0)
                            return [];
                        const idChunks = [];
                        for (let i = 0; i < playerIds.length; i += 30)
                            idChunks.push(playerIds.slice(i, i + 30));
                        const results = await Promise.all(idChunks.map((chunk) => db.collection(collName).where("playerId", "in", chunk).get()));
                        return results.flatMap((snap) => snap.docs);
                    }
                    try {
                        const [devPlayerDocs, devTrainerDocs] = await Promise.all([
                            fetchByPlayerIdChunks("devPlanPlayer"),
                            fetchByPlayerIdChunks("devPlanTrainer"),
                        ]);
                        const trainerReleased = new Set(devTrainerDocs.filter((d) => d.data().released).map((d) => d.id));
                        const waiting = devPlayerDocs
                            .filter((d) => d.data().released && !trainerReleased.has(d.id))
                            .map((d) => ({ id: d.id, playerId: d.data().playerId, date: d.data().date }));
                        if (!cancelled)
                            setDevPlanWaiting(waiting);
                    }
                    catch (e) {
                        if (!cancelled)
                            setDevPlanWaiting([]);
                    }
                    try {
                        const fbDocs = await fetchByPlayerIdChunks("feedbackPlayerToTrainer");
                        const fbWaiting = fbDocs
                            .filter((d) => d.data().status === "pending")
                            .map((d) => ({ id: d.id, playerId: d.data().playerId, eventLabel: d.data().eventLabel }));
                        if (!cancelled)
                            setFeedbackWaiting(fbWaiting);
                    }
                    catch (e) {
                        if (!cancelled)
                            setFeedbackWaiting([]);
                    }
                    try {
                        if (scopeTeamId) {
                            const eaEntries = await Promise.all(loadedEvents.map(async (e) => {
                                const s = await db.collection("eventAttendance").doc(e.id).get();
                                return [e.id, s.exists ? (s.data() || {}) : {}];
                            }));
                            if (!cancelled)
                                setEventAttendance(Object.fromEntries(eaEntries));
                        }
                        else {
                            const eaSnap = await db.collection("eventAttendance").get();
                            if (!cancelled)
                                setEventAttendance(Object.fromEntries(eaSnap.docs.map((d) => [d.id, d.data() || {}])));
                        }
                    }
                    catch (e) {
                        if (!cancelled)
                            setEventAttendance({});
                    }
                }
                else if (account.role === "player" && account.playerId) {
                    const pSnap = await db.collection("players").doc(account.playerId).get();
                    const ownPlayer = pSnap.exists ? { id: pSnap.id, ...pSnap.data() } : null;
                    if (!cancelled)
                        setPlayers(ownPlayer ? [ownPlayer] : []);
                    loadedPlayerTeamId = ownPlayer?.teamId || null;
                    const ownWellSnap = await db.collection("playerWellness").doc(account.playerId).get();
                    if (!cancelled)
                        setWellnessData({ [account.playerId]: { entries: ownWellSnap.exists ? (ownWellSnap.data().entries || []) : [] } });
                    try {
                        const ownLoadSnap = await db.collection("playerTrainingLoad").doc(account.playerId).get();
                        if (!cancelled)
                            setTrainingLoadData({ [account.playerId]: { entries: ownLoadSnap.exists ? (ownLoadSnap.data().entries || []) : [] } });
                    }
                    catch (e) {
                        if (!cancelled)
                            setTrainingLoadData({ [account.playerId]: { entries: [] } });
                    }
                    try {
                        const ownGradeSnap = await db.collection("playerGrades").doc(account.playerId).get();
                        if (!cancelled)
                            setGradesData({ [account.playerId]: { subjects: ownGradeSnap.exists ? (ownGradeSnap.data().subjects || []) : [] } });
                    }
                    catch (e) {
                        if (!cancelled)
                            setGradesData({ [account.playerId]: { subjects: [] } });
                    }
                    const [teamEvSnap, ownEvSnap] = await Promise.all([
                        loadedPlayerTeamId ? db.collection("calendarEvents").where("teamId", "==", loadedPlayerTeamId).get() : Promise.resolve({ docs: [] }),
                        db.collection("calendarEvents").where("includedPlayerIds", "array-contains", account.playerId).get(),
                    ]);
                    const byId = {};
                    teamEvSnap.docs.forEach((d) => { byId[d.id] = { id: d.id, ...d.data() }; });
                    ownEvSnap.docs.forEach((d) => { byId[d.id] = { id: d.id, ...d.data() }; });
                    if (!cancelled)
                        setCalendarEvents(Object.values(byId));
                    const [tnIndivSnap, tnAllSnap] = await Promise.all([
                        db.collection("teamNotes").where("sharedWithPlayerIds", "array-contains", account.playerId).get(),
                        loadedPlayerTeamId
                            ? db.collection("teamNotes").where("teamId", "==", loadedPlayerTeamId).where("sharedWithAll", "==", true).get()
                            : Promise.resolve({ docs: [] }),
                    ]);
                    const tnById = {};
                    tnIndivSnap.docs.forEach((d) => { tnById[d.id] = { id: d.id, ...d.data() }; });
                    tnAllSnap.docs.forEach((d) => { tnById[d.id] = { id: d.id, ...d.data() }; });
                    if (!cancelled)
                        setTeamNotes(Object.values(tnById));
                }
                if (!cancelled)
                    setLoading(false);
            }
            catch (e) {
                if (!cancelled) {
                    setLoadError(e.message || "Verbindung zur Datenbank fehlgeschlagen.");
                    setLoading(false);
                }
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, [account]);
    useEffect(() => {
        if (account?.role === "player" && account.playerId && !selectedPlayerId) {
            setSelectedPlayerId(account.playerId);
        }
    }, [account, selectedPlayerId]);
    async function handleLogin(e) {
        e.preventDefault();
        setLoginError("");
        setLoginBusy(true);
        try {
            await auth.signInWithEmailAndPassword(codeToEmail(loginEmail), codeToPassword(loginEmail));
        }
        catch (err) {
            setLoginError("Code nicht gültig.");
        }
        finally {
            setLoginBusy(false);
        }
    }
    function handleLogout() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setActiveTab("uebersicht");
        setConfirmDeletePlayer(false);
        auth.signOut();
    }
    async function enableNotifications() {
        if (!messaging || typeof Notification === "undefined") {
            setNotifError("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
            return;
        }
        if (!FCM_VAPID_KEY) {
            setNotifError("Push ist noch nicht eingerichtet (VAPID-Schlüssel fehlt im Code).");
            return;
        }
        setNotifBusy(true);
        setNotifError("");
        try {
            const permission = await Notification.requestPermission();
            setNotifPermission(permission);
            if (permission !== "granted") {
                setNotifBusy(false);
                return;
            }
            const swReg = await navigator.serviceWorker.ready;
            const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swReg });
            if (!token)
                throw new Error("Kein Geräte-Token erhalten.");
            await db.collection("accounts").doc(firebaseUser.uid).set({ notificationTokens: firebase.firestore.FieldValue.arrayUnion(token) }, { merge: true });
            setAccount((prev) => prev ? { ...prev, notificationTokens: [...(prev.notificationTokens || []).filter((t) => t !== token), token] } : prev);
        }
        catch (e) {
            setNotifError(e.message || "Benachrichtigungen konnten nicht aktiviert werden.");
        }
        finally {
            setNotifBusy(false);
        }
    }
    async function disableNotifications() {
        if (!messaging)
            return;
        setNotifBusy(true);
        setNotifError("");
        try {
            const swReg = await navigator.serviceWorker.ready;
            const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swReg }).catch(() => null);
            if (token) {
                await db.collection("accounts").doc(firebaseUser.uid).set({ notificationTokens: firebase.firestore.FieldValue.arrayRemove(token) }, { merge: true });
                await messaging.deleteToken().catch(() => {});
                setAccount((prev) => prev ? { ...prev, notificationTokens: (prev.notificationTokens || []).filter((t) => t !== token) } : prev);
            }
        }
        finally {
            setNotifBusy(false);
        }
    }
    async function persistPlayerFields(playerId, changes) {
        setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, ...changes } : p)));
        try {
            await db.collection("players").doc(playerId).set(changes, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    async function persistPrivateFields(playerId, changes) {
        setPrivateData((prev) => ({ ...prev, [playerId]: { ...prev[playerId], ...changes } }));
        try {
            await db.collection("playerPrivate").doc(playerId).set(changes, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    async function persistWellness(playerId, entries) {
        setWellnessData((prev) => ({ ...prev, [playerId]: { entries } }));
        try {
            await db.collection("playerWellness").doc(playerId).set({ entries }, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    function addWellnessEntry(playerId, entry) {
        const cur = wellnessData[playerId]?.entries || [];
        persistWellness(playerId, [...cur, { id: uid(), date: today(), weekKey: isoWeekKey(today()), createdAt: today(), ...entry }]);
    }
    function deleteWellnessEntry(playerId, id) {
        const cur = wellnessData[playerId]?.entries || [];
        persistWellness(playerId, cur.filter((e) => e.id !== id));
    }
    async function persistTrainingLoad(playerId, entries) {
        setTrainingLoadData((prev) => ({ ...prev, [playerId]: { entries } }));
        try {
            await db.collection("playerTrainingLoad").doc(playerId).set({ entries }, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    function addTrainingLoadEntry(playerId, entry) {
        const cur = trainingLoadData[playerId]?.entries || [];
        persistTrainingLoad(playerId, [...cur, { id: uid(), createdAt: today(), ...entry }]);
    }
    function deleteTrainingLoadEntry(playerId, id) {
        const cur = trainingLoadData[playerId]?.entries || [];
        persistTrainingLoad(playerId, cur.filter((e) => e.id !== id));
    }
    async function persistGrades(playerId, subjects) {
        setGradesData((prev) => ({ ...prev, [playerId]: { subjects } }));
        try {
            await db.collection("playerGrades").doc(playerId).set({ subjects }, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    function saveGradeSubjects(playerId, subjects) {
        persistGrades(playerId, subjects);
    }
    function toggleGradeFlag(playerId, subjectId) {
        const cur = gradesData[playerId]?.subjects || [];
        persistGrades(playerId, cur.map((s) => (s.id === subjectId ? { ...s, flagged: !s.flagged } : s)));
    }
    function renameGradeSubject(playerId, subjectId, name) {
        const cur = gradesData[playerId]?.subjects || [];
        persistGrades(playerId, cur.map((s) => (s.id === subjectId ? { ...s, name } : s)));
    }
    function setGradeComment(playerId, subjectId, trainerComment) {
        const cur = gradesData[playerId]?.subjects || [];
        persistGrades(playerId, cur.map((s) => (s.id === subjectId ? { ...s, trainerComment } : s)));
    }
    async function persistMeta(changes) {
        if (changes.statCategories)
            changes = { ...changes, statCategories: changes.statCategories.filter((c) => !REMOVED_STAT_CATEGORY_IDS.includes(c.id)) };
        setMeta((prev) => ({ ...prev, ...changes }));
        try {
            await db.collection("club").doc("meta").set(changes, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    async function createPlayerDoc(playerId, initialData) {
        setPlayers((prev) => [...prev, { id: playerId, ...initialData }]);
        setPrivateData((prev) => ({ ...prev, [playerId]: { notes: [], tests: [], attendance: [], grades: [] } }));
        try {
            await db.collection("players").doc(playerId).set(initialData);
            await db.collection("playerPrivate").doc(playerId).set({ notes: [], tests: [], attendance: [], grades: [] });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    async function deletePlayerDoc(playerId) {
        setPlayers((prev) => prev.filter((p) => p.id !== playerId));
        setPrivateData((prev) => { const next = { ...prev }; delete next[playerId]; return next; });
        try {
            await db.collection("players").doc(playerId).delete();
            await db.collection("playerPrivate").doc(playerId).delete();
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    const [accounts, setAccounts] = useState([]);
    const [accountsLoaded, setAccountsLoaded] = useState(false);
    async function loadAccounts() {
        const snap = await db.collection("accounts").get();
        setAccounts(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setAccountsLoaded(true);
    }
    async function createAccount({ label, code, role, playerId, teamId }) {
        const cred = await secondaryAuth.createUserWithEmailAndPassword(codeToEmail(code), codeToPassword(code));
        const newUid = cred.user.uid;
        const accountDoc = { label, code, role, playerId: role === "player" ? playerId : null, teamId: role === "trainer" ? (teamId || null) : null };
        await db.collection("accounts").doc(newUid).set(accountDoc);
        await secondaryAuth.signOut();
        setAccounts((prev) => [...prev, { uid: newUid, ...accountDoc }]);
    }
    async function deleteAccount(uid) {
        // Erst das eigentliche Login-Konto bei Firebase Auth entfernen (geht vom
        // Client aus nur ueber eine Cloud Function mit Admin-Rechten), danach den
        // Datenbank-Eintrag - sonst bliebe der Code weiterhin gueltig zum Anmelden,
        // landet dann aber ohne Zugangsdaten in der App ("kein Zugang hinterlegt").
        try {
            await functionsInstance.httpsCallable("deleteAccountAuth")({ uid });
        }
        catch (e) {
            console.error("Login-Konto konnte nicht mitgeloescht werden", e);
        }
        await db.collection("accounts").doc(uid).delete();
        setAccounts((prev) => prev.filter((a) => a.uid !== uid));
    }
    async function addCalendarEvent(event) {
        const base = {
            title: event.title, time: event.time || "", endTime: event.endTime || "", location: event.location || "",
            type: event.type, teamId: event.teamId || null, notes: event.notes || "",
            excludedPlayerIds: event.excludedPlayerIds || [], includedPlayerIds: event.includedPlayerIds || [],
            involvedTeamIds: computeInvolvedTeamIds(event.teamId || null, event.includedPlayerIds || [], players),
        };
        if (event.repeatUntil) {
            const dates = [];
            let d = new Date(event.date + "T00:00:00");
            const end = new Date(event.repeatUntil + "T00:00:00");
            while (d <= end && dates.length < 104) {
                dates.push(isoDate(d));
                d.setDate(d.getDate() + 7);
            }
            const batch = db.batch();
            const newEvents = dates.map((date) => {
                const ref = db.collection("calendarEvents").doc();
                const ev = { ...base, date };
                batch.set(ref, ev);
                return { id: ref.id, ...ev };
            });
            await batch.commit();
            setCalendarEvents((prev) => [...prev, ...newEvents]);
            return;
        }
        const newEvent = { ...base, date: event.date };
        const ref = await db.collection("calendarEvents").add(newEvent);
        setCalendarEvents((prev) => [...prev, { id: ref.id, ...newEvent }]);
    }
    async function editCalendarEvent(id, changes) {
        const existing = calendarEvents.find((e) => e.id === id);
        const merged = { ...existing, ...changes };
        const fullChanges = { ...changes, involvedTeamIds: computeInvolvedTeamIds(merged.teamId || null, merged.includedPlayerIds || [], players) };
        setCalendarEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...fullChanges } : e)));
        await db.collection("calendarEvents").doc(id).set(fullChanges, { merge: true });
    }
    async function setPlayerAttendance(eventId, playerId, status, reason) {
        const value = status ? { status, reason: reason || "" } : null;
        setEventAttendance((prev) => {
            const next = { ...prev, [eventId]: { ...(prev[eventId] || {}) } };
            if (value)
                next[eventId][playerId] = value;
            else
                delete next[eventId][playerId];
            return next;
        });
        try {
            await db.collection("eventAttendance").doc(eventId).set({ [playerId]: value || firebase.firestore.FieldValue.delete() }, { merge: true });
            setSaveError(false);
        }
        catch (e) {
            setSaveError(true);
        }
    }
    async function deleteCalendarEvent(id) {
        setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
        await db.collection("calendarEvents").doc(id).delete();
    }
    async function deleteCalendarEventsBatch(ids) {
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const batch = db.batch();
            chunk.forEach((id) => batch.delete(db.collection("calendarEvents").doc(id)));
            await batch.commit();
        }
    }
    async function clearTeamCalendar(teamId) {
        const ids = calendarEvents.filter((e) => e.teamId === teamId).map((e) => e.id);
        if (ids.length === 0)
            return;
        setCalendarEvents((prev) => prev.filter((e) => e.teamId !== teamId));
        await deleteCalendarEventsBatch(ids);
    }
    async function clearAllCalendars() {
        const ids = calendarEvents.map((e) => e.id);
        if (ids.length === 0)
            return;
        setCalendarEvents([]);
        await deleteCalendarEventsBatch(ids);
    }
    async function addTeamNote(note) {
        const newNote = {
            teamId: note.teamId, date: note.date, title: note.title, text: note.text || "",
            attachmentUrl: note.attachmentUrl || "", attachmentName: note.attachmentName || "",
            sharedWithAll: !!note.sharedWithAll,
            sharedWithPlayerIds: note.sharedWithPlayerIds || [],
        };
        const ref = await db.collection("teamNotes").add(newNote);
        setTeamNotes((prev) => [...prev, { id: ref.id, ...newNote }]);
    }
    async function deleteTeamNote(id) {
        setTeamNotes((prev) => prev.filter((n) => n.id !== id));
        await db.collection("teamNotes").doc(id).delete();
    }
    const [devPlanCycles, setDevPlanCycles] = useState([]);
    const [devPlanLoading, setDevPlanLoading] = useState(false);
    useEffect(() => {
        const activePlayer = players.find((p) => p.id === selectedPlayerId) || null;
        if (activeTab !== "entwicklung" || !activePlayer) return;
        let cancelled = false;
        async function loadDevPlans() {
            setDevPlanLoading(true);
            try {
                // Fuer den Spieler-Zugang selbst darf devPlanTrainer laut Firestore-Regeln
                // nur mit released == true GELESEN werden (Trainer-Notizen sind bis zur
                // Freigabe privat) - die Abfrage muss das Filterkriterium deshalb exakt so
                // stellen, sonst lehnt Firestore die ganze Liste mit permission-denied ab,
                // auch wenn einzelne Dokumente eigentlich schon freigegeben waeren.
                const trainerQuery = isTrainer
                    ? db.collection("devPlanTrainer").where("playerId", "==", activePlayer.id)
                    : db.collection("devPlanTrainer").where("playerId", "==", activePlayer.id).where("released", "==", true);
                const [pSnap, tSnap, cSnap] = await Promise.all([
                    db.collection("devPlanPlayer").where("playerId", "==", activePlayer.id).get(),
                    trainerQuery.get(),
                    db.collection("devPlanCombined").where("playerId", "==", activePlayer.id).get(),
                ]);
                const byId = {};
                pSnap.docs.forEach((d) => { byId[d.id] = byId[d.id] || { id: d.id }; byId[d.id].player = d.data(); byId[d.id].date = d.data().date; });
                tSnap.docs.forEach((d) => { byId[d.id] = byId[d.id] || { id: d.id }; byId[d.id].trainer = d.data(); byId[d.id].date = byId[d.id].date || d.data().date; });
                cSnap.docs.forEach((d) => { byId[d.id] = byId[d.id] || { id: d.id }; byId[d.id].combined = d.data(); byId[d.id].date = byId[d.id].date || d.data().date; });
                if (!cancelled) setDevPlanCycles(Object.values(byId));
            } catch (e) {
                console.error("devPlan load error", e);
            } finally {
                if (!cancelled) setDevPlanLoading(false);
            }
        }
        loadDevPlans();
        return () => { cancelled = true; };
    }, [activeTab, selectedPlayerId, players]);

    async function createDevPlanCycle() {
        const id = uid();
        const date = today();
        const base = { playerId: selectedPlayer.id, date, released: false, answers: {} };
        await Promise.all([
            db.collection("devPlanPlayer").doc(id).set(base),
            db.collection("devPlanTrainer").doc(id).set(base),
        ]);
        setDevPlanCycles((prev) => [...prev, { id, date, player: { ...base }, trainer: { ...base } }]);
    }
    async function saveDevPlanPlayer(id, vals) {
        await db.collection("devPlanPlayer").doc(id).set({ answers: vals, playerId: selectedPlayer.id }, { merge: true });
        setDevPlanCycles((prev) => prev.map((c) => (c.id === id ? { ...c, player: { ...c.player, answers: vals } } : c)));
    }
    async function releaseDevPlanPlayer(id) {
        await db.collection("devPlanPlayer").doc(id).set({ released: true }, { merge: true });
        setDevPlanCycles((prev) => prev.map((c) => (c.id === id ? { ...c, player: { ...c.player, released: true } } : c)));
    }
    async function saveDevPlanTrainer(id, vals) {
        await db.collection("devPlanTrainer").doc(id).set({ answers: vals, playerId: selectedPlayer.id }, { merge: true });
        setDevPlanCycles((prev) => prev.map((c) => (c.id === id ? { ...c, trainer: { ...c.trainer, answers: vals } } : c)));
    }
    async function releaseDevPlanTrainer(id) {
        await db.collection("devPlanTrainer").doc(id).set({ released: true }, { merge: true });
        setDevPlanCycles((prev) => prev.map((c) => (c.id === id ? { ...c, trainer: { ...c.trainer, released: true } } : c)));
    }
    async function saveDevPlanCombined(id, vals) {
        await db.collection("devPlanCombined").doc(id).set({ answers: vals, playerId: selectedPlayer.id }, { merge: true });
        setDevPlanCycles((prev) => prev.map((c) => (c.id === id ? { ...c, combined: { ...c.combined, answers: vals } } : c)));
    }
    async function deleteDevPlanCycle(id) {
        setDevPlanCycles((prev) => prev.filter((c) => c.id !== id));
        await Promise.all([
            db.collection("devPlanPlayer").doc(id).delete().catch(() => {}),
            db.collection("devPlanTrainer").doc(id).delete().catch(() => {}),
            db.collection("devPlanCombined").doc(id).delete().catch(() => {}),
        ]);
    }
    const devPlanTemplates = meta?.devPlanTemplates || DEFAULT_DEVPLAN_TEMPLATES;
    function saveDevPlanTemplates(templates) {
        persistMeta({ devPlanTemplates: templates });
    }
    // Feedback-Loop: Verlauf (beide Richtungen) wird - wie beim Development Plan -
    // erst geladen, wenn der Feedback-Tab eines Spielers tatsaechlich geoeffnet
    // wird (nicht fuer alle Spieler auf Vorrat).
    const [feedbackItems, setFeedbackItems] = useState([]);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    useEffect(() => {
        const activePlayer = players.find((p) => p.id === selectedPlayerId) || null;
        if (activeTab !== "feedback" || !activePlayer) return;
        let cancelled = false;
        async function loadFeedback() {
            setFeedbackLoading(true);
            try {
                const [toPlayerSnap, toTrainerSnap] = await Promise.all([
                    db.collection("feedbackTrainerToPlayer").where("playerId", "==", activePlayer.id).get(),
                    db.collection("feedbackPlayerToTrainer").where("playerId", "==", activePlayer.id).get(),
                ]);
                const items = [
                    ...toPlayerSnap.docs.map((d) => ({ id: d.id, direction: "trainerToPlayer", ...d.data() })),
                    ...toTrainerSnap.docs.map((d) => ({ id: d.id, direction: "playerToTrainer", ...d.data() })),
                ].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                if (!cancelled) setFeedbackItems(items);
            } catch (e) {
                console.error("feedback load error", e);
            } finally {
                if (!cancelled) setFeedbackLoading(false);
            }
        }
        loadFeedback();
        return () => { cancelled = true; };
    }, [activeTab, selectedPlayerId, players]);
    async function requestFeedbackToPlayer(playerIds, eventId, eventLabel) {
        const refs = await Promise.all(playerIds.map((pid) => {
            const player = players.find((p) => p.id === pid);
            return db.collection("feedbackTrainerToPlayer").add({
                playerId: pid,
                teamId: player?.teamId || null,
                eventId: eventId || null,
                eventLabel,
                createdBy: firebaseUser?.uid || null,
                createdAt: today(),
                status: "pending",
                answer: null,
            });
        }));
        if (selectedPlayerId && playerIds.includes(selectedPlayerId)) {
            const ref = refs[playerIds.indexOf(selectedPlayerId)];
            setFeedbackItems((prev) => [{ id: ref.id, direction: "trainerToPlayer", playerId: selectedPlayerId, eventId, eventLabel, createdAt: today(), status: "pending", answer: null }, ...prev]);
        }
    }
    async function requestFeedbackToTrainer(eventId, eventLabel, customQuestions) {
        const questions = customQuestions || [];
        const ref = await db.collection("feedbackPlayerToTrainer").add({
            playerId: selectedPlayer.id,
            teamId: selectedPlayer.teamId || null,
            eventId: eventId || null,
            eventLabel,
            customQuestions: questions,
            createdAt: today(),
            status: "pending",
            answer: null,
        });
        setFeedbackItems((prev) => [{ id: ref.id, direction: "playerToTrainer", playerId: selectedPlayer.id, eventId, eventLabel, customQuestions: questions, createdAt: today(), status: "pending", answer: null }, ...prev]);
    }
    async function answerFeedbackToPlayer(id, answer) {
        await db.collection("feedbackTrainerToPlayer").doc(id).set({ status: "answered", answer }, { merge: true });
        setFeedbackItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "answered", answer } : it)));
    }
    async function answerFeedbackToTrainer(id, answer) {
        await db.collection("feedbackPlayerToTrainer").doc(id).set({ status: "answered", answer }, { merge: true });
        setFeedbackItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "answered", answer } : it)));
        setFeedbackWaiting((prev) => prev.filter((w) => w.id !== id));
    }
    async function deleteFeedbackItem(id, direction) {
        const coll = direction === "trainerToPlayer" ? "feedbackTrainerToPlayer" : "feedbackPlayerToTrainer";
        await db.collection(coll).doc(id).delete();
        setFeedbackItems((prev) => prev.filter((it) => it.id !== id));
        setFeedbackWaiting((prev) => prev.filter((w) => w.id !== id));
    }

    if (firebaseUser === undefined || (firebaseUser && loading)) {
        return (React.createElement("div", { className: "min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-stone-50 rsk-fade-in" },
            React.createElement("img", { src: LOGO_FULL_DATA_URI, alt: "BB-Player File", className: "w-48 h-48 object-contain" }),
            React.createElement(IconLoader, { className: "animate-spin text-[#C43E0E]", size: 22 })));
    }
    if (loadError) {
        return (React.createElement("div", { className: "min-h-[100dvh] flex items-center justify-center bg-stone-50 p-6" },
            React.createElement("div", { className: `max-w-md w-full text-center ${cardClass} p-6 rsk-fade-in` },
                React.createElement(IconAlert, { size: 26, className: "mx-auto text-red-500 mb-2" }),
                React.createElement("p", { className: "text-sm font-semibold text-slate-900 mb-1" }, "Verbindung zur Datenbank fehlgeschlagen"),
                React.createElement("p", { className: "text-xs text-slate-500" }, loadError),
                React.createElement("button", { onClick: handleLogout, className: "mt-4 text-xs text-slate-500 underline" }, "Abmelden und erneut versuchen"))));
    }
    if (!firebaseUser) {
        return (React.createElement("div", { className: "min-h-[100dvh] bg-stone-50 relative overflow-hidden flex items-center justify-center p-6" },
            React.createElement("div", { className: "pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#C43E0E]/10 blur-3xl" }),
            React.createElement("div", { className: "pointer-events-none absolute -bottom-28 -left-24 w-72 h-72 rounded-full bg-[#C43E0E]/10 blur-3xl" }),
            React.createElement("div", { className: "relative w-full max-w-sm rsk-fade-in" },
            React.createElement("div", { className: "flex flex-col items-center mb-6" },
                React.createElement("img", { src: LOGO_DATA_URI, alt: "BB-Player File", className: "h-16 w-16 object-contain mb-3" }),
                React.createElement("div", { className: "flex items-center gap-2" },
                    React.createElement("span", { className: "h-[2px] w-5 bg-[#C43E0E]" }),
                    React.createElement("h1", { className: "font-display text-lg tracking-wide bg-gradient-to-r from-[#C43E0E] via-slate-900 to-[#C43E0E] bg-clip-text text-transparent" }, "SPIELER-AKTE"),
                    React.createElement("span", { className: "h-[2px] w-5 bg-[#C43E0E]" }))),
            React.createElement("div", { className: `${cardClass} p-6` },
                React.createElement("div", { className: "flex items-center gap-2.5 mb-1" },
                    React.createElement("span", { className: "w-8 h-8 rounded-full bg-gradient-to-br from-[#C43E0E] to-[#8A2C0A] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(196,62,14,0.35)]" },
                        React.createElement(IconLock, { size: 15, className: "text-white" })),
                    React.createElement("h2", { className: "text-base font-bold text-slate-900" }, "Anmelden")),
                React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "Gib deinen pers\u00F6nlichen Code ein."),
                React.createElement("form", { onSubmit: handleLogin, className: "space-y-3" },
                    React.createElement("input", { className: inputClass + " tracking-wide text-center text-base py-3", type: "text", placeholder: "Code", value: loginEmail, onChange: (e) => { setLoginEmail(e.target.value); setLoginError(""); }, autoFocus: true, autoCapitalize: "none", autoCorrect: "off" }),
                    loginError && React.createElement("p", { className: "text-xs text-red-600 text-center rsk-fade-in" }, loginError),
                    React.createElement("button", { type: "submit", disabled: loginBusy, className: btnPrimaryClass + " w-full py-3 text-sm" }, loginBusy && React.createElement(IconLoader, { size: 15 }), loginBusy ? "Wird geprüft…" : "Anmelden"))))));
    }
    if (!account || !meta) {
        return (React.createElement("div", { className: "min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-stone-50 rsk-fade-in" },
            React.createElement("img", { src: LOGO_FULL_DATA_URI, alt: "BB-Player File", className: "w-48 h-48 object-contain" }),
            React.createElement(IconLoader, { className: "animate-spin text-[#C43E0E]", size: 22 })));
    }
    const isTrainer = account.role === "trainer";
    const greetingHour = new Date().getHours();
    const playerGreeting = greetingHour < 11 ? "Guten Morgen" : greetingHour < 18 ? "Willkommen zurück" : "Guten Abend";
    // Team-beschraenkter Trainer-Zugang: account.teamId gesetzt -> sieht/verwaltet
    // nur sein eigenes Team (players/calendarEvents/etc. sind bereits beim Laden
    // entsprechend eingeschraenkt, hier nur fuer UI-Sichtbarkeit von Verwaltung/
    // Team-Auswahl etc.). Ohne teamId: Vollzugriff-Trainer wie bisher.
    const trainerTeamId = isTrainer ? (account.teamId || null) : null;
    const isFullTrainer = isTrainer && !trainerTeamId;
    const teams = meta.teams;
    const visibleTeams = trainerTeamId ? teams.filter((t) => t.id === trainerTeamId) : teams;
    const dbbEligibleTeams = visibleTeams.filter((t) => DBB_SCORES_ALTERSKLASSEN.includes(t.altersklasse));
    const visiblePlayers = players
        .filter((p) => selectedTeamId === "all" || p.teamId === selectedTeamId)
        .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));
    const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || null;
    /* Erstes Login eines Spieler-Zugangs: Profil-Pflichtfenster, solange die
       eigenen Daten (Kontakt/Notfallkontakt/Wohnort etc.) noch nicht einmal
       ausgefüllt wurden. Trainer sind davon nie betroffen. */
    if (!isTrainer && selectedPlayer && selectedPlayer.id === account.playerId && selectedPlayer.onboardingCompleted !== true) {
        return (React.createElement("div", { className: "min-h-[100dvh] bg-stone-50 flex items-center justify-center p-4 sm:p-6" },
            React.createElement("div", { className: "w-full max-w-lg rsk-fade-in" },
                React.createElement("div", { className: "flex flex-col items-center text-center mb-5" },
                    React.createElement("img", { src: LOGO_DATA_URI, alt: "BB-Player File", className: "h-14 w-14 object-contain mb-3" }),
                    React.createElement("h1", { className: "font-display text-xl text-slate-900" }, "Willkommen, ", splitName(selectedPlayer.name).first || selectedPlayer.name, "!"),
                    React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Bevor es losgeht, brauchen wir noch ein paar Angaben von dir - dauert nur eine Minute.")),
                React.createElement("div", { className: `${cardClass} p-5 sm:p-6` },
                    React.createElement(PlayerSelfProfileForm, { initial: selectedPlayer, mandatory: true, onSubmit: (changes) => persistPlayerFields(selectedPlayer.id, changes) })))));
    }
    const selectedTeam = selectedPlayer ? teams.find((t) => t.id === selectedPlayer.teamId) : null;
    // Abgespeckte Akte fuer U12-U18: kein eigenstaendiges Athletik-Testing,
    // deshalb Reiter ausblenden (Statistik-Ansicht folgt hier noch separat).
    const isAbgespeckteAkte = selectedTeam && DBB_SCORES_ALTERSKLASSEN.includes(selectedTeam.altersklasse);
    const breadcrumbItems = [];
    if (isTrainer) {
        breadcrumbItems.push({ label: "Dashboard", onClick: goHome });
        if (showGlobalCalendar) {
            breadcrumbItems.push({ label: "Kalender (alle Teams)", onClick: null });
        }
        else if (showVerwaltung) {
            breadcrumbItems.push({ label: "Verwaltung", onClick: null });
        }
        else if (showAllUnits) {
            breadcrumbItems.push({ label: "Alle Einheiten", onClick: null });
        }
        else if (showAttendance) {
            breadcrumbItems.push({ label: "Anwesenheit", onClick: null });
        }
        else if (selectedPlayer) {
            if (selectedTeam)
                breadcrumbItems.push({ label: selectedTeam.name, onClick: () => { setSelectedPlayerId(null); setSelectedTeamId(selectedTeam.id); setShowTeamCalendar(false); setShowGlobalCalendar(false); } });
            breadcrumbItems.push({ label: selectedPlayer.name, onClick: null });
            const tabLabel = TABS.find((t) => t.key === activeTab)?.label;
            if (tabLabel)
                breadcrumbItems.push({ label: tabLabel, onClick: null });
        }
        else if (selectedTeamId !== "all") {
            const currentTeam = teams.find((tm) => tm.id === selectedTeamId);
            if (currentTeam) {
                breadcrumbItems.push({ label: currentTeam.name, onClick: showTeamCalendar ? () => setShowTeamCalendar(false) : null });
                if (showTeamCalendar)
                    breadcrumbItems.push({ label: "Kalender", onClick: null });
            }
        }
    }
    const playerStats = selectedPlayer ? sortByDateDesc(selectedPlayer.stats || []) : [];
    const playerTests = selectedPlayer && isTrainer ? sortByDateDesc(privateData[selectedPlayer.id]?.tests || []) : [];
    const playerVideos = selectedPlayer ? sortByDateDesc(selectedPlayer.videos || []) : [];
    const playerNotes = selectedPlayer && isTrainer ? sortByDateDesc(privateData[selectedPlayer.id]?.notes || []) : [];
    const playerGradeSubjects = selectedPlayer ? (gradesData[selectedPlayer.id]?.subjects || []) : [];
    const playerAttendance = selectedPlayer && isTrainer ? sortByDateDesc(privateData[selectedPlayer.id]?.attendance || []) : [];
    // Live-Anwesenheitshistorie dieses Spielers aus den in "Anwesenheit"/"Alle Einheiten"
    // markierten Terminen (ersetzt die alte CSV-Import-Ansicht im "Anwesenheit"-Tab).
    const playerLiveAttendanceRows = selectedPlayer && isTrainer
        ? calendarEvents
            .filter((e) => e.date && e.date <= today() && getEventAttendees(e, players).some((p) => p.id === selectedPlayer.id))
            .map((e) => ({ event: e, mark: attendanceMark(eventAttendance, e.id, selectedPlayer.id) }))
            .sort((a, b) => (b.event.date + (b.event.time || "")).localeCompare(a.event.date + (a.event.time || "")))
        : [];
    const playerLiveAttendanceStats = playerLiveAttendanceRows.reduce((acc, r) => {
        if (r.mark.status === "present")
            acc.present++;
        else if (r.mark.status === "absent")
            acc.absent++;
        else if (r.mark.status === "injured")
            acc.injured++;
        return acc;
    }, { present: 0, absent: 0, injured: 0 });
    const playerLiveAttendanceQuote = attendanceQuote(playerLiveAttendanceStats.present, playerLiveAttendanceStats.absent);
    const playerWellnessEntries = selectedPlayer ? sortByDateDesc(wellnessData[selectedPlayer.id]?.entries || []) : [];
    const playerTrainingLoadEntries = selectedPlayer ? (trainingLoadData[selectedPlayer.id]?.entries || []) : [];
    const playerTrainingLoadEvents = selectedPlayer ? getPlayerVisibleEvents(calendarEvents, selectedPlayer) : [];
    const avg = (key) => (playerStats.length ? fmtNum(playerStats.reduce((sum, s) => sum + (Number(s[key]) || 0), 0) / playerStats.length, 1) : "–");
    const totalPct = (madeKey, attKey) => {
        const made = playerStats.reduce((sum, s) => sum + (Number(s[madeKey]) || 0), 0);
        const att = playerStats.reduce((sum, s) => sum + (Number(s[attKey]) || 0), 0);
        return att ? `${Math.round((made / att) * 1000) / 10}%` : "–";
    };
    function selectPlayer(id) {
        setSelectedPlayerId(id);
        setActiveTab("uebersicht");
        setConfirmDeletePlayer(false);
        setShowTeamCalendar(false);
        setShowGlobalCalendar(false);
        setShowVerwaltung(false);
        setShowAllUnits(false);
        setShowAttendance(false);
        setMobileSidebarOpen(false);
    }
    function goHome() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setShowGlobalCalendar(false);
        setShowVerwaltung(false);
        setShowAllUnits(false);
        setShowAttendance(false);
        setConfirmDeletePlayer(false);
        setMobileSidebarOpen(false);
    }
    function goToTeamCalendar(teamId) {
        setSelectedPlayerId(null);
        setSelectedTeamId(teamId);
        setShowTeamCalendar(true);
        setShowGlobalCalendar(false);
        setShowVerwaltung(false);
        setShowAllUnits(false);
        setShowAttendance(false);
        setMobileSidebarOpen(false);
    }
    function goVerwaltung() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setShowGlobalCalendar(false);
        setShowVerwaltung(true);
        setShowAllUnits(false);
        setShowAttendance(false);
        setConfirmDeletePlayer(false);
        setMobileSidebarOpen(false);
    }
    function goGlobalCalendar() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setShowVerwaltung(false);
        setShowGlobalCalendar(true);
        setShowAllUnits(false);
        setShowAttendance(false);
        setConfirmDeletePlayer(false);
        setMobileSidebarOpen(false);
    }
    function goAllUnits() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setShowGlobalCalendar(false);
        setShowVerwaltung(false);
        setShowAllUnits(true);
        setShowAttendance(false);
        setConfirmDeletePlayer(false);
        setMobileSidebarOpen(false);
    }
    function goAttendance() {
        setSelectedPlayerId(null);
        setSelectedTeamId("all");
        setShowTeamCalendar(false);
        setShowGlobalCalendar(false);
        setShowVerwaltung(false);
        setShowAllUnits(false);
        setShowAttendance(true);
        setConfirmDeletePlayer(false);
        setMobileSidebarOpen(false);
    }
    function handleAddTeam(team) {
        const newTeam = { id: uid(), ...team };
        persistMeta({ teams: [...meta.teams, newTeam] });
    }
    function handleEditTeam(id, changes) {
        persistMeta({ teams: meta.teams.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
    }
    function handleAddPlayer(player) {
        const newId = uid();
        createPlayerDoc(newId, { ...player, stats: [], videos: [], onboardingCompleted: false });
        selectPlayer(newId);
    }
    function handleEditPlayer(changes) {
        persistPlayerFields(selectedPlayer.id, changes);
    }
    function handleDeletePlayer() {
        deletePlayerDoc(selectedPlayer.id);
        setSelectedPlayerId(null);
        setConfirmDeletePlayer(false);
    }
    function handleAddStat(entry) {
        persistPlayerFields(selectedPlayer.id, { stats: [...(selectedPlayer.stats || []), { id: uid(), ...entry }] });
    }
    function handleEditStat(entry) {
        persistPlayerFields(selectedPlayer.id, { stats: (selectedPlayer.stats || []).map((s) => (s.id === entry.id ? { ...s, ...entry } : s)) });
    }
    function handleAddTest(entry) {
        const cur = privateData[selectedPlayer.id]?.tests || [];
        persistPrivateFields(selectedPlayer.id, { tests: [...cur, { id: uid(), ...entry }] });
    }
    function handleEditTest(entry) {
        const cur = privateData[selectedPlayer.id]?.tests || [];
        persistPrivateFields(selectedPlayer.id, { tests: cur.map((t) => (t.id === entry.id ? { ...t, ...entry } : t)) });
    }
    function handleAddVideo(entry) {
        persistPlayerFields(selectedPlayer.id, { videos: [...(selectedPlayer.videos || []), { id: uid(), ...entry }] });
    }
    function handleAddNote(entry) {
        const cur = privateData[selectedPlayer.id]?.notes || [];
        persistPrivateFields(selectedPlayer.id, { notes: [...cur, { id: uid(), ...entry }] });
    }
    async function handleImportCalendarEvents(events) {
        if (events.length === 0)
            return;
        const chunks = [];
        for (let i = 0; i < events.length; i += 400)
            chunks.push(events.slice(i, i + 400));
        const allNew = [];
        for (const chunk of chunks) {
            const batch = db.batch();
            const newOnes = chunk.map((ev) => {
                const ref = db.collection("calendarEvents").doc();
                const doc = { title: ev.title, date: ev.date, time: ev.time || "", endTime: ev.endTime || "", location: ev.location || "", type: ev.type, teamId: ev.teamId || null, notes: "", excludedPlayerIds: [], includedPlayerIds: ev.includedPlayerIds || [], involvedTeamIds: computeInvolvedTeamIds(ev.teamId || null, ev.includedPlayerIds || [], players) };
                batch.set(ref, doc);
                return { id: ref.id, ...doc };
            });
            await batch.commit();
            allNew.push(...newOnes);
        }
        setCalendarEvents((prev) => [...prev, ...allNew]);
    }
    function handleImportAttendance(entries, date) {
        const byPlayer = {};
        entries.forEach((e) => { (byPlayer[e.playerId] = byPlayer[e.playerId] || []).push({ id: uid(), date, ...e }); });
        Object.entries(byPlayer).forEach(([playerId, newRecords]) => {
            const cur = privateData[playerId]?.attendance || [];
            persistPrivateFields(playerId, { attendance: [...cur, ...newRecords] });
        });
    }
    function handleImportBoxscore(entries, date, gegner) {
        const cats = statCategories.map((c) => ({ ...c, fields: [...c.fields] }));
        let normalCat = cats.find((c) => c.id === "normal") || cats[0];
        function findOrCreateField(label, altLabels = []) {
            const names = [label.toLowerCase(), ...altLabels.map((l) => l.toLowerCase())];
            for (const c of cats) {
                const f = c.fields.find((f) => names.includes(f.label.toLowerCase()));
                if (f)
                    return f.id;
            }
            const newField = { id: uid(), label, kind: "number" };
            normalCat.fields = [...normalCat.fields, newField];
            return newField.id;
        }
        const foulsFieldId = findOrCreateField("Fouls", ["Fouls (PF)"]);
        const rebOffFieldId = findOrCreateField("Rebounds Offensiv", ["Offensive Rebounds", "OR"]);
        const rebDefFieldId = findOrCreateField("Rebounds Defensiv", ["Defensive Rebounds", "DR"]);
        const effFieldId = findOrCreateField("Effizienz", ["EFF", "EF"]);
        persistMeta({ statCategories: cats });
        entries.forEach(({ playerId, stats: row }) => {
            const fieldValues = { minuten: row.minuten };
            if (row.punkte !== null)
                fieldValues.punkte = row.punkte;
            if (row.rebounds !== null)
                fieldValues.rebounds = row.rebounds;
            if (row.assists !== null)
                fieldValues.assists = row.assists;
            if (row.steals !== null)
                fieldValues.steals = row.steals;
            if (row.blocks !== null)
                fieldValues.blocks = row.blocks;
            if (row.turnovers !== null)
                fieldValues.turnovers = row.turnovers;
            if (row.fouls !== null)
                fieldValues[foulsFieldId] = row.fouls;
            if (row.rebOff !== null)
                fieldValues[rebOffFieldId] = row.rebOff;
            if (row.rebDef !== null)
                fieldValues[rebDefFieldId] = row.rebDef;
            if (row.eff !== null)
                fieldValues[effFieldId] = row.eff;
            if (row.fgm !== null)
                fieldValues.fg_m = row.fgm;
            if (row.fga !== null)
                fieldValues.fg_a = row.fga;
            if (row.tpm !== null)
                fieldValues.tp_m = row.tpm;
            if (row.tpa !== null)
                fieldValues.tp_a = row.tpa;
            if (row.ftm !== null)
                fieldValues.ft_m = row.ftm;
            if (row.fta !== null)
                fieldValues.ft_a = row.fta;
            const player = players.find((p) => p.id === playerId);
            if (!player)
                return;
            const newStats = [...(player.stats || [])];
            const existingIdx = newStats.findIndex((s) => s.date === date);
            if (existingIdx !== -1) {
                newStats[existingIdx] = { ...newStats[existingIdx], ...fieldValues };
            }
            else {
                newStats.push({ id: uid(), date, gegner: gegner || "", ...fieldValues });
            }
            persistPlayerFields(playerId, { stats: newStats });
        });
    }
    function handleImportDbbScores(entries, date, gegner) {
        const cats = statCategories.map((c) => ({ ...c, fields: [...c.fields] }));
        let normalCat = cats.find((c) => c.id === "normal") || cats[0];
        let dbbCat = cats.find((c) => c.id === "dbbScores");
        if (!dbbCat) {
            dbbCat = { id: "dbbScores", label: "DBB Scores", fields: [] };
            cats.push(dbbCat);
        }
        function findOrCreateField(cat, label, altLabels = []) {
            const names = [label.toLowerCase(), ...altLabels.map((l) => l.toLowerCase())];
            for (const c of cats) {
                const f = c.fields.find((f) => names.includes(f.label.toLowerCase()));
                if (f)
                    return f.id;
            }
            const newField = { id: uid(), label, kind: "number" };
            cat.fields = [...cat.fields, newField];
            return newField.id;
        }
        const foulsFieldId = findOrCreateField(normalCat, "Fouls", ["Fouls (PF)"]);
        const zweiPktFieldId = findOrCreateField(dbbCat, "2-Punkte-Körbe");
        const dreiPktFieldId = findOrCreateField(dbbCat, "3-Punkte-Körbe");
        const plusMinusFieldId = findOrCreateField(dbbCat, "Plus/Minus");
        persistMeta({ statCategories: cats });
        entries.forEach(({ playerId, stats: row }) => {
            const fieldValues = {};
            if (row.minuten !== null)
                fieldValues.minuten = row.minuten;
            if (row.punkte !== null)
                fieldValues.punkte = row.punkte;
            if (row.ft_m !== null)
                fieldValues.ft_m = row.ft_m;
            if (row.ft_a !== null)
                fieldValues.ft_a = row.ft_a;
            if (row.fouls !== null)
                fieldValues[foulsFieldId] = row.fouls;
            if (row.zweiPkt !== null)
                fieldValues[zweiPktFieldId] = row.zweiPkt;
            if (row.dreiPkt !== null)
                fieldValues[dreiPktFieldId] = row.dreiPkt;
            if (row.plusMinus !== null)
                fieldValues[plusMinusFieldId] = row.plusMinus;
            const player = players.find((p) => p.id === playerId);
            if (!player)
                return;
            const newStats = [...(player.stats || [])];
            const existingIdx = newStats.findIndex((s) => s.date === date);
            if (existingIdx !== -1) {
                newStats[existingIdx] = { ...newStats[existingIdx], ...fieldValues };
            }
            else {
                newStats.push({ id: uid(), date, gegner: gegner || "", minuten: row.minuten ?? 0, ...fieldValues });
            }
            persistPlayerFields(playerId, { stats: newStats });
        });
    }
    function handleImportAdvancedStats(entries, date, gegner) {
        const cats = statCategories.map((c) => ({ ...c, fields: [...c.fields] }));
        let advancedCat = cats.find((c) => c.id === "advanced");
        if (!advancedCat) {
            advancedCat = { id: "advanced", label: "Advanced", fields: [] };
            cats.push(advancedCat);
        }
        const allLabels = new Set();
        entries.forEach(({ values }) => Object.keys(values).forEach((label) => allLabels.add(label)));
        const labelToFieldId = {};
        allLabels.forEach((label) => {
            let foundId = null;
            for (const c of cats) {
                const f = c.fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
                if (f) {
                    foundId = f.id;
                    break;
                }
            }
            if (foundId) {
                labelToFieldId[label] = foundId;
            }
            else {
                const newField = { id: uid(), label, kind: "number" };
                advancedCat.fields = [...advancedCat.fields, newField];
                labelToFieldId[label] = newField.id;
            }
        });
        persistMeta({ statCategories: cats });
        entries.forEach(({ playerId, values }) => {
            const fieldValues = {};
            Object.entries(values).forEach(([label, val]) => { fieldValues[labelToFieldId[label]] = val; });
            const player = players.find((p) => p.id === playerId);
            if (!player)
                return;
            const newStats = [...(player.stats || [])];
            const existingIdx = newStats.findIndex((s) => s.date === date);
            if (existingIdx !== -1) {
                newStats[existingIdx] = { ...newStats[existingIdx], ...fieldValues };
            }
            else {
                newStats.push({ id: uid(), date, gegner: gegner || "", ...fieldValues });
            }
            persistPlayerFields(playerId, { stats: newStats });
        });
    }
    function deleteItem(collection, id) {
        if (collection === "stats" || collection === "videos") {
            persistPlayerFields(selectedPlayer.id, { [collection]: (selectedPlayer[collection] || []).filter((item) => item.id !== id) });
        }
        else {
            const cur = privateData[selectedPlayer.id]?.[collection] || [];
            persistPrivateFields(selectedPlayer.id, { [collection]: cur.filter((item) => item.id !== id) });
        }
    }
    const statCategories = meta.statCategories || DEFAULT_STAT_CATEGORIES;
    // Abgespeckte Akte (U12-U18): nur die Felder zeigen/anbieten, die DBB
    // Scores tatsaechlich liefert - alle anderen (Rebounds, Assists, Hustle-
    // Stats, Advanced usw.) sind fuer diese Altersklassen nicht relevant.
    const ABGESPECKT_STAT_LABELS = ["punkte", "freiwürfe", "fouls", "fouls (pf)", "2-punkte-körbe", "3-punkte-körbe", "plus/minus"];
    // Umgekehrt: JBBL/NBBL (volle Version) fuehren eigene, ausfuehrlichere
    // Wurfstatistiken (fg/tp als Treffer/Versuche) - die reinen DBB-Scores-
    // Trefferzahlen 2-/3-Punkte-Koerbe sind dort redundant und sollen nicht
    // erscheinen, auch wenn sie club-weit als Statistik-Kategorie existieren.
    const FULL_HIDDEN_STAT_LABELS = ["2-punkte-körbe", "3-punkte-körbe", "fouls", "fouls (pf)", "plus/minus"];
    const displayStatCategories = isAbgespeckteAkte
        ? statCategories.map((cat) => ({ ...cat, fields: cat.fields.filter((f) => ABGESPECKT_STAT_LABELS.includes(f.label.toLowerCase())) })).filter((cat) => cat.fields.length > 0)
        : statCategories.map((cat) => ({ ...cat, fields: cat.fields.filter((f) => !FULL_HIDDEN_STAT_LABELS.includes(f.label.toLowerCase())) })).filter((cat) => cat.fields.length > 0);
    function addStatCategory(label) {
        persistMeta({ statCategories: [...statCategories, { id: uid(), label, fields: [] }] });
    }
    function renameStatCategory(catId, label) {
        persistMeta({ statCategories: statCategories.map((c) => (c.id === catId ? { ...c, label } : c)) });
    }
    function deleteStatCategory(catId) {
        persistMeta({ statCategories: statCategories.filter((c) => c.id !== catId) });
    }
    function moveStatCategory(catId, dir) {
        const cats = [...statCategories];
        const i = cats.findIndex((c) => c.id === catId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= cats.length)
            return;
        [cats[i], cats[j]] = [cats[j], cats[i]];
        persistMeta({ statCategories: cats });
    }
    function addStatFieldToCategory(catId, label, kind) {
        persistMeta({
            statCategories: statCategories.map((c) => (c.id === catId ? { ...c, fields: [...c.fields, { id: uid(), label, kind }] } : c)),
        });
    }
    function renameStatFieldInCategory(catId, fieldId, label) {
        persistMeta({
            statCategories: statCategories.map((c) => c.id === catId ? { ...c, fields: c.fields.map((f) => (f.id === fieldId ? { ...f, label } : f)) } : c),
        });
    }
    function deleteStatFieldFromCategory(catId, fieldId) {
        persistMeta({
            statCategories: statCategories.map((c) => (c.id === catId ? { ...c, fields: c.fields.filter((f) => f.id !== fieldId) } : c)),
        });
    }
    function moveStatFieldInCategory(catId, fieldId, dir) {
        persistMeta({
            statCategories: statCategories.map((c) => {
                if (c.id !== catId)
                    return c;
                const fields = [...c.fields];
                const i = fields.findIndex((f) => f.id === fieldId);
                const j = i + dir;
                if (i < 0 || j < 0 || j >= fields.length)
                    return c;
                [fields[i], fields[j]] = [fields[j], fields[i]];
                return { ...c, fields };
            }),
        });
    }
    const testTypes = meta.testTypes || DEFAULT_TEST_TYPES;
    function addTestType(label) {
        persistMeta({ testTypes: [...testTypes, { id: uid(), label }] });
    }
    function renameTestType(id, label) {
        persistMeta({ testTypes: testTypes.map((t) => (t.id === id ? { ...t, label } : t)) });
    }
    function deleteTestType(id) {
        persistMeta({ testTypes: testTypes.filter((t) => t.id !== id) });
    }
    function moveTestType(id, dir) {
        const types = [...testTypes];
        const i = types.findIndex((t) => t.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= types.length)
            return;
        [types[i], types[j]] = [types[j], types[i]];
        persistMeta({ testTypes: types });
    }
    const feedbackQuestions = meta.feedbackQuestions || DEFAULT_FEEDBACK_QUESTIONS;
    const feedbackCategories = meta.feedbackCategories || DEFAULT_FEEDBACK_CATEGORIES;
    function saveFeedbackQuestions(questions) {
        persistMeta({ feedbackQuestions: questions });
    }
    function addFeedbackCategory(label) {
        persistMeta({ feedbackCategories: [...feedbackCategories, { id: uid(), label }] });
    }
    function renameFeedbackCategory(id, label) {
        persistMeta({ feedbackCategories: feedbackCategories.map((c) => (c.id === id ? { ...c, label } : c)) });
    }
    function deleteFeedbackCategory(id) {
        persistMeta({ feedbackCategories: feedbackCategories.filter((c) => c.id !== id) });
    }
    function moveFeedbackCategory(id, dir) {
        const cats = [...feedbackCategories];
        const i = cats.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= cats.length)
            return;
        [cats[i], cats[j]] = [cats[j], cats[i]];
        persistMeta({ feedbackCategories: cats });
    }
    return (React.createElement("div", { className: "min-h-[100dvh] flex flex-col" },
        React.createElement("img", { src: LOGO_FULL_DATA_URI, alt: "", "aria-hidden": "true", className: "fixed -right-16 bottom-0 w-[560px] h-[560px] object-contain opacity-[0.1] pointer-events-none select-none -z-10" }),
        React.createElement("header", { className: "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 sm:px-6 py-3 sm:py-3.5 pt-safe flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-10 border-b border-white/10 relative" },
            React.createElement("div", { className: "absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C43E0E] to-[#C43E0E]" }),
            React.createElement("div", { className: "flex items-center gap-2 sm:gap-3 min-w-0" },
                isTrainer && (React.createElement("button", { onClick: () => setMobileSidebarOpen(true), className: "md:hidden p-2 -ml-1 rounded-lg hover:bg-white/10 text-white shrink-0", "aria-label": "Menü öffnen" },
                    React.createElement(IconMenu, { size: 20 }))),
                isTrainer ? (React.createElement("button", { onClick: goHome, className: "flex items-center gap-3 hover:opacity-80 transition text-left", title: "Zur Startseite" },
                    React.createElement("img", { src: LOGO_DATA_URI, alt: "BB-Player File", className: "h-9 w-9 object-contain shrink-0" }),
                    React.createElement("div", null,
                        React.createElement("div", { className: "flex items-center gap-2 mb-0.5" },
                            React.createElement("span", { className: "hidden sm:block h-[2px] w-5 bg-[#C43E0E]" }),
                            React.createElement("h1", { className: "font-display text-lg sm:text-xl tracking-wide whitespace-nowrap leading-none text-white" }, "SPIELER-AKTE"),
                            React.createElement("span", { className: "hidden sm:block h-[2px] w-5 bg-[#C43E0E]" })),
                        React.createElement("p", { className: "hidden sm:block text-xs text-slate-400" }, "BB-Player File \u00B7 interne \u00DCbersicht")))) : (React.createElement("div", { className: "flex items-center gap-3" },
                    React.createElement("img", { src: LOGO_DATA_URI, alt: "BB-Player File", className: "h-9 w-9 object-contain shrink-0" }),
                    React.createElement("div", null,
                        React.createElement("div", { className: "flex items-center gap-2 mb-0.5" },
                            React.createElement("span", { className: "hidden sm:block h-[2px] w-5 bg-[#C43E0E]" }),
                            React.createElement("h1", { className: "font-display text-lg sm:text-xl tracking-wide whitespace-nowrap leading-none text-white" }, "SPIELER-AKTE"),
                            React.createElement("span", { className: "hidden sm:block h-[2px] w-5 bg-[#C43E0E]" })),
                        React.createElement("p", { className: "hidden sm:block text-xs text-slate-400" }, "BB-Player File \u00B7 interne \u00DCbersicht"))))),
            React.createElement("div", { className: "flex items-center gap-2 ml-auto" },
                saveError && (React.createElement("div", { className: "flex items-center gap-1.5 text-xs bg-red-500/15 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-full" },
                    React.createElement(IconAlert, { size: 14 }),
                    " Speichern fehlgeschlagen")),
                isTrainer && (React.createElement(HeaderMenu, { label: "Importieren", icon: IconUpload, isOpen: openHeaderMenu === "import", onToggle: () => setOpenHeaderMenu(openHeaderMenu === "import" ? null : "import"), onClose: () => setOpenHeaderMenu(null), items: [
                        { label: "Kalender importieren (.ics)", icon: IconCalendar, onClick: () => setModal("importCalendar") },
                        { label: "Kalender aus Screenshot (Beta)", icon: IconUpload, onClick: () => setModal("importScreenshot") },
                        { label: "Anwesenheit importieren", icon: IconCalendar, onClick: () => setModal("importAttendance") },
                        { label: "Boxscore einfügen", icon: IconClipboard, onClick: () => setModal("importBoxscore") },
                        { label: "Advanced Stats importieren", icon: IconUpload, onClick: () => setModal("importAdvanced") },
                        { label: "Advanced-Rechner verbinden", icon: IconExternal, onClick: () => setModal("advancedRechnerLive") },
                        ...(dbbEligibleTeams.length > 0 ? [{ label: "DBB Scores importieren", icon: IconUpload, onClick: () => setModal("importDbbScores") }] : []),
                    ] })),
                // Konto-Menue: ersetzt die fruehere gelbe "Angemeldet als"-Leiste -
                // Anmeldename, Push-Schalter und Abmelden sitzen jetzt gesammelt hier.
                React.createElement(HeaderMenu, { label: isFullTrainer ? "Verwalten" : (account.label || (isTrainer ? "Trainer" : "Mein Konto")), icon: isFullTrainer ? IconSettings : IconUsers, isOpen: openHeaderMenu === "settings", onToggle: () => setOpenHeaderMenu(openHeaderMenu === "settings" ? null : "settings"), onClose: () => setOpenHeaderMenu(null),
                    header: React.createElement(React.Fragment, null,
                        React.createElement("p", { className: "text-[11px] uppercase tracking-wide text-slate-400" }, "Angemeldet als"),
                        React.createElement("p", { className: "text-sm font-semibold text-slate-900 truncate" }, account.label || (isTrainer ? "Trainer" : "Spieler-Zugang"))),
                    items: [
                        ...(isFullTrainer ? [
                            { label: "Statistik-Kategorien", icon: IconSettings, onClick: () => setModal("statFields") },
                            { label: "Test-Arten", icon: IconClipboard, onClick: () => setModal("testTypes") },
                            { label: "Development-Plan-Fragen", icon: IconClipboard, onClick: () => setModal("devPlanTemplates") },
                            { label: "Feedback-Fragen", icon: IconMessage, onClick: () => setModal("feedbackTemplates") },
                            { label: "Zugänge verwalten", icon: IconLock, onClick: () => setModal("accounts") },
                        ] : []),
                        ...(messaging ? [{
                            label: notifPermission === "granted" ? "Push-Benachrichtigungen" : notifPermission === "denied" ? "Push blockiert" : "Push aktivieren",
                            hint: notifPermission === "granted" ? "an" : notifPermission === "denied" ? "im Browser erlauben" : "aus",
                            icon: notifPermission === "granted" ? IconBell : IconBellOff,
                            disabled: notifBusy,
                            dividerBefore: isFullTrainer,
                            onClick: () => (notifPermission === "granted" ? disableNotifications() : enableNotifications()),
                        }] : []),
                        { label: "Abmelden", icon: IconExternal, onClick: handleLogout, danger: true, dividerBefore: isFullTrainer && !messaging },
                    ] }))),
        notifError && (React.createElement("div", { className: "bg-red-50 border-b border-red-200 px-4 sm:px-6 py-1.5 text-xs text-red-700" }, notifError)),
        React.createElement("div", { className: "flex flex-col md:flex-row flex-1 relative" },
            isTrainer && mobileSidebarOpen && (React.createElement("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-30 md:hidden rsk-backdrop-in", onClick: () => setMobileSidebarOpen(false) })),
            isTrainer && (React.createElement("aside", { className: `fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-[85%] max-w-xs md:max-w-none md:w-80 border-b md:border-b-0 md:border-r border-stone-200 bg-white p-4 flex flex-col gap-3 transform md:transform-none transition-transform duration-300 ease-out ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} overflow-y-auto pb-safe` },
                React.createElement("div", { className: "flex items-center justify-between md:hidden -mt-1 mb-1" },
                    React.createElement("span", { className: "text-sm font-bold text-slate-900" }, "Menü"),
                    React.createElement("button", { onClick: () => setMobileSidebarOpen(false), className: "p-1.5 rounded-lg hover:bg-stone-100 text-slate-500", "aria-label": "Schließen" },
                        React.createElement(IconX, { size: 18 }))),
                React.createElement("div", { className: "flex flex-col gap-1 pb-3 mb-1 border-b border-stone-200" }, [
                    { key: "dashboard", label: "Dashboard", icon: IconHome, onClick: goHome, active: !showGlobalCalendar && !showVerwaltung && !showAllUnits && !showAttendance && !selectedPlayerId && selectedTeamId === "all" },
                    { key: "calendar", label: "Kalender", icon: IconCalendar, onClick: goGlobalCalendar, active: showGlobalCalendar },
                    { key: "allunits", label: "Alle Einheiten", icon: IconClipboard, onClick: goAllUnits, active: showAllUnits },
                    { key: "attendance", label: "Anwesenheit", icon: IconUsers, onClick: goAttendance, active: showAttendance },
                    { key: "verwaltung", label: "Verwaltung", icon: IconSettings, onClick: goVerwaltung, active: showVerwaltung },
                ].filter((item) => item.key !== "verwaltung" || isFullTrainer).map((item) => React.createElement("button", { key: item.key, onClick: item.onClick, className: `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition ${item.active ? "bg-gradient-to-r from-[#C43E0E]/10 to-[#C43E0E]/10 text-slate-900" : "text-slate-600 hover:bg-stone-100"}` },
                    React.createElement(item.icon, { size: 16, className: item.active ? "text-[#C43E0E]" : "text-slate-400" }),
                    item.label))),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("select", { className: inputClass + " flex-1", value: selectedTeamId, onChange: (e) => { setSelectedTeamId(e.target.value); setShowTeamCalendar(false); setShowGlobalCalendar(false); setShowVerwaltung(false); setShowAllUnits(false); setShowAttendance(false); } },
                        React.createElement("option", { value: "all" }, "Alle Teams"),
                        visibleTeams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name))),
                    isFullTrainer && React.createElement("button", { onClick: () => setModal("team"), className: "shrink-0 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl px-3 text-sm font-medium", title: "Team anlegen" },
                        React.createElement(IconPlus, { size: 16 }))),
                React.createElement("div", { className: "relative" },
                    React.createElement(IconSearch, { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }),
                    React.createElement("input", { className: inputClass + " pl-8", placeholder: "Spieler suchen...", value: search, onChange: (e) => setSearch(e.target.value) })),
                React.createElement("button", { onClick: () => setModal("player"), disabled: teams.length === 0, className: "w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#C43E0E] to-[#A8350C] hover:from-[#FF6A2B] hover:to-[#8A2C0A] disabled:bg-none disabled:bg-stone-200 disabled:text-slate-400 text-white rounded-xl py-2.5 text-sm font-semibold transition shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)]" },
                    React.createElement(IconPlus, { size: 16 }),
                    " Spieler anlegen"),
                teams.length === 0 && React.createElement("p", { className: "text-xs text-slate-400" }, "Legt zuerst ein Team an."),
                search.trim() === "" && !showPlayerList ? (React.createElement("button", { onClick: () => setShowPlayerList(true), className: "flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 py-2" },
                    React.createElement(IconArrowDown, { size: 14 }),
                    " Spielerliste anzeigen")) : (React.createElement(React.Fragment, null,
                    search.trim() === "" && (React.createElement("button", { onClick: () => setShowPlayerList(false), className: "flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 -mb-1" },
                        React.createElement(IconArrowUp, { size: 12 }),
                        " Einklappen")),
                    React.createElement("div", { className: "flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5" },
                        visiblePlayers.length === 0 && (React.createElement("p", { className: "text-sm text-slate-400 text-center py-6" }, "Keine Spieler gefunden.")),
                        visiblePlayers.map((p) => (React.createElement("button", { key: p.id, onClick: () => selectPlayer(p.id), className: `w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition ${selectedPlayerId === p.id ? "bg-red-50 border-l-[3px] border-[#C43E0E] pl-[9px]" : "hover:bg-stone-50 text-slate-900 border-l-[3px] border-transparent pl-[9px]"}` },
                            React.createElement("span", { className: `w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${selectedPlayerId === p.id ? "bg-gradient-to-br from-[#C43E0E] to-[#A8350C] text-white" : "bg-stone-100 text-slate-600"}` }, p.number !== "" && p.number !== undefined ? p.number : "–"),
                            React.createElement("span", { className: "min-w-0 flex-1" },
                                React.createElement("span", { className: `block text-sm font-semibold truncate ${selectedPlayerId === p.id ? "text-slate-900" : ""}` }, p.name),
                                React.createElement("span", { className: "block text-xs truncate text-slate-500" }, p.position)),
                            React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${STATUS_STYLES[p.status]?.dot || "bg-slate-300"}` }))))))))),
            React.createElement("main", { className: "flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full" },
                breadcrumbItems.length > 1 && (React.createElement("div", { className: "flex items-center gap-1.5 text-xs text-slate-500 mb-4 flex-wrap" }, breadcrumbItems.map((b, i) => React.createElement(React.Fragment, { key: i },
                    i > 0 && React.createElement(IconArrowDown, { size: 10, className: "-rotate-90 text-slate-300 shrink-0" }),
                    b.onClick
                        ? React.createElement("button", { onClick: b.onClick, className: "hover:text-[#C43E0E] transition font-medium" }, b.label)
                        : React.createElement("span", { className: i === breadcrumbItems.length - 1 ? "text-slate-800 font-semibold" : "" }, b.label))))),
                !selectedPlayer && selectedTeamId !== "all" && showTeamCalendar && (() => {
                    const team = teams.find((t) => t.id === selectedTeamId);
                    const teamPlayers = players.filter((p) => p.teamId === selectedTeamId);
                    const teamPlayerIds = teamPlayers.map((p) => p.id);
                    const events = calendarEvents.filter((e) => e.teamId === selectedTeamId || (e.includedPlayerIds || []).some((pid) => teamPlayerIds.includes(pid)));
                    const notesForTeam = sortByDateDesc(teamNotes.filter((n) => n.teamId === selectedTeamId));
                    return (React.createElement("div", null,
                        React.createElement("div", { className: "flex items-center justify-between mb-3" },
                            React.createElement("h2", { className: "text-lg font-bold text-slate-900" }, team?.name),
                            React.createElement("button", { onClick: () => setShowTeamCalendar(false), className: "flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5" },
                                React.createElement(IconUsers, { size: 14 }),
                                " Spieler-\u00DCbersicht")),
                        React.createElement(CalendarView, { events: events, isTrainer: isTrainer, team: team, teams: visibleTeams, teamPlayers: teamPlayers, allPlayers: players, contextLabel: team?.name, onAdd: addCalendarEvent, onEdit: editCalendarEvent, onDelete: deleteCalendarEvent, onClearTeam: clearTeamCalendar }),
                        React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4 mt-4" },
                            React.createElement("div", { className: "flex items-center justify-between mb-2" },
                                React.createElement(SectionLabel, null, "Team-Notizen"),
                                React.createElement("button", { onClick: () => setModal("teamNote"), className: "flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" },
                                    React.createElement(IconPlus, { size: 13 }),
                                    " Notiz")),
                            notesForTeam.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Noch keine Team-Notizen.")) : (React.createElement("div", { className: "space-y-2" }, notesForTeam.map((n) => (React.createElement("div", { key: n.id, className: "flex items-center gap-3 bg-stone-50 rounded-xl p-3" },
                                React.createElement("div", { className: "min-w-0 flex-1" },
                                    React.createElement("div", { className: "flex items-center gap-2" },
                                        React.createElement("span", { className: "text-sm font-semibold text-slate-800 truncate" }, n.title),
                                        React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, fmtDate(n.date))),
                                    n.text && React.createElement("p", { className: "text-xs text-slate-500 mt-0.5 truncate" }, n.text),
                                    React.createElement("p", { className: "text-[11px] text-slate-400 mt-0.5" }, n.sharedWithPlayerIds?.length > 0 ? `Sichtbar für ${n.sharedWithPlayerIds.length} Spieler` : "Nur für Trainer")),
                                n.attachmentUrl && (React.createElement("a", { href: n.attachmentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B] bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-full transition shrink-0" },
                                    React.createElement(IconFile, { size: 13 }),
                                    " Datei")),
                                React.createElement("button", { onClick: () => deleteTeamNote(n.id), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "L\u00F6schen" },
                                    React.createElement(IconTrash, { size: 14 })))))))),
                        modal === "teamNote" && (React.createElement(Modal, { title: "Team-Notiz hinzuf\u00FCgen", onClose: () => setModal(null) },
                            React.createElement(TeamNoteForm, { teams: teams, players: players, defaultTeamId: selectedTeamId, onSubmit: addTeamNote, onClose: () => setModal(null) })))));
                })(),
                !selectedPlayer && selectedTeamId !== "all" && !showTeamCalendar && (React.createElement("div", null,
                    React.createElement("div", { className: "flex justify-end mb-3" },
                        React.createElement("button", { onClick: () => setShowTeamCalendar(true), className: "flex items-center gap-1.5 text-sm font-medium text-[#C43E0E] hover:text-[#FF6A2B] bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-1.5" },
                            React.createElement(IconCalendar, { size: 14 }),
                            " Team-Kalender")),
                    React.createElement(TeamOverviewTable, { team: teams.find((t) => t.id === selectedTeamId), players: players.filter((p) => p.teamId === selectedTeamId), privateData: privateData, statCategories: statCategories, onSelectPlayer: selectPlayer }))),
                !selectedPlayer && showGlobalCalendar && (React.createElement("div", null,
                    React.createElement("div", { className: "flex items-center justify-between mb-3" },
                        React.createElement("h2", { className: "text-lg font-bold text-slate-900" }, "Kalender – alle Teams"),
                        React.createElement("button", { onClick: goHome, className: "flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5" },
                            React.createElement(IconUsers, { size: 14 }),
                            " Dashboard")),
                    React.createElement(CalendarView, { events: calendarEvents, isTrainer: isTrainer, team: null, teams: visibleTeams, teamPlayers: [], allPlayers: players, contextLabel: "Alle Teams", onAdd: addCalendarEvent, onEdit: editCalendarEvent, onDelete: deleteCalendarEvent, onClearAll: clearAllCalendars }))),
                !selectedPlayer && !showGlobalCalendar && !showVerwaltung && !showAttendance && showAllUnits && isTrainer && (React.createElement(AllUnitsView, { events: calendarEvents, teams: visibleTeams, allPlayers: players, onEdit: editCalendarEvent, onDelete: deleteCalendarEvent, onAdd: addCalendarEvent, eventAttendance: eventAttendance, onSetAttendance: setPlayerAttendance })),
                !selectedPlayer && !showGlobalCalendar && !showAllUnits && !showAttendance && showVerwaltung && isFullTrainer && (React.createElement("div", { className: "space-y-5 rsk-fade-in" },
                    React.createElement("div", null,
                        React.createElement(SectionLabel, null, "Verwaltung"),
                        React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Teams, Zugänge und die Vorlagen für Statistiken, Tests und Development-Pläne verwalten.")),
                    React.createElement("div", { className: "grid grid-cols-2 lg:grid-cols-3 gap-4" }, [
                        { key: "team", label: "Neues Team anlegen", desc: "Team für die Spieler-Zuordnung anlegen.", icon: IconUsers, grad: "from-slate-900 to-[#8A2C0A]", onClick: () => setModal("team") },
                        { key: "teams", label: "Teams verwalten", desc: "Altersklasse/Liga, Name und Cheftrainer bestehender Teams bearbeiten.", icon: IconSettings, grad: "from-slate-700 to-slate-900", onClick: () => setModal("teams") },
                        { key: "accounts", label: "Zugänge verwalten", desc: "Trainer- und Spieler-Zugänge anlegen oder entfernen.", icon: IconLock, grad: "from-[#C43E0E] to-[#8A2C0A]", onClick: () => setModal("accounts") },
                        { key: "statFields", label: "Statistik-Kategorien", desc: "Felder für Spielstatistiken bearbeiten.", icon: IconSettings, grad: "from-slate-700 to-slate-900", onClick: () => setModal("statFields") },
                        { key: "testTypes", label: "Test-Arten", desc: "Auswahlliste für Athletik-Tests pflegen.", icon: IconClipboard, grad: "from-[#FF6A2B] to-[#C43E0E]", onClick: () => setModal("testTypes") },
                        { key: "devPlanTemplates", label: "Development-Plan-Fragen", desc: "Fragebögen für Spieler/Trainer-Bogen anpassen.", icon: IconClipboard, grad: "from-slate-900 to-[#A8350C]", onClick: () => setModal("devPlanTemplates") },
                        { key: "feedbackTemplates", label: "Feedback-Fragen", desc: "Fragen und Bewertungs-Kategorien für den Feedback-Loop anpassen.", icon: IconMessage, grad: "from-[#C43E0E] to-slate-900", onClick: () => setModal("feedbackTemplates") },
                    ].map((x) => React.createElement("button", { key: x.key, onClick: x.onClick, className: `${cardClass} p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all` },
                        React.createElement("span", { className: `w-10 h-10 rounded-xl bg-gradient-to-br ${x.grad} text-white flex items-center justify-center mb-3` },
                            React.createElement(x.icon, { size: 17 })),
                        React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, x.label),
                        React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, x.desc)))))),
                !selectedPlayer && !showGlobalCalendar && !showVerwaltung && !showAllUnits && !showAttendance && selectedTeamId === "all" && isTrainer && (React.createElement(TrainerDashboard, { events: calendarEvents, teams: visibleTeams, players: players, wellnessData: wellnessData, trainingLoadData: trainingLoadData, eventAttendance: eventAttendance, devPlanWaiting: devPlanWaiting, feedbackWaiting: feedbackWaiting, onSelectTeam: goToTeamCalendar, onSelectPlayer: selectPlayer, onAddEvent: addCalendarEvent, onEditEvent: editCalendarEvent, onDeleteEvent: deleteCalendarEvent, onOpenNoteForm: () => setModal("teamNoteDashboard"), onGoToAllUnits: goAllUnits })),
                !selectedPlayer && !showGlobalCalendar && !showVerwaltung && !showAllUnits && showAttendance && isTrainer && (React.createElement(AttendanceView, { events: calendarEvents, teams: visibleTeams, allPlayers: players, eventAttendance: eventAttendance, onSetAttendance: setPlayerAttendance, onSelectPlayer: selectPlayer })),
                !selectedPlayer && !showGlobalCalendar && !showVerwaltung && !showAllUnits && selectedTeamId === "all" && !isTrainer && (React.createElement("div", { className: "h-full min-h-[400px] flex flex-col items-center justify-center text-center text-slate-400 gap-2" },
                    React.createElement(IconUsers, { size: 36 }),
                    React.createElement("p", { className: "text-sm" }, "L\u00E4dt\u2026"))),
                                selectedPlayer && (React.createElement("div", { className: "rsk-fade-in min-w-0" },
                    React.createElement("div", { className: "rounded-2xl overflow-hidden relative bg-gradient-to-br from-slate-900 to-slate-800" },
                        React.createElement("span", { className: "absolute top-0 left-0 right-0 h-1 bg-[#C43E0E] z-10" }),
                        React.createElement("div", { className: "pointer-events-none select-none absolute inset-0 overflow-hidden", "aria-hidden": "true" },
                            [0.18, 0.62].map((topFrac, i) => React.createElement("div", { key: i, className: "absolute left-0 right-0 whitespace-nowrap text-[15vw] sm:text-[90px] font-black uppercase italic tracking-tight", style: { top: `${topFrac * 100}%`, color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,0.06)" } }, Array(4).fill((selectedTeam?.name || "BB PLAYER FILE") + "  ").join(" ")))),
                        React.createElement("div", { className: "relative z-[1] p-4 sm:p-7 flex gap-4 sm:gap-7" },
                            React.createElement("div", { className: "relative shrink-0" },
                                selectedPlayer.photoUrl
                                    ? React.createElement("img", { src: selectedPlayer.photoUrl, alt: selectedPlayer.name, className: "w-16 h-20 sm:w-24 sm:h-28 rounded-xl object-cover shadow-[0_8px_24px_rgba(0,0,0,0.35)]" })
                                    : React.createElement("div", { className: "w-16 h-20 sm:w-24 sm:h-28 rounded-xl bg-black/25 border border-white/10 flex items-center justify-center p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" },
                                        React.createElement("img", { src: LOGO_DATA_URI, alt: "", className: "w-full h-full object-contain opacity-70" })),
                                React.createElement("div", { className: "absolute -bottom-2 left-2 flex gap-1" },
                                    selectedPlayer.number !== "" && selectedPlayer.number !== undefined && React.createElement("span", { className: "min-w-[28px] text-center bg-white text-slate-900 text-sm font-black rounded-lg px-1.5 py-1 shadow" }, selectedPlayer.number),
                                    selectedPlayer.position && React.createElement("span", { className: "bg-[#C43E0E] text-white text-sm font-black rounded-lg px-1.5 py-1 shadow" }, POSITION_ABBR[selectedPlayer.position] || selectedPlayer.position))),
                            React.createElement("div", { className: "min-w-0 flex-1 flex flex-col justify-between gap-4 pt-1" },
                                React.createElement("div", { className: "flex items-start justify-between gap-3" },
                                    React.createElement("div", { className: "min-w-0" },
                                        !isTrainer && selectedPlayer.id === account.playerId && (React.createElement("p", { className: "text-sm font-medium text-[#FF6A2B] mb-1" }, playerGreeting, ", ", splitName(selectedPlayer.name).first || selectedPlayer.name)),
                                        React.createElement("h2", { className: "font-display italic font-black uppercase text-xl sm:text-4xl leading-[0.95] text-white [overflow-wrap:anywhere] [hyphens:auto]" }, selectedPlayer.name),
                                        React.createElement("div", { className: "flex items-center gap-2 mt-2 flex-wrap" },
                                            React.createElement("p", { className: "text-sm text-white/60" }, selectedTeam?.name || "Kein Team"),
                                            STATUS_STYLES[selectedPlayer.status] && (React.createElement("span", { className: `text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLES[selectedPlayer.status].badge}` }, STATUS_OPTIONS.find((s) => s.value === selectedPlayer.status)?.label)),
                                            getLeagueLogo(selectedTeam?.altersklasse) && React.createElement("img", { src: getLeagueLogo(selectedTeam?.altersklasse), alt: selectedTeam?.altersklasse || "", className: "h-5 w-auto rounded-[3px] opacity-90" }))),
                                    React.createElement("div", { className: "flex gap-2 shrink-0" },
                                        isTrainer && (React.createElement(React.Fragment, null,
                                            React.createElement("button", { onClick: () => setModal("editPlayer"), className: "p-1.5 sm:p-2 rounded-lg bg-black/20 hover:bg-black/35 text-white/80", "aria-label": "Bearbeiten" },
                                                React.createElement(IconEdit, { size: 16 })),
                                            React.createElement("button", { onClick: () => setConfirmDeletePlayer(true), className: "p-1.5 sm:p-2 rounded-lg bg-black/20 hover:bg-red-500/40 text-white/80", "aria-label": "Löschen" },
                                                React.createElement(IconTrash, { size: 16 })))),
                                        !isTrainer && selectedPlayer.id === account.playerId && (React.createElement("button", { onClick: () => setModal("selfProfile"), className: "flex items-center gap-1.5 text-xs font-medium p-2 sm:px-3 sm:py-1.5 rounded-full bg-black/20 hover:bg-black/35 text-white/80 transition shrink-0", "aria-label": "Meine Daten bearbeiten" },
                                            React.createElement(IconEdit, { size: 13 }),
                                            React.createElement("span", { className: "hidden sm:inline" }, "Meine Daten bearbeiten"))))),
                                (() => {
                                    const age = calcAge(selectedPlayer.birthdate);
                                    const nextEvent = getPlayerVisibleEvents(calendarEvents, selectedPlayer)
                                        .filter((e) => e.date >= isoDate(new Date()))
                                        .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0];
                                    const bioItems = [
                                        { label: "Geburtsdatum", value: selectedPlayer.birthdate ? fmtDate(selectedPlayer.birthdate) : "" },
                                        { label: "Alter", value: age !== null ? `${age} Jahre` : "" },
                                        { label: "Letzter Verein", value: selectedPlayer.previousClub || "" },
                                        { label: "Größe", value: selectedPlayer.height ? `${selectedPlayer.height} cm` : "" },
                                        { label: "Position", value: selectedPlayer.position || "" },
                                        { label: "Gewicht", value: selectedPlayer.weight ? `${selectedPlayer.weight} kg` : "" },
                                        { label: "Anwesenheit", value: playerLiveAttendanceQuote === null ? "" : `${playerLiveAttendanceQuote}%` },
                                        { label: "Starke Hand", value: HANDEDNESS_LABELS[selectedPlayer.handedness] || "" },
                                        { label: "Spiele erfasst", value: String(playerStats.length) },
                                        { label: "Nächster Termin", value: nextEvent ? `${new Date(nextEvent.date + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}${nextEvent.time ? ", " + nextEvent.time : ""}` : "", forceCol2: true },
                                    ].filter((b) => b.value);
                                    if (bioItems.length === 0)
                                        return null;
                                    return React.createElement("div", { className: "grid grid-cols-2 gap-x-6 border-t border-white/10 pt-3" }, bioItems.map((b) => React.createElement("div", { key: b.label, className: `py-1.5 border-b border-white/10 ${b.wide ? "col-span-2" : b.forceCol2 ? "col-start-2" : ""}` },
                                        React.createElement("p", { className: "text-[10px] text-white/40 uppercase tracking-wide" }, b.label),
                                        React.createElement("p", { className: "text-sm font-semibold text-white" }, b.value))));
                                })()))),
                        (() => {
                            const todayEvents = getPlayerVisibleEvents(calendarEvents, selectedPlayer).filter((e) => e.date === isoDate(new Date()));
                            if (todayEvents.length === 0)
                                return null;
                            return (React.createElement("div", { className: "mt-4 pt-4 border-t border-stone-100 space-y-1.5" },
                                React.createElement("p", { className: "text-[11px] text-slate-400 uppercase tracking-wide mb-1" }, "Heute"),
                                todayEvents.map((e) => (React.createElement("div", { key: e.id, className: "flex items-center gap-2.5" },
                                    React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[e.type]?.dot || "bg-slate-400"}` }),
                                    e.time && React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, e.time),
                                    React.createElement("span", { className: "text-sm text-slate-700" }, e.title),
                                    e.location && React.createElement("span", { className: "text-xs text-slate-400" },
                                        "\u00B7 ",
                                        e.location))))));
                        })(),
                    confirmDeletePlayer && (React.createElement("div", { className: "mt-3 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3" },
                        React.createElement("p", { className: "text-sm text-red-700" }, "Spieler wirklich l\u00F6schen? Alle Statistiken, Tests, Videos und Notizen werden mitgel\u00F6scht."),
                        React.createElement("div", { className: "flex gap-2" },
                            React.createElement("button", { onClick: () => setConfirmDeletePlayer(false), className: "px-3 py-1.5 text-sm rounded-lg border border-stone-300 text-slate-600 hover:bg-stone-50" }, "Abbrechen"),
                            React.createElement("button", { onClick: handleDeletePlayer, className: "px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700" }, "Endg\u00FCltig l\u00F6schen")))),
                    (() => {
                        const visibleTabKeys = TABS.filter((t) => (isTrainer || PLAYER_ROLE_TABS.includes(t.key)) && !(isAbgespeckteAkte && t.key === "test")).map((t) => t.key);
                        const groups = TAB_GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((k) => visibleTabKeys.includes(k)) })).filter((g) => g.tabs.length > 0);
                        const activeGroup = groups.find((g) => g.tabs.includes(activeTab)) || groups[0];
                        return React.createElement("div", { className: "mt-6" },
                            React.createElement("div", { className: "grid gap-1 p-1 bg-stone-100 rounded-2xl", style: { gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` } }, groups.map((g) => {
                                const active = g.key === activeGroup.key;
                                return React.createElement("button", { key: g.key, onClick: () => { if (!active) setActiveTab(g.tabs[0]); }, "aria-pressed": active, className: `flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-semibold transition min-w-0 ${active ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.06)]" : "text-slate-500 hover:text-slate-800"}` },
                                    React.createElement(g.icon, { size: 16, className: active ? "text-[#C43E0E]" : "" }),
                                    React.createElement("span", { className: "truncate max-w-full" }, g.label));
                            })),
                            activeGroup.tabs.length > 1 && React.createElement("div", { className: "flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-0.5" }, activeGroup.tabs.map((key) => {
                                const t = TABS.find((x) => x.key === key);
                                const Icon = t.icon;
                                const active = activeTab === key;
                                return React.createElement("button", { key: key, onClick: () => setActiveTab(key), "aria-pressed": active, className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition border ${active ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-stone-200 text-slate-500 hover:text-slate-800 hover:border-stone-300"}` },
                                    React.createElement(Icon, { size: 13, className: active ? "text-[#FF6A2B]" : "" }),
                                    t.label);
                            })));
                    })(),
                    React.createElement("div", { className: "mt-5 min-w-0" },
                        activeTab === "uebersicht" && (React.createElement("div", { className: "space-y-5" },
                            // Spieler-Zugang: offene Aufgaben (Belastung/Check-in) direkt auf der
                            // Startseite, damit niemand erst den Monitoring-Reiter suchen muss.
                            !isTrainer && selectedPlayer.id === account.playerId && (() => {
                                const todayKeyTasks = today();
                                const weekAgo = new Date();
                                weekAgo.setDate(weekAgo.getDate() - 7);
                                const weekAgoKey = isoDate(weekAgo);
                                const loggedIds = new Set(playerTrainingLoadEntries.map((e) => e.eventId).filter(Boolean));
                                const openLoadCount = playerTrainingLoadEvents.filter((e) => e.date && e.date <= todayKeyTasks && e.date >= weekAgoKey && !loggedIds.has(e.id)).length;
                                const wellnessDone = playerWellnessEntries.some((e) => e.weekKey === isoWeekKey(todayKeyTasks));
                                const tasks = [
                                    { key: "load", done: openLoadCount === 0, icon: IconTrendUp, title: openLoadCount === 0 ? "Belastung ist eingetragen" : `${openLoadCount} ${openLoadCount === 1 ? "Einheit" : "Einheiten"} bewerten`, sub: openLoadCount === 0 ? "Keine offenen Einheiten der letzten 7 Tage" : "Wie anstrengend war's? Dauert 10 Sekunden." },
                                    { key: "wellness", done: wellnessDone, icon: IconHeart, title: wellnessDone ? "Wellness-Check-in erledigt" : "Wellness-Check-in ausfüllen", sub: wellnessDone ? "Für diese Woche abgegeben" : "Einmal pro Woche - Erschöpfung, Energie, Stress" },
                                ];
                                const openCount = tasks.filter((t) => !t.done).length;
                                return React.createElement("div", { className: `${cardClass} p-4 sm:p-5` },
                                    React.createElement("div", { className: "flex items-center gap-2 mb-3" },
                                        React.createElement(SectionLabel, null, "Deine Aufgaben"),
                                        openCount > 0 && React.createElement("span", { className: "text-[11px] font-bold rounded-full px-2 py-0.5 bg-[#C43E0E] text-white" }, openCount, " offen")),
                                    React.createElement("div", { className: "space-y-2" }, tasks.map((t) => React.createElement("button", { key: t.key, onClick: () => setActiveTab("wellness"), className: `w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${t.done ? "bg-emerald-50/70 hover:bg-emerald-50" : "bg-red-50 hover:bg-red-100/70"}` },
                                        React.createElement("span", { className: `w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.done ? "bg-emerald-500 text-white" : "bg-gradient-to-br from-[#FF6A2B] to-[#C43E0E] text-white"}` },
                                            React.createElement(t.done ? IconCheck : t.icon, { size: 16 })),
                                        React.createElement("span", { className: "min-w-0 flex-1" },
                                            React.createElement("span", { className: `block text-sm font-semibold ${t.done ? "text-emerald-800" : "text-slate-900"}` }, t.title),
                                            React.createElement("span", { className: "block text-xs text-slate-500" }, t.sub)),
                                        !t.done && React.createElement(IconArrowLeft, { size: 14, className: "text-[#C43E0E] rotate-180 shrink-0" })))));
                            })(),
                            playerStats.length === 0 ? React.createElement("div", { className: "bg-white rounded-2xl border border-dashed border-stone-300 p-4 sm:p-5 flex items-start gap-3 sm:gap-4" },
                                React.createElement("span", { className: "w-10 h-10 rounded-xl bg-stone-100 text-slate-400 flex items-center justify-center shrink-0" },
                                    React.createElement(IconActivity, { size: 18 })),
                                React.createElement("div", { className: "min-w-0 flex-1" },
                                    React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, "Noch keine Spiele erfasst"),
                                    React.createElement("p", { className: "text-xs text-slate-500 mt-0.5" }, "Punkte, Rebounds & Co. erscheinen hier, sobald das erste Spiel eingetragen ist."),
                                    isTrainer && React.createElement("button", { onClick: () => setActiveTab("statistik"), className: "mt-2 text-xs font-semibold text-[#C43E0E] hover:text-[#FF6A2B]" }, "Spiel eintragen →"))) : React.createElement("div", null,
                                React.createElement(SectionLabel, null, "Auf einen Blick"),
                                React.createElement("div", { className: "grid grid-cols-3 gap-3 mt-1.5" }, (isAbgespeckteAkte ? [
                                    { label: "Minuten", id: "minuten", color: "from-slate-700 to-slate-900", num: "text-slate-800" },
                                    { label: "Punkte", id: "punkte", color: "from-[#C43E0E] to-[#8A2C0A]", num: "text-[#C43E0E]", isField: true },
                                    { label: "FW%", id: "__ft_pct", color: "from-[#FF6A2B] to-[#C43E0E]", num: "text-[#C43E0E]" },
                                    { label: "2Pkt", id: findFieldId(statCategories, ["2-punkte-körbe"]), color: "from-slate-700 to-[#8A2C0A]", num: "text-slate-800", isField: true },
                                    { label: "3Pkt", id: findFieldId(statCategories, ["3-punkte-körbe"]), color: "from-slate-600 to-slate-900", num: "text-slate-800", isField: true },
                                ] : [
                                    { label: "Punkte", id: "punkte", color: "from-[#C43E0E] to-[#8A2C0A]", num: "text-[#C43E0E]", isField: true },
                                    { label: "Rebounds", id: "rebounds", color: "from-[#FF6A2B] to-[#C43E0E]", num: "text-[#C43E0E]", isField: true },
                                    { label: "Assists", id: "assists", color: "from-slate-700 to-[#8A2C0A]", num: "text-slate-800", isField: true },
                                    { label: "Blocks", id: "blocks", color: "from-slate-600 to-slate-900", num: "text-slate-800", isField: true },
                                    { label: "Steals", id: "steals", color: "from-slate-600 to-slate-900", num: "text-slate-800", isField: true },
                                    { label: "Effizienz", id: findFieldId(statCategories, ["effizienz", "eff", "ef"]), color: "from-slate-900 to-[#FF6A2B]", num: "text-slate-800", isField: true },
                                ]).filter((x) => x.id).map((x) => (React.createElement("div", { key: x.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-3 text-center relative overflow-hidden" },
                                    React.createElement("span", { className: `absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${x.color}` }),
                                    React.createElement("p", { className: `text-lg font-bold mt-1 ${x.num}` }, x.id === "__ft_pct" ? totalPct("ft_m", "ft_a") : avg(x.id)),
                                    React.createElement("p", { className: "text-xs text-slate-400 uppercase tracking-wide mt-0.5" }, x.label)))))),
                            !isAbgespeckteAkte && playerStats.length > 0 && React.createElement("div", null,
                                React.createElement(SectionLabel, null, "Details"),
                                React.createElement("div", { className: "space-y-2 mt-1.5" }, statCategories.filter((cat) => (isTrainer || cat.id !== "advanced") && cat.id !== "dbbScores").map((cat) => {
                                    if (cat.fields.length === 0)
                                        return null;
                                    const isOpen = expandedCats.has(cat.id);
                                    return (React.createElement("div", { key: cat.id, className: "rounded-2xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)]" },
                                        React.createElement("button", { onClick: () => toggleCat(cat.id), className: "w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition" },
                                            React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, cat.label),
                                            React.createElement(IconArrowDown, { size: 16, className: `text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}` })),
                                        isOpen && (React.createElement("div", { className: "grid grid-cols-3 md:grid-cols-4 gap-3 p-4 pt-0" }, cat.fields.map((f) => (React.createElement("div", { key: f.id, className: "bg-stone-50 rounded-xl p-3 text-center" },
                                            React.createElement("p", { className: "text-lg font-bold text-slate-700" }, f.kind === "shooting" ? totalPct(`${f.id}_m`, `${f.id}_a`) : avg(f.id)),
                                            React.createElement("p", { className: "text-xs text-slate-400 uppercase tracking-wide mt-0.5 truncate", title: f.label }, f.kind === "shooting" ? f.label : `Ø ${f.label}`))))))));
                                }))),
                            React.createElement("div", { className: isAbgespeckteAkte ? "grid grid-cols-1 gap-4" : "grid md:grid-cols-2 gap-4" },
                                !isAbgespeckteAkte && React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4" },
                                    React.createElement("p", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" }, "Letzter Athletik-Test"),
                                    playerTests[0] ? (React.createElement("p", { className: "text-sm text-slate-700" },
                                        playerTests[0].testType,
                                        ": ",
                                        React.createElement("span", { className: "font-semibold" },
                                            playerTests[0].result,
                                            " ",
                                            playerTests[0].unit),
                                        " (",
                                        fmtDate(playerTests[0].date),
                                        ")")) : React.createElement("p", { className: "text-sm text-slate-400" }, "Noch keine Tests erfasst.")),
                                React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4" },
                                    React.createElement("p", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" }, "Letzte Notiz"),
                                    playerNotes[0] ? (React.createElement("p", { className: "text-sm text-slate-700 line-clamp-2" }, playerNotes[0].text)) : React.createElement("p", { className: "text-sm text-slate-400" }, "Noch keine Notizen erfasst."))))),
                        activeTab === "kalender" && (React.createElement(CalendarView, { events: getPlayerVisibleEvents(calendarEvents, selectedPlayer), isTrainer: isTrainer, team: selectedTeam, teams: teams, teamPlayers: players.filter((p) => p.teamId === selectedPlayer.teamId), allPlayers: players, contextLabel: selectedPlayer.name, onAdd: addCalendarEvent, onEdit: editCalendarEvent, onDelete: deleteCalendarEvent })),
                        activeTab === "statistik" && (React.createElement("div", null,
                            React.createElement("div", { className: "flex justify-end mb-3" },
                                React.createElement("button", { onClick: () => setModal("stat"), className: "flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-800" },
                                    React.createElement(IconPlus, { size: 15 }),
                                    " Eintrag")),
                            playerStats.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Spielstatistiken erfasst.")) : (React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] overflow-x-auto" },
                                React.createElement("table", { className: "w-full text-sm" },
                                    React.createElement("thead", null,
                                        React.createElement("tr", { className: "border-b border-stone-200 text-slate-500 text-xs uppercase tracking-wide" },
                                            React.createElement("th", { className: "text-left px-4 py-3" }, "Datum"),
                                            React.createElement("th", { className: "text-left px-4 py-3" }, "Gegner"),
                                            React.createElement("th", { className: "text-right px-4 py-3" }, "Min"),
                                            displayStatCategories.map((cat) => cat.fields.map((f) => (f.kind === "shooting" ? (React.createElement(React.Fragment, { key: f.id },
                                                React.createElement("th", { className: "text-right px-4 py-3", title: f.label }, f.label),
                                                React.createElement("th", { className: "text-right px-4 py-3", title: `${f.label} Quote` },
                                                    f.label,
                                                    "%"))) : (React.createElement("th", { key: f.id, className: "text-right px-4 py-3", title: f.label }, f.label))))),
                                            React.createElement("th", { className: "px-4 py-3" }))),
                                    React.createElement("tbody", null, playerStats.map((s) => (React.createElement("tr", { key: s.id, className: "border-b border-stone-100 last:border-0 hover:bg-stone-50" },
                                        React.createElement("td", { className: "px-4 py-3 whitespace-nowrap" }, fmtDate(s.date)),
                                        React.createElement("td", { className: "px-4 py-3" }, s.gegner || "–"),
                                        React.createElement("td", { className: "px-4 py-3 text-right" }, s.minuten || 0),
                                        displayStatCategories.map((cat) => cat.fields.map((f) => (f.kind === "shooting" ? (React.createElement(React.Fragment, { key: f.id },
                                            React.createElement("td", { className: "px-4 py-3 text-right whitespace-nowrap" },
                                                s[`${f.id}_m`] || 0,
                                                "/",
                                                s[`${f.id}_a`] || 0),
                                            React.createElement("td", { className: "px-4 py-3 text-right text-slate-400" }, pct(s[`${f.id}_m`], s[`${f.id}_a`]) !== null ? `${pct(s[`${f.id}_m`], s[`${f.id}_a`])}%` : "–"))) : (React.createElement("td", { key: f.id, className: "px-4 py-3 text-right" }, fmtNum(s[f.id], 1)))))),
                                        React.createElement("td", { className: "px-3 py-3 text-right whitespace-nowrap" },
                                            React.createElement("button", { onClick: () => { setEditingStat(s); setModal("editStat"); }, className: "text-slate-300 hover:text-[#C43E0E] mr-2", "aria-label": "Eintrag bearbeiten" },
                                                React.createElement(IconEdit, { size: 14 })),
                                            React.createElement("button", { onClick: () => deleteItem("stats", s.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Eintrag l\u00F6schen" },
                                                React.createElement(IconTrash, { size: 14 })))))))))))),
                        activeTab === "test" && (React.createElement("div", null,
                            React.createElement("div", { className: "flex justify-end mb-3" },
                                React.createElement("button", { onClick: () => setModal("test"), className: "flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-800" },
                                    React.createElement(IconPlus, { size: 15 }),
                                    " Testergebnis")),
                            playerTests.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Athletik-Tests erfasst.")) : (React.createElement("div", { className: "space-y-2.5" }, playerTests.map((t, i) => {
                                const prev = playerTests.slice(i + 1).find((o) => o.testType === t.testType);
                                const diff = prev ? +(t.result - prev.result).toFixed(2) : null;
                                return (React.createElement("div", { key: t.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4 flex items-center justify-between gap-3" },
                                    React.createElement("div", null,
                                        React.createElement("p", { className: "text-sm font-semibold text-slate-900" }, t.testType),
                                        React.createElement("p", { className: "text-xs text-slate-500" }, fmtDate(t.date))),
                                    React.createElement("div", { className: "flex items-center gap-3" },
                                        React.createElement("p", { className: "text-sm font-bold text-slate-900" },
                                            t.result,
                                            " ",
                                            React.createElement("span", { className: "font-normal text-slate-400" }, t.unit)),
                                        diff !== null && diff !== 0 && (React.createElement("span", { className: `flex items-center gap-0.5 text-xs font-medium ${diff > 0 ? "text-emerald-600" : "text-red-500"}` },
                                            diff > 0 ? React.createElement(IconTrendUp, { size: 13 }) : React.createElement(IconTrendDown, { size: 13 }),
                                            " ",
                                            Math.abs(diff))),
                                        React.createElement("button", { onClick: () => { setEditingTest(t); setModal("editTest"); }, className: "text-slate-300 hover:text-[#C43E0E]", "aria-label": "Eintrag bearbeiten" },
                                            React.createElement(IconEdit, { size: 14 })),
                                        React.createElement("button", { onClick: () => deleteItem("tests", t.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Eintrag l\u00F6schen" },
                                            React.createElement(IconTrash, { size: 14 })))));
                            }))))),
                        activeTab === "anwesenheit" && (React.createElement("div", { className: "space-y-4" },
                            React.createElement("div", { className: "flex flex-wrap gap-3" },
                                React.createElement("div", { className: `${cardClass} p-4 text-center w-32` },
                                    React.createElement("p", { className: "text-2xl font-black text-slate-900" }, playerLiveAttendanceQuote === null ? "–" : `${playerLiveAttendanceQuote}%`),
                                    React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Quote")),
                                React.createElement("div", { className: `${cardClass} p-4 text-center w-32` },
                                    React.createElement("p", { className: "text-2xl font-black text-emerald-600" }, playerLiveAttendanceStats.present),
                                    React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Anwesend")),
                                React.createElement("div", { className: `${cardClass} p-4 text-center w-32` },
                                    React.createElement("p", { className: "text-2xl font-black text-red-500" }, playerLiveAttendanceStats.absent),
                                    React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Abwesend")),
                                React.createElement("div", { className: `${cardClass} p-4 text-center w-32` },
                                    React.createElement("p", { className: "text-2xl font-black text-amber-600" }, playerLiveAttendanceStats.injured),
                                    React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Verletzt"))),
                            React.createElement(PlayerAttendanceTab, { rows: playerLiveAttendanceRows }))),
                        activeTab === "wellness" && (React.createElement("div", { className: "space-y-8" },
                            React.createElement(TrainingLoadPanel, { isTrainer: isTrainer, isOwnAccount: !isTrainer && account.playerId === selectedPlayer.id, events: playerTrainingLoadEvents, entries: playerTrainingLoadEntries, onAddEntry: (entry) => addTrainingLoadEntry(selectedPlayer.id, entry), onDeleteEntry: (id) => deleteTrainingLoadEntry(selectedPlayer.id, id) }),
                            React.createElement("div", { className: "border-t border-stone-200 pt-6" },
                                React.createElement(SectionLabel, null, "Wellness-Check-in"),
                                React.createElement("div", { className: "mt-3" },
                                    React.createElement(WellnessPanel, { isTrainer: isTrainer, isOwnAccount: !isTrainer && account.playerId === selectedPlayer.id, entries: playerWellnessEntries, onAddEntry: (entry) => addWellnessEntry(selectedPlayer.id, entry), onDeleteEntry: (id) => deleteWellnessEntry(selectedPlayer.id, id) }))))),
                        activeTab === "noten" && (React.createElement(GradesPanel, { isTrainer: isTrainer, isOwnAccount: !isTrainer && account.playerId === selectedPlayer.id, subjects: playerGradeSubjects, onSave: (subjects) => saveGradeSubjects(selectedPlayer.id, subjects), onToggleFlag: (id) => toggleGradeFlag(selectedPlayer.id, id), onRenameSubject: (id, name) => renameGradeSubject(selectedPlayer.id, id, name), onSetComment: (id, comment) => setGradeComment(selectedPlayer.id, id, comment) })),
                        activeTab === "video" && (React.createElement("div", null,
                            isTrainer && (React.createElement("div", { className: "flex justify-end mb-3" },
                                React.createElement("button", { onClick: () => setModal("video"), className: "flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-800" },
                                    React.createElement(IconPlus, { size: 15 }),
                                    " Video"))),
                            playerVideos.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Videos verkn\u00FCpft.")) : (React.createElement("div", { className: "space-y-2" }, playerVideos.map((v) => {
                                const embedUrl = getEmbedUrl(v.url);
                                const isOpen = expandedVideos.has(v.id);
                                return (React.createElement("div", { key: v.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden" },
                                    React.createElement("div", { className: "w-full flex items-center gap-3 px-4 py-3" },
                                        React.createElement("button", { onClick: () => (embedUrl ? toggleVideo(v.id) : window.open(v.url, "_blank", "noopener,noreferrer")), className: "flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition" },
                                            React.createElement("span", { className: `shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${embedUrl ? "bg-red-50 text-[#C43E0E]" : "bg-stone-100 text-slate-400"}` },
                                                React.createElement(IconVideo, { size: 15 })),
                                            React.createElement("span", { className: "min-w-0 flex-1" },
                                                React.createElement("span", { className: "flex items-center gap-2" },
                                                    React.createElement("span", { className: "text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-slate-600 shrink-0" }, v.type),
                                                    React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, fmtDate(v.date))),
                                                v.description && React.createElement("span", { className: "block text-sm text-slate-700 mt-0.5 truncate" }, v.description))),
                                        React.createElement("div", { className: "shrink-0 flex items-center gap-2" },
                                            React.createElement("a", { href: v.url, target: "_blank", rel: "noopener noreferrer", className: "text-slate-400 hover:text-[#C43E0E]", "aria-label": "In neuem Tab \u00F6ffnen" },
                                                React.createElement(IconExternal, { size: 14 })),
                                            isTrainer && React.createElement("button", { onClick: () => deleteItem("videos", v.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Video l\u00F6schen" },
                                                React.createElement(IconTrash, { size: 14 })),
                                            embedUrl && (React.createElement("button", { onClick: () => toggleVideo(v.id), "aria-label": isOpen ? "Einklappen" : "Ausklappen" },
                                                React.createElement(IconArrowDown, { size: 14, className: `text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}` }))))),
                                    embedUrl && isOpen && (React.createElement("div", { className: "relative w-full bg-black", style: { paddingBottom: "56.25%" } },
                                        React.createElement("iframe", { src: embedUrl, className: "absolute inset-0 w-full h-full", frameBorder: "0", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: v.description || v.type })))));
                            }))))),
                        activeTab === "notiz" && isTrainer && (() => {
                            const relevantTeamNotes = sortByDateDesc(getPlayerVisibleTeamNotes(teamNotes, selectedPlayer));
                            return (React.createElement("div", { className: "space-y-5" },
                                React.createElement("div", null,
                                    React.createElement("div", { className: "flex items-center justify-between mb-2" },
                                        React.createElement(SectionLabel, null, "Team-Notizen (auch f\u00FCr Spieler sichtbar)"),
                                        React.createElement("button", { onClick: () => setModal("teamNoteDashboard"), className: "flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" },
                                            React.createElement(IconPlus, { size: 13 }),
                                            " Team-Notiz")),
                                    relevantTeamNotes.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Keine Team-Notizen f\u00FCr diesen Spieler freigegeben.")) : (React.createElement("div", { className: "space-y-2.5" }, relevantTeamNotes.map((n) => (React.createElement("div", { key: n.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-3.5" },
                                        React.createElement("div", { className: "flex items-center justify-between gap-2" },
                                            React.createElement("div", { className: "flex items-center gap-2" },
                                                React.createElement("span", { className: "text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200" }, n.sharedWithAll ? "Ganzes Team" : "Diesem Spieler"),
                                                React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, n.title),
                                                React.createElement("span", { className: "text-xs text-slate-400" }, fmtDate(n.date))),
                                            React.createElement("button", { onClick: () => deleteTeamNote(n.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Notiz l\u00F6schen" },
                                                React.createElement(IconTrash, { size: 14 }))),
                                        n.text && React.createElement("p", { className: "text-sm text-slate-700 mt-2" }, n.text),
                                        n.attachmentUrl && (React.createElement("a", { href: n.attachmentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B] bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-full transition" },
                                            React.createElement(IconPaperclip, { size: 13 }),
                                            " ",
                                            n.attachmentName || "Anhang öffnen")))))))),
                                React.createElement("div", null,
                                    React.createElement("div", { className: "flex items-center justify-between mb-2" },
                                        React.createElement(SectionLabel, null, "Private Notizen (nur f\u00FCr Trainer)"),
                                        React.createElement("button", { onClick: () => setModal("note"), className: "flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" },
                                            React.createElement(IconPlus, { size: 13 }),
                                            " Notiz")),
                                    playerNotes.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Notizen erfasst.")) : (React.createElement("div", { className: "space-y-2.5" }, playerNotes.map((n) => (React.createElement("div", { key: n.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-3.5" },
                                        React.createElement("div", { className: "flex items-center justify-between gap-2" },
                                            React.createElement("div", { className: "flex items-center gap-2" },
                                                React.createElement("span", { className: `text-xs font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_STYLES[n.category]}` }, NOTE_CATEGORIES.find((c) => c.value === n.category)?.label),
                                                React.createElement("span", { className: "text-xs text-slate-400" },
                                                    fmtDate(n.date),
                                                    " \u00B7 ",
                                                    n.author)),
                                            React.createElement("button", { onClick: () => deleteItem("notes", n.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Notiz l\u00F6schen" },
                                                React.createElement(IconTrash, { size: 14 }))),
                                        React.createElement("p", { className: "text-sm text-slate-700 mt-2" }, n.text),
                                        n.attachmentUrl && (React.createElement("a", { href: n.attachmentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-[#C43E0E] hover:text-[#A8350C] bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-full transition" },
                                            React.createElement(IconPaperclip, { size: 13 }),
                                            " ",
                                            n.attachmentName || "Anhang öffnen"))))))))));
                        })(),
                        activeTab === "notiz" && !isTrainer && (React.createElement("div", null, teamNotes.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Notizen f\u00FCr dich freigegeben.")) : (React.createElement("div", { className: "space-y-2.5" }, sortByDateDesc(teamNotes).map((n) => (React.createElement("div", { key: n.id, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-3.5" },
                            React.createElement("div", { className: "flex items-center justify-between gap-2" },
                                React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, n.title),
                                React.createElement("span", { className: "text-xs text-slate-400" }, fmtDate(n.date))),
                            n.text && React.createElement("p", { className: "text-sm text-slate-700 mt-1.5" }, n.text),
                            n.attachmentUrl && (React.createElement("a", { href: n.attachmentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B] bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-full transition" },
                                React.createElement(IconPaperclip, { size: 13 }),
                                " ",
                                n.attachmentName || "Anhang öffnen"))))))))),
        activeTab === "entwicklung" && (React.createElement(DevelopmentPlanPanel, { player: selectedPlayer, isTrainer: isTrainer, cycles: devPlanCycles, templates: devPlanTemplates, onCreateCycle: createDevPlanCycle, onSavePlayer: saveDevPlanPlayer, onReleasePlayer: releaseDevPlanPlayer, onSaveTrainer: saveDevPlanTrainer, onReleaseTrainer: releaseDevPlanTrainer, onSaveCombined: saveDevPlanCombined, onDeleteCycle: deleteDevPlanCycle })),
        activeTab === "feedback" && (React.createElement(FeedbackPanel, { isTrainer: isTrainer, isOwnAccount: !isTrainer && account.playerId === selectedPlayer.id, items: feedbackItems, loading: feedbackLoading, questions: feedbackQuestions, categories: feedbackCategories, onOpenRequest: () => setModal(isTrainer ? "requestFeedbackToPlayer" : "requestFeedbackToTrainer"), onAnswerToPlayer: answerFeedbackToPlayer, onAnswerToTrainer: answerFeedbackToTrainer, onDelete: deleteFeedbackItem })),
        activeTab === "steckbrief" && selectedPlayer && isTrainer && (() => {
            const manualRatings = { wurf: 5, verteidigung: 5, athletik: 5, spielintelligenz: 5, teamplay: 5, ...(selectedPlayer.radarRatings || {}) };
            function setRadarValue(skillId, val) {
                persistPlayerFields(selectedPlayer.id, { radarRatings: { ...manualRatings, [skillId]: val } });
            }
            const radarModes = {};
            RADAR_SKILLS.forEach((s) => { radarModes[s.id] = (selectedPlayer.radarModes && selectedPlayer.radarModes[s.id]) || s.defaultMode; });
            function setRadarMode(skillId, mode) {
                persistPlayerFields(selectedPlayer.id, { radarModes: { ...radarModes, [skillId]: mode } });
            }
            const teamPlayers = players.filter((p) => p.teamId === selectedPlayer.teamId);
            const autoRadarAll = computeAutoRadar(teamPlayers.length ? teamPlayers : [selectedPlayer], statCategories, privateData, isTrainer, testTypes);
            const autoValues = autoRadarAll[selectedPlayer.id] || { wurf: null, verteidigung: null, athletik: null };
            const radarValues = {};
            RADAR_SKILLS.forEach((s) => {
                radarValues[s.id] = s.autoCapable && radarModes[s.id] === "auto" && autoValues[s.id] !== null && autoValues[s.id] !== undefined
                    ? autoValues[s.id]
                    : manualRatings[s.id];
            });
            const wohnort = selectedPlayer.district ? `${selectedPlayer.district}, ${selectedPlayer.city}` : (selectedPlayer.city || "–");
            const bioItems = [
                { label: "Geburtsdatum", value: fmtDate(selectedPlayer.birthdate) },
                { label: "Starke Hand", value: HANDEDNESS_LABELS[selectedPlayer.handedness] || "–" },
                { label: "Letzter Verein", value: selectedPlayer.previousClub || "–" },
                { label: "Status", value: STATUS_OPTIONS.find((s) => s.value === selectedPlayer.status)?.label || "–" },
                { label: "Schule", value: selectedPlayer.school || "–" },
                { label: "Wohnort", value: wohnort },
                { label: "Telefon", value: selectedPlayer.phone || "–" },
                { label: "E-Mail", value: selectedPlayer.email || "–" },
                { label: "Notfallkontakt", value: selectedPlayer.emergencyContactName ? `${selectedPlayer.emergencyContactName}${selectedPlayer.emergencyContactPhone ? " · " + selectedPlayer.emergencyContactPhone : ""}` : "–" },
            ].map((b) => React.createElement("div", { key: b.label, className: "bg-stone-50 rounded-xl p-3.5 min-w-0" },
                React.createElement("p", { className: "text-[10px] text-slate-400 uppercase tracking-wide mb-0.5" }, b.label),
                React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, b.value)));
            const statRows = [
                { label: "Punkte", id: "punkte" },
                { label: "Rebounds", id: "rebounds" },
                { label: "Assists", id: "assists" },
                { label: "Turnover", id: "turnovers" },
            ].map((x) => React.createElement("div", { key: x.id, className: "bg-stone-50 rounded-xl p-3.5 text-center" },
                React.createElement("p", { className: "text-lg font-bold text-slate-700" }, avg(x.id)),
                React.createElement("p", { className: "text-xs text-slate-400 uppercase tracking-wide mt-0.5" }, x.label)));
            const wurfVideo = sortByDateDesc(playerVideos.filter((v) => v.type === "Wurftechnik"))[0] || null;
            return React.createElement("div", { className: "space-y-5 min-w-0 max-w-full" },
                React.createElement("div", { className: "flex items-center justify-between flex-wrap gap-2" },
                    React.createElement(SectionLabel, null, "Spieler-Steckbrief"),
                    React.createElement("button", { onClick: () => exportSteckbriefPdf(selectedPlayer.name), disabled: pdfBusy, className: btnPrimaryClass + " text-sm px-3.5 py-2" },
                        React.createElement(IconDownload, { size: 14 }),
                        pdfBusy ? "Wird erstellt…" : "Als PDF exportieren")),
                React.createElement("div", { ref: steckbriefRef, className: "bg-white rounded-2xl p-6 sm:p-8 space-y-6 border border-stone-200 relative overflow-hidden w-full max-w-full min-w-0 box-border" },
                    React.createElement("span", { className: "absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#C43E0E] via-slate-800 to-[#C43E0E]" }),
                    React.createElement("div", { className: "flex items-center gap-5 pb-5 border-b border-stone-100 min-w-0" },
                        React.createElement("div", { className: "w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C43E0E] to-[#A8350C] text-white flex items-center justify-center text-2xl font-black shrink-0" }, selectedPlayer.number !== "" && selectedPlayer.number !== undefined ? selectedPlayer.number : "?"),
                        React.createElement("div", { className: "min-w-0" },
                            React.createElement("p", { className: "text-2xl font-bold text-slate-900 truncate" }, selectedPlayer.name),
                            React.createElement("p", { className: "text-sm text-slate-500 truncate" }, [selectedPlayer.position, selectedTeam?.name].filter(Boolean).join(" · ")))),
                    React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-4 min-w-0" }, bioItems),
                    React.createElement("div", { className: "grid md:grid-cols-2 gap-8 items-center min-w-0" },
                        React.createElement("div", { className: "min-w-0 flex justify-center" }, React.createElement(RadarChart, { values: radarValues, size: 240 })),
                        React.createElement("div", { className: "grid grid-cols-2 gap-4 min-w-0" }, statRows)),
                    React.createElement("div", { className: "pt-5 border-t border-stone-100" },
                        React.createElement("p", { className: "text-[10px] text-slate-400 uppercase tracking-wide mb-1.5" }, "Wurftechnik-Video"),
                        wurfVideo
                            ? React.createElement("a", { href: wurfVideo.url, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 text-sm font-medium text-[#C43E0E] hover:text-[#A8350C] bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition" },
                                React.createElement(IconVideo, { size: 14 }),
                                fmtDate(wurfVideo.date))
                            : React.createElement("p", { className: "text-sm text-slate-400" }, "Noch kein Wurftechnik-Video hinterlegt."))),
                isTrainer && React.createElement("div", { className: `${cardClass} p-4 space-y-4` },
                    React.createElement("div", { className: "flex items-center justify-between" },
                        React.createElement(SectionLabel, null, "Skill-Bewertung"),
                        React.createElement("button", { onClick: () => { setVideoDefaultType("Wurftechnik"); setModal("video"); }, className: "flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800 shrink-0" },
                            React.createElement(IconUpload, { size: 13 }),
                            " Wurftechnik-Video")),
                    React.createElement(RadarEditor, { values: manualRatings, onChange: setRadarValue, modes: radarModes, onModeChange: setRadarMode, autoValues: autoValues })));
        })()))))),
        modal === "team" && (React.createElement(Modal, { title: "Team anlegen", onClose: () => setModal(null) },
            React.createElement(TeamForm, { onSubmit: handleAddTeam, onClose: () => setModal(null) }))),
        modal === "teams" && (React.createElement(Modal, { title: "Teams verwalten", onClose: () => setModal(null) },
            React.createElement(TeamsManager, { teams: visibleTeams, onEdit: (t) => { setEditingTeam(t); setModal("editTeam"); }, onClose: () => setModal(null) }))),
        modal === "editTeam" && editingTeam && (React.createElement(Modal, { title: "Team bearbeiten", onClose: () => { setModal(null); setEditingTeam(null); } },
            React.createElement(TeamForm, { initial: editingTeam, onSubmit: (changes) => handleEditTeam(editingTeam.id, changes), onClose: () => { setModal(null); setEditingTeam(null); } }))),
        modal === "player" && (React.createElement(Modal, { title: "Spieler anlegen", onClose: () => setModal(null) },
            React.createElement(PlayerForm, { teams: visibleTeams, onSubmit: handleAddPlayer, onClose: () => setModal(null) }))),
        modal === "editPlayer" && selectedPlayer && (React.createElement(Modal, { title: "Spieler bearbeiten", onClose: () => setModal(null) },
            React.createElement(PlayerForm, { teams: visibleTeams, initial: selectedPlayer, onSubmit: handleEditPlayer, onClose: () => setModal(null) }))),
        modal === "selfProfile" && selectedPlayer && (React.createElement(Modal, { title: "Meine Daten bearbeiten", onClose: () => setModal(null) },
            React.createElement(PlayerSelfProfileForm, { initial: selectedPlayer, mandatory: false, onSubmit: async (changes) => { await persistPlayerFields(selectedPlayer.id, changes); setModal(null); }, onClose: () => setModal(null) }))),
        modal === "stat" && (React.createElement(Modal, { title: "Spielstatistik hinzuf\u00FCgen", onClose: () => setModal(null), wide: true },
            React.createElement(StatForm, { onSubmit: handleAddStat, onClose: () => setModal(null), statCategories: displayStatCategories }))),
        modal === "editStat" && editingStat && (React.createElement(Modal, { title: "Spielstatistik bearbeiten", onClose: () => { setModal(null); setEditingStat(null); }, wide: true },
            React.createElement(StatForm, { onSubmit: handleEditStat, onClose: () => { setModal(null); setEditingStat(null); }, statCategories: displayStatCategories, initialEntry: editingStat }))),
        modal === "statFields" && (React.createElement(Modal, { title: "Statistik-Kategorien verwalten", onClose: () => setModal(null), wide: true },
            React.createElement(StatCategoriesManager, { categories: statCategories, onAddCat: addStatCategory, onRenameCat: renameStatCategory, onDeleteCat: deleteStatCategory, onMoveCat: moveStatCategory, onAddField: addStatFieldToCategory, onRenameField: renameStatFieldInCategory, onDeleteField: deleteStatFieldFromCategory, onMoveField: moveStatFieldInCategory, onClose: () => setModal(null) }))),
        modal === "testTypes" && (React.createElement(Modal, { title: "Test-Arten verwalten", onClose: () => setModal(null) },
            React.createElement(SimpleListManager, { items: testTypes, onAdd: addTestType, onRename: renameTestType, onDelete: deleteTestType, onMove: moveTestType, onClose: () => setModal(null), addPlaceholder: "Neue Testart, z. B. T-Test", description: "Diese Liste erscheint als Auswahl im Athletik-Test-Formular. \u00C4nderungen wirken nur auf Anzeige/neue Eintr\u00E4ge." }))),
        modal === "test" && (React.createElement(Modal, { title: "Athletik-Test hinzuf\u00FCgen", onClose: () => setModal(null) },
            React.createElement(TestForm, { onSubmit: handleAddTest, onClose: () => setModal(null), testTypes: testTypes }))),
        modal === "editTest" && editingTest && (React.createElement(Modal, { title: "Athletik-Test bearbeiten", onClose: () => { setModal(null); setEditingTest(null); } },
            React.createElement(TestForm, { onSubmit: handleEditTest, onClose: () => { setModal(null); setEditingTest(null); }, testTypes: testTypes, initialEntry: editingTest }))),
        modal === "video" && (React.createElement(Modal, { title: "Video verkn\u00FCpfen", onClose: () => setModal(null) },
            React.createElement(VideoForm, { onSubmit: handleAddVideo, onClose: () => setModal(null), defaultType: videoDefaultType }))),
        modal === "note" && (React.createElement(Modal, { title: "Notiz hinzuf\u00FCgen", onClose: () => setModal(null) },
            React.createElement(NoteForm, { onSubmit: handleAddNote, onClose: () => setModal(null) }))),
        modal === "accounts" && (React.createElement(Modal, { title: "Zug\u00E4nge verwalten", onClose: () => setModal(null), wide: true },
            React.createElement(AccountManagerModal, { accounts: accounts, accountsLoaded: accountsLoaded, players: players, teams: teams, currentUid: firebaseUser?.uid, onLoad: loadAccounts, onCreate: createAccount, onDelete: deleteAccount, onClose: () => setModal(null) }))),
        modal === "devPlanTemplates" && (React.createElement(Modal, { title: "Development-Plan-Fragen verwalten", onClose: () => setModal(null), wide: true },
            React.createElement(DevPlanTemplateEditor, { templates: devPlanTemplates, onSave: saveDevPlanTemplates, onClose: () => setModal(null) }))),
        modal === "feedbackTemplates" && (React.createElement(Modal, { title: "Feedback-Fragen verwalten", onClose: () => setModal(null), wide: true },
            React.createElement(FeedbackTemplatesEditor, { questions: feedbackQuestions, categories: feedbackCategories, onSaveQuestions: saveFeedbackQuestions, onAddCategory: addFeedbackCategory, onRenameCategory: renameFeedbackCategory, onDeleteCategory: deleteFeedbackCategory, onMoveCategory: moveFeedbackCategory, onClose: () => setModal(null) }))),
        modal === "requestFeedbackToPlayer" && selectedPlayer && (React.createElement(Modal, { title: "Feedback anfordern", onClose: () => setModal(null) },
            React.createElement(RequestFeedbackToPlayerForm, { player: selectedPlayer, team: selectedTeam, teamPlayers: players.filter((p) => p.teamId === selectedPlayer.teamId), pastEvents: recentPastEventsForPlayer(calendarEvents, selectedPlayer), onSubmit: requestFeedbackToPlayer, onClose: () => setModal(null) }))),
        modal === "requestFeedbackToTrainer" && selectedPlayer && (React.createElement(Modal, { title: "Feedback anfordern", onClose: () => setModal(null) },
            React.createElement(RequestFeedbackToTrainerForm, { pastEvents: recentPastEventsForPlayer(calendarEvents, selectedPlayer), onSubmit: requestFeedbackToTrainer, onClose: () => setModal(null) }))),
        modal === "teamNoteDashboard" && (React.createElement(Modal, { title: "Notiz/Datei f\u00FCr Spieler", onClose: () => setModal(null), wide: true },
            React.createElement(TeamNoteForm, { teams: teams, players: players, defaultTeamId: selectedPlayer?.teamId, onSubmit: addTeamNote, onClose: () => setModal(null) }))),
        modal === "importAttendance" && (React.createElement(Modal, { title: "Anwesenheit aus CSV importieren", onClose: () => setModal(null), wide: true },
            React.createElement(AttendanceImportModal, { players: players, teams: teams, onConfirm: handleImportAttendance, onClose: () => setModal(null) }))),
        modal === "importCalendar" && (React.createElement(Modal, { title: "Kalender aus .ics importieren", onClose: () => setModal(null), wide: true },
            React.createElement(IcsImportModal, { teams: teams, onConfirm: handleImportCalendarEvents, onClose: () => setModal(null) }))),
        modal === "importScreenshot" && (React.createElement(Modal, { title: "Kalender aus Screenshot importieren (Beta)", onClose: () => setModal(null), wide: true },
            React.createElement(ScreenshotImportModal, { teams: teams, allPlayers: players, onConfirm: handleImportCalendarEvents, onClose: () => setModal(null) }))),
        modal === "importBoxscore" && (React.createElement(Modal, { title: "Boxscore einf\u00FCgen", onClose: () => setModal(null), wide: true },
            React.createElement(BoxscoreImportModal, { players: players, teams: teams, onConfirm: handleImportBoxscore, onClose: () => setModal(null) }))),
        modal === "importAdvanced" && (React.createElement(Modal, { title: "Advanced Stats importieren", onClose: () => setModal(null), wide: true },
            React.createElement(AdvancedStatsImportModal, { players: players, teams: teams, onConfirm: handleImportAdvancedStats, onClose: () => setModal(null) }))),
        modal === "advancedRechnerLive" && (React.createElement(Modal, { title: "Advanced-Rechner verbinden", onClose: () => setModal(null), wide: true },
            React.createElement(AdvancedRechnerLiveModal, { players: players, teams: teams, onConfirm: handleImportAdvancedStats, onClose: () => setModal(null) }))),
        modal === "importDbbScores" && (React.createElement(Modal, { title: "DBB Scores importieren", onClose: () => setModal(null), wide: true },
            React.createElement(DbbScoresImportModal, { teams: dbbEligibleTeams, allPlayers: players, onConfirm: handleImportDbbScores, onClose: () => setModal(null) })))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(SpielerAkte, null));
