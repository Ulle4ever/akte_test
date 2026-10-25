// panels.js - Kopfzeilen-Menue, Trainer-Dashboard, Radar, Monitoring (Belastung + Wellness), Schulnoten, Feedback und Team-Uebersicht.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const HEADER_MENU_WIDTH = 256; // entspricht w-64
function HeaderMenu({ label, icon: Icon, items, isOpen, onToggle, onClose, header }) {
    const btnRef = useRef(null);
    const [menuPos, setMenuPos] = useState(null);
    useEffect(() => {
        if (!isOpen) {
            setMenuPos(null);
            return;
        }
        function computePos() {
            const btn = btnRef.current;
            if (!btn)
                return;
            const rect = btn.getBoundingClientRect();
            const margin = 12;
            const maxLeft = Math.max(margin, window.innerWidth - HEADER_MENU_WIDTH - margin);
            const left = Math.min(Math.max(rect.right - HEADER_MENU_WIDTH, margin), maxLeft);
            setMenuPos({ top: rect.bottom + 8, left });
        }
        computePos();
        window.addEventListener("resize", computePos);
        window.addEventListener("scroll", computePos, true);
        return () => {
            window.removeEventListener("resize", computePos);
            window.removeEventListener("scroll", computePos, true);
        };
    }, [isOpen]);
    return (React.createElement("div", { className: "relative" },
        React.createElement("button", { ref: btnRef, onClick: onToggle, "aria-label": label, title: label, className: `flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-full transition ${isOpen ? "bg-white text-slate-900 shadow-sm" : "text-white/80 bg-white/10 hover:bg-white/20"}` },
            React.createElement(Icon, { size: 14 }),
            React.createElement("span", { className: "hidden sm:inline max-w-[140px] truncate" }, label),
            React.createElement(IconArrowDown, { size: 11, className: `transition-transform ${isOpen ? "rotate-180" : ""}` })),
        isOpen && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "fixed inset-0 z-40", onClick: onClose }),
            React.createElement("div", { className: "fixed w-64 bg-white rounded-xl shadow-xl border border-stone-200 py-1.5 z-50 overflow-hidden origin-top rsk-pop-in", style: menuPos ? { top: menuPos.top, left: menuPos.left } : { visibility: "hidden" } },
                header && React.createElement("div", { className: "px-3.5 pt-1.5 pb-2.5 mb-1 border-b border-stone-100" }, header),
                items.map((item) => {
                    const ItemIcon = item.icon;
                    return (React.createElement(React.Fragment, { key: item.label },
                        item.dividerBefore && React.createElement("div", { className: "my-1 border-t border-stone-100" }),
                        React.createElement("button", { onClick: () => { item.onClick(); if (!item.keepOpen) onClose(); }, disabled: item.disabled, className: `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-stone-50 transition text-left disabled:opacity-50 ${item.danger ? "text-red-600" : "text-slate-700"}` },
                            React.createElement("span", { className: `w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${item.danger ? "bg-red-50 text-red-600" : "bg-red-50 text-[#C43E0E]"}` },
                                React.createElement(ItemIcon, { size: 13 })),
                            React.createElement("span", { className: "flex-1" }, item.label),
                            item.hint && React.createElement("span", { className: "text-[11px] text-slate-400 shrink-0" }, item.hint))));
                }))))));
}
const ATTENDANCE_WARN_THRESHOLD = 75;
const ATTENDANCE_MIN_MARKED = 3; // erst ab so vielen markierten Einheiten ueberhaupt eine Quote bilden
// Trainingsbelastung (sRPE-Methode, ACWR = Ø Load 7 Tage / Ø Load 28 Tage):
// Standardwerte wie in der Athletik-Trainer-Vorlage (Google Sheet).
const ACWR_LOW = 0.8; // darunter: Unterbelastung
const ACWR_HIGH = 1.3; // oberes Ende des Zielkorridors
const ACWR_ALARM = 1.5; // darueber: deutliche Belastungsspitze
const ACWR_MIN_HISTORY_DAYS = 21; // vorher zu wenig Historie fuer eine aussagekraeftige ACWR
const TRAINING_LOAD_TYPE_DEFAULTS = {
    tt: { duration: 90, fixed: false },
    it: { duration: 60, fixed: false },
    at: { duration: 60, fixed: false },
    spiel: { duration: 120, fixed: true },
    training: { duration: 90, fixed: false },
    individuell: { duration: 60, fixed: false },
};
// Farbcodierung "Braucht Aufmerksamkeit": jede Art bekommt ihre eigene Farbe,
// damit man Zeilen (aufgeklappt) und Anzahl-Badges (eingeklappt) auf einen
// Blick unterscheiden kann.
const ATTENTION_KIND_LABEL = { injury: "Verletzt/Reha", profile: "Profil", feedback: "Feedback", wellness: "Wellness", attendance: "Anwesenheit", devplan: "Dev-Plan", load: "Belastung" };
const ATTENTION_PREVIEW_COUNT = 6; // so viele Zeilen zeigt "Braucht Aufmerksamkeit", bevor "Alle anzeigen" kommt
const ATTENTION_KIND_STYLE = {
    injury: { icon: IconAlert, row: "bg-orange-50 hover:bg-orange-100 border-orange-500", text: "text-orange-700", badge: "bg-orange-500 text-white" },
    profile: { icon: IconEdit, row: "bg-red-50 hover:bg-red-100 border-red-500", text: "text-red-700", badge: "bg-red-500 text-white" },
    feedback: { icon: IconMessage, row: "bg-yellow-50 hover:bg-yellow-100 border-yellow-500", text: "text-yellow-800", badge: "bg-yellow-400 text-slate-900" },
    wellness: { icon: IconHeart, row: "bg-purple-50 hover:bg-purple-100 border-purple-500", text: "text-purple-700", badge: "bg-purple-500 text-white" },
    attendance: { icon: IconActivity, row: "bg-teal-50 hover:bg-teal-100 border-teal-500", text: "text-teal-700", badge: "bg-teal-500 text-white" },
    devplan: { icon: IconClipboard, row: "bg-blue-50 hover:bg-blue-100 border-blue-500", text: "text-blue-700", badge: "bg-blue-500 text-white" },
    load: { icon: IconTrendUp, row: "bg-fuchsia-50 hover:bg-fuchsia-100 border-fuchsia-500", text: "text-fuchsia-700", badge: "bg-fuchsia-500 text-white" },
};
const ATTENTION_KIND_ORDER = ["injury", "profile", "feedback", "wellness", "attendance", "devplan", "load"];
function TrainerDashboard({ events, teams, players, wellnessData, trainingLoadData, eventAttendance, devPlanWaiting, feedbackWaiting, onSelectTeam, onSelectPlayer, onAddEvent, onEditEvent, onDeleteEvent, onOpenNoteForm, onGoToAllUnits }) {
    const [showEventForm, setShowEventForm] = useState(false);
    const [attentionExpanded, setAttentionExpanded] = useState(true);
    const [attentionFilter, setAttentionFilter] = useState(null);
    const [attentionShowAll, setAttentionShowAll] = useState(false);
    const [loadExpanded, setLoadExpanded] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const days = [];
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
        const d = new Date(d0);
        d.setDate(d0.getDate() + i);
        days.push(d);
    }
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    const outPlayers = players.filter((p) => p.status === "verletzt" || p.status === "reha");
    const currentWeekKey = isoWeekKey(today());
    const wellnessThisWeek = players.map((p) => ({ player: p, entry: (wellnessData[p.id]?.entries || []).find((e) => e.weekKey === currentWeekKey) || null }));
    const checkedInWellness = wellnessThisWeek.filter((w) => w.entry);
    const flaggedWellness = checkedInWellness.filter((w) => Number(w.entry.energy) <= 2 || Number(w.entry.soreness) <= 2 || Number(w.entry.stress) >= 4 || (w.entry.pain && w.entry.pain.trim()));
    function wellnessFlagReason(entry) {
        const reasons = [];
        if (entry.pain && entry.pain.trim())
            reasons.push(entry.pain.trim());
        if (Number(entry.energy) <= 2)
            reasons.push("Energie niedrig");
        if (Number(entry.soreness) <= 2)
            reasons.push("Stark erschöpft");
        if (Number(entry.stress) >= 4)
            reasons.push("Stress hoch");
        return reasons.join(" · ") || "Auffällig";
    }
    // Trainingsbelastung (sRPE/ACWR) je Spieler fuer "heute" - Grundlage fuer
    // die Team-heute-Karte und den Belastungsalarm unter "Braucht Aufmerksamkeit".
    const todayKeyLoad = today();
    const trainingLoadRows = players.map((p) => {
        const entries = trainingLoadData[p.id]?.entries || [];
        const todaysEntries = entries.filter((e) => e.date === todayKeyLoad);
        const loadToday = todaysEntries.reduce((sum, e) => sum + sessionLoad(e), 0);
        const load7 = Math.round(avgLoadOverDays(dailyLoadMap(entries), todayKeyLoad, 7));
        const acwr = computeAcwr(entries, todayKeyLoad);
        const zone = acwrZone(acwr);
        const lastEntry = sortByDateDesc(entries)[0] || null;
        return { player: p, todaysEntries, loadToday, load7, acwr, zone, lastEntry };
    });
    const loadAlarmRows = trainingLoadRows.filter((r) => r.zone.label === "Alarm");
    function openNewEvent() {
        setEditingEvent(null);
        setShowEventForm(true);
    }
    function openEditEvent(e) {
        setEditingEvent(e);
        setShowEventForm(true);
    }
    const hour = new Date().getHours();
    const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Willkommen zurück" : "Guten Abend";
    // Vier Kennzahlen (statt fuenf), damit das Raster auf Handy (2x2) und
    // Desktop (1x4) ohne einzelne "Waisen"-Kachel aufgeht.
    const kpiTiles = [
        { label: "Spieler", sub: `in ${teams.length} ${teams.length === 1 ? "Team" : "Teams"}`, value: players.length, icon: IconUsers, grad: "from-slate-900 to-[#8A2C0A]" },
        { label: "Verletzt / Reha", sub: outPlayers.length > 0 ? "fallen aus" : "alle fit", value: outPlayers.length, icon: IconAlert, grad: outPlayers.length > 0 ? "from-amber-500 to-amber-700" : "from-emerald-500 to-emerald-700" },
        { label: "Check-ins", sub: "diese Woche", value: `${checkedInWellness.length}/${players.length}`, icon: IconHeart, grad: "from-[#FF6A2B] to-[#C43E0E]" },
        { label: "Belastungsalarm", sub: "ACWR ≥ " + String(ACWR_ALARM).replace(".", ","), value: loadAlarmRows.length, icon: IconTrendUp, grad: loadAlarmRows.length > 0 ? "from-fuchsia-500 to-fuchsia-700" : "from-emerald-500 to-emerald-700" },
    ].map((k) => React.createElement("div", { key: k.label, className: "bg-white border border-stone-100 rounded-2xl p-3 sm:p-4 flex flex-col items-start sm:flex-row sm:items-center gap-2.5 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] min-w-0" },
        React.createElement("span", { className: `w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${k.grad} text-white flex items-center justify-center shrink-0` },
            React.createElement(k.icon, { size: 16 })),
        React.createElement("div", { className: "min-w-0 w-full" },
            React.createElement("p", { className: "text-xl sm:text-2xl font-black text-slate-900 leading-none tabular-nums" }, k.value),
            React.createElement("p", { className: "text-xs font-semibold text-slate-600 mt-1 truncate" }, k.label),
            React.createElement("p", { className: "text-[11px] text-slate-400 truncate" }, k.sub))));
    const terminCard = React.createElement("div", { className: `${cardClass} p-5` },
        React.createElement("div", { className: "flex items-center justify-between" },
            React.createElement(SectionLabel, null, "Nächste Termine"),
            React.createElement("button", { onClick: openNewEvent, className: "flex items-center gap-1 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B]" },
                React.createElement(IconPlus, { size: 13 }),
                " Termin")),
        React.createElement("div", { className: "mt-3 space-y-4" },
            days.map((d) => {
                const iso = isoDate(d);
                const dayEvents = sortByDateDesc(events.filter((e) => e.date === iso)).reverse();
                if (dayEvents.length === 0)
                    return null;
                const isToday = iso === isoDate(d0);
                return (React.createElement("div", { key: iso },
                    React.createElement("p", { className: `text-xs font-semibold uppercase tracking-wide mb-2 ${isToday ? "text-[#C43E0E]" : "text-slate-400"}` }, isToday ? "Heute" : d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })),
                    React.createElement("div", { className: "space-y-1.5" }, dayEvents.map((e) => (React.createElement("div", { key: e.id, className: "flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 group" },
                        React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[e.type]?.dot || "bg-slate-400"}` }),
                        React.createElement("span", { className: "text-sm font-semibold text-slate-800 shrink-0" }, e.time || "–"),
                        React.createElement("span", { className: "text-sm text-slate-700 truncate flex-1" }, e.title),
                        React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, teamName(e.teamId) || "Individuell"),
                        React.createElement("div", { className: "hidden group-hover:flex items-center gap-1.5 shrink-0" },
                            React.createElement("button", { onClick: () => openEditEvent(e), className: "text-slate-400 hover:text-[#C43E0E]", "aria-label": "Bearbeiten" },
                                React.createElement(IconEdit, { size: 13 })),
                            React.createElement("button", { onClick: () => onDeleteEvent(e.id), className: "text-slate-400 hover:text-red-500", "aria-label": "Löschen" },
                                React.createElement(IconTrash, { size: 13 })))))))));
            }),
            days.every((d) => events.filter((e) => e.date === isoDate(d)).length === 0) && (React.createElement("p", { className: "text-sm text-slate-400 text-center py-6" }, "Keine Termine in den nächsten 7 Tagen."))));
    const teamsCard = React.createElement("div", { className: `${cardClass} p-5` },
        React.createElement(SectionLabel, null, "Teams"),
        React.createElement("div", { className: "mt-3 space-y-1.5" }, teams.length === 0
            ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Noch kein Team angelegt.")
            : teams.map((t, i) => {
                const count = players.filter((p) => p.teamId === t.id).length;
                return React.createElement("button", { key: t.id, onClick: () => onSelectTeam(t.id), className: "w-full flex items-center gap-2.5 bg-stone-50 hover:bg-stone-100 rounded-xl px-3 py-2 text-left transition group" },
                    React.createElement("span", { className: `w-8 h-8 rounded-lg bg-gradient-to-br ${TEAM_COLORS[i % TEAM_COLORS.length]} text-white flex items-center justify-center text-xs font-black shrink-0` }, (t.name || "?").charAt(0).toUpperCase()),
                    React.createElement("span", { className: "min-w-0 flex-1" },
                        React.createElement("span", { className: "block text-sm font-semibold text-slate-800 break-words leading-snug" }, t.name),
                        React.createElement("span", { className: "block text-xs text-slate-400" }, count, " Spieler")),
                    React.createElement(IconArrowLeft, { size: 12, className: "text-slate-300 group-hover:text-[#C43E0E] rotate-180 shrink-0" }));
            })));
    const incompleteProfilePlayers = players.filter((p) => p.onboardingCompleted !== true);
    // Anwesenheitsquote aus den direkt in "Alle Einheiten"/"Anwesenheit" markierten
    // Status berechnen (nur vergangene Einheiten, erst ab ein paar entschiedenen
    // Terminen ueberhaupt werten - sonst waere eine einzelne verpasste Einheit
    // gleich "0%"). "Verletzt" zaehlt bewusst nicht als Fehlen mit rein.
    const todayKey = today();
    const pastEvents = events.filter((e) => e.date && e.date < todayKey);
    const lowAttendancePlayers = players
        .map((p) => {
            let present = 0, absent = 0;
            pastEvents.forEach((e) => {
                // Nur zaehlen, wenn der Spieler bei diesem Termin auch tatsaechlich
                // zugeordnet war - sonst wuerden alte Markierungen von vor einem
                // Team-/Terminwechsel die Quote weiter verfaelschen (Inkonsistenz zu
                // Team-Uebersicht und Spieler-Akte, die das genauso pruefen).
                if (!getEventAttendees(e, players).some((a) => a.id === p.id))
                    return;
                const status = attendanceMark(eventAttendance, e.id, p.id).status;
                if (status === "present")
                    present++;
                else if (status === "absent")
                    absent++;
            });
            if (present + absent < ATTENDANCE_MIN_MARKED)
                return null;
            const quote = attendanceQuote(present, absent);
            return quote !== null && quote < ATTENDANCE_WARN_THRESHOLD ? { player: p, quote } : null;
        })
        .filter(Boolean);
    const devPlanWaitingRows = (devPlanWaiting || [])
        .map((w) => ({ waiting: w, player: players.find((p) => p.id === w.playerId) }))
        .filter((x) => x.player);
    const feedbackWaitingRows = (feedbackWaiting || [])
        .map((w) => ({ waiting: w, player: players.find((p) => p.id === w.playerId) }))
        .filter((x) => x.player);
    const attentionItems = [
        ...outPlayers.map((p) => ({ id: "injury-" + p.id, player: p, kind: "injury", label: STATUS_OPTIONS.find((s) => s.value === p.status)?.label || "Verletzt/Reha" })),
        ...flaggedWellness.map(({ player, entry }) => ({ id: "wellness-" + player.id, player, kind: "wellness", label: wellnessFlagReason(entry) })),
        ...incompleteProfilePlayers.map((p) => ({ id: "profile-" + p.id, player: p, kind: "profile", label: "Profil unvollständig" })),
        ...lowAttendancePlayers.map(({ player, quote }) => ({ id: "attendance-" + player.id, player, kind: "attendance", label: `${quote}% Anwesenheit` })),
        ...devPlanWaitingRows.map(({ player, waiting }) => ({ id: "devplan-" + waiting.id, player, kind: "devplan", label: "Wartet auf deine Freigabe" })),
        ...feedbackWaitingRows.map(({ player, waiting }) => ({ id: "feedback-" + waiting.id, player, kind: "feedback", label: "Feedback angefragt" })),
        ...loadAlarmRows.map(({ player, acwr }) => ({ id: "load-" + player.id, player, kind: "load", label: `ACWR ${acwr} - Belastungsspitze` })),
    ];
    const attentionRows = attentionItems.map((item) => {
        const style = ATTENTION_KIND_STYLE[item.kind] || ATTENTION_KIND_STYLE.injury;
        return React.createElement("button", { key: item.id, onClick: () => onSelectPlayer(item.player.id), className: `w-full flex items-center gap-2.5 ${style.row} border-l-2 rounded-xl px-3 py-2 text-left transition` },
            React.createElement(style.icon, { size: 14, className: `${style.text} shrink-0` }),
            React.createElement("span", { className: "text-sm font-semibold text-slate-800 flex-1 truncate" }, item.player.name),
            React.createElement("span", { className: "hidden sm:inline text-xs text-slate-400 shrink-0" }, teamName(item.player.teamId)),
            React.createElement("span", { className: `text-xs font-medium shrink-0 max-w-[45%] truncate ${style.text}` }, item.label));
    });
    const attentionCountsByKind = attentionItems.reduce((acc, item) => { acc[item.kind] = (acc[item.kind] || 0) + 1; return acc; }, {});
    // Chips sind gleichzeitig Filter: Klick zeigt nur noch diese Art an.
    const attentionBadges = ATTENTION_KIND_ORDER.filter((k) => attentionCountsByKind[k] > 0).map((k) => {
        const style = ATTENTION_KIND_STYLE[k];
        const active = attentionFilter === k;
        const dimmed = attentionFilter && !active;
        return React.createElement("button", { key: k, type: "button", onClick: () => { setAttentionFilter(active ? null : k); setAttentionExpanded(true); setAttentionShowAll(false); }, "aria-pressed": active, className: `inline-flex items-center gap-1 text-[11px] font-bold pl-1.5 pr-2 py-1 rounded-full transition ${style.badge} ${dimmed ? "opacity-35 hover:opacity-70" : ""} ${active ? "ring-2 ring-offset-1 ring-slate-900/30" : ""}` },
            React.createElement(style.icon, { size: 11 }),
            ATTENTION_KIND_LABEL[k],
            React.createElement("span", { className: "tabular-nums opacity-90" }, attentionCountsByKind[k]));
    });
    const filteredAttentionRows = attentionFilter ? attentionRows.filter((_, i) => attentionItems[i].kind === attentionFilter) : attentionRows;
    const visibleAttentionRows = attentionShowAll ? filteredAttentionRows : filteredAttentionRows.slice(0, ATTENTION_PREVIEW_COUNT);
    const scheduleConflicts = groupConflictsByEventPair(findScheduleConflicts(events, players, CONFLICT_MIN_OVERLAP_MINUTES));
    const conflictBanner = scheduleConflicts.length > 0 && React.createElement("button", { onClick: onGoToAllUnits, className: "w-full flex items-center gap-2.5 bg-amber-50 hover:bg-amber-100 border-l-2 border-amber-500 rounded-xl px-3 py-2.5 text-left transition" },
        React.createElement(IconAlert, { size: 14, className: "text-amber-600 shrink-0" }),
        React.createElement("span", { className: "text-sm font-semibold text-amber-800 flex-1" }, scheduleConflicts.length, " Terminüberschneidung", scheduleConflicts.length > 1 ? "en" : "", " gefunden"),
        React.createElement("span", { className: "text-xs font-medium text-amber-700 shrink-0" }, "In „Alle Einheiten“ ansehen →"));
    const attentionCard = React.createElement("div", { className: `${cardClass} p-5` },
        React.createElement("button", { type: "button", onClick: () => setAttentionExpanded((v) => !v), className: "w-full flex items-center justify-between gap-3" },
            React.createElement("div", { className: "flex items-center gap-2" },
                React.createElement(SectionLabel, null, "Braucht Aufmerksamkeit"),
                React.createElement("span", { className: `text-xs font-bold tabular-nums rounded-full px-2 py-0.5 ${attentionItems.length > 0 ? "bg-slate-900 text-white" : "bg-emerald-100 text-emerald-700"}` }, attentionItems.length)),
            React.createElement(IconArrowDown, { size: 16, className: `text-slate-400 transition-transform shrink-0 ${attentionExpanded ? "rotate-180" : ""}` })),
        attentionBadges.length > 1 && React.createElement("div", { className: "flex flex-wrap gap-1.5 mt-3" }, attentionBadges),
        attentionExpanded && React.createElement("div", { className: "mt-3 space-y-1.5" },
            conflictBanner,
            attentionRows.length === 0 && !conflictBanner
                ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Alles im grünen Bereich - keine Auffälligkeiten.")
                : visibleAttentionRows,
            filteredAttentionRows.length > ATTENTION_PREVIEW_COUNT && React.createElement("button", { type: "button", onClick: () => setAttentionShowAll((v) => !v), className: "w-full text-center text-xs font-semibold text-[#C43E0E] hover:text-[#FF6A2B] pt-2" },
                attentionShowAll ? "Weniger anzeigen" : `Alle ${filteredAttentionRows.length} anzeigen`)));
    // "Team heute": Trainingsbelastung (sRPE/ACWR) je Spieler, analog zur
    // Team-Uebersicht der Athletik-Trainer-Vorlage - Alarm-/Erhoeht-Zonen zuerst.
    const loadEntryCount = trainingLoadRows.filter((r) => r.todaysEntries.length > 0).length;
    const loadHighCount = trainingLoadRows.filter((r) => r.zone.label === "Erhöht").length;
    const trainingLoadTableRows = [...trainingLoadRows].sort((a, b) => {
        const rank = (r) => (r.zone.label === "Alarm" ? 0 : r.zone.label === "Erhöht" ? 1 : r.todaysEntries.length === 0 ? 2 : 3);
        return rank(a) - rank(b) || a.player.name.localeCompare(b.player.name);
    });
    const trainingLoadCard = React.createElement("div", { className: `${cardClass} p-5` },
        React.createElement("button", { type: "button", onClick: () => setLoadExpanded((v) => !v), className: "w-full flex items-center justify-between" },
            React.createElement("div", { className: "flex items-center gap-2 flex-wrap" },
                React.createElement(SectionLabel, null, "Trainingsbelastung heute"),
                players.length > 0 && React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, `${loadEntryCount}/${players.length} eingetragen`),
                loadAlarmRows.length > 0 && React.createElement("span", { className: "text-[11px] font-bold rounded-full px-2 py-0.5 bg-fuchsia-500 text-white" }, `${loadAlarmRows.length} Alarm`),
                loadHighCount > 0 && React.createElement("span", { className: "text-[11px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800" }, `${loadHighCount} erhöht`)),
            React.createElement(IconArrowDown, { size: 16, className: `text-slate-400 transition-transform shrink-0 ${loadExpanded ? "rotate-180" : ""}` })),
        loadExpanded && (players.length === 0
            ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-4 mt-3" }, "Noch keine Spieler.")
            : React.createElement("div", { className: "mt-3 -mx-1 overflow-x-auto" },
                React.createElement("table", { className: "w-full text-sm" },
                    React.createElement("thead", null,
                        React.createElement("tr", { className: "border-b-2 border-[#C43E0E]/20 bg-stone-50/60 text-slate-500 text-xs uppercase tracking-wide" },
                            React.createElement("th", { className: "text-left px-3 py-2" }, "Spieler"),
                            React.createElement("th", { className: "hidden sm:table-cell text-left px-3 py-2" }, "Team"),
                            React.createElement("th", { className: "text-center px-3 py-2" }, "Heute"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "Load 7T Ø"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "ACWR"),
                            React.createElement("th", { className: "text-left px-3 py-2" }, "Zone"))),
                    React.createElement("tbody", null, trainingLoadTableRows.map((r) => React.createElement("tr", { key: r.player.id, onClick: () => onSelectPlayer(r.player.id), className: "border-b border-stone-100 last:border-0 odd:bg-stone-50/40 hover:bg-red-50/60 cursor-pointer transition-colors" },
                        React.createElement("td", { className: "px-3 py-2 font-medium text-slate-800 truncate max-w-[160px]" }, r.player.name),
                        React.createElement("td", { className: "hidden sm:table-cell px-3 py-2 text-slate-400" }, teamName(r.player.teamId)),
                        React.createElement("td", { className: "px-3 py-2 text-center" }, r.todaysEntries.length > 0
                            ? React.createElement("span", { className: "text-emerald-600 font-bold" }, "S")
                            : React.createElement("span", { className: "text-slate-300" }, "–")),
                        React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, r.load7 || "–"),
                        React.createElement("td", { className: "px-3 py-2 text-right tabular-nums font-semibold" }, r.acwr === null ? "–" : r.acwr),
                        React.createElement("td", { className: "px-3 py-2" }, React.createElement("span", { className: `text-xs font-semibold rounded-full px-2 py-0.5 ${r.zone.cls}` }, r.zone.label)))))))));
    return (React.createElement("div", { className: "space-y-6 rsk-fade-in" },
        React.createElement("div", { className: "rounded-3xl bg-gradient-to-br from-white via-stone-50 to-white border border-stone-100 p-6 sm:p-8 relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]" },
            React.createElement("div", { className: "pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#C43E0E]/10 blur-3xl" }),
            React.createElement("div", { className: "pointer-events-none absolute -bottom-20 -left-16 w-64 h-64 rounded-full bg-[#C43E0E]/10 blur-3xl" }),
            React.createElement("div", { className: "relative flex items-center justify-between flex-wrap gap-4" },
                React.createElement("div", null,
                    React.createElement("div", { className: "flex items-center gap-2 mb-1.5" },
                        React.createElement("span", { className: "h-5 w-1.5 rounded-full bg-gradient-to-b from-[#C43E0E] to-[#C43E0E]" }),
                        React.createElement("h2", { className: "font-display text-2xl sm:text-3xl tracking-wide text-slate-900" }, greeting)),
                    React.createElement("p", { className: "text-sm text-slate-500" }, "Willkommen zurück im Trainer-Cockpit")),
                React.createElement("button", { onClick: onOpenNoteForm, className: btnPrimaryClass + " text-sm px-3.5 py-2 shrink-0" },
                    React.createElement(IconPaperclip, { size: 14 }),
                    " Notiz/Datei für Spieler")),
            React.createElement("div", { className: "relative grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mt-6" }, kpiTiles)),
        showEventForm && (React.createElement(Modal, { title: editingEvent ? "Termin bearbeiten" : "Termin anlegen", onClose: () => setShowEventForm(false), wide: true },
            React.createElement(EventForm, { initialEvent: editingEvent, teams: teams, allPlayers: players, onSubmit: (vals) => { editingEvent ? onEditEvent(editingEvent.id, vals) : onAddEvent(vals); setShowEventForm(false); }, onClose: () => setShowEventForm(false) }))),
        attentionCard,
        trainingLoadCard,
        React.createElement("div", { className: "grid xl:grid-cols-3 gap-6 items-start" },
            React.createElement("div", { className: "xl:col-span-2" }, terminCard),
            React.createElement("div", { className: "space-y-6" }, teamsCard))));
}
function polarPoint(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
function RadarChart({ values, size }) {
    const n = RADAR_SKILLS.length;
    const s = size || 240;
    const cx = s / 2, cy = s / 2;
    const maxR = s / 2 - 34;
    const axisAngles = RADAR_SKILLS.map((_, i) => (360 / n) * i);
    const ringPolys = [0.25, 0.5, 0.75, 1].map((lvl, i) => React.createElement("polygon", { key: i, points: axisAngles.map((a) => polarPoint(cx, cy, maxR * lvl, a).join(",")).join(" "), fill: "none", stroke: "#e7e5e4", strokeWidth: 1 }));
    const axisLines = axisAngles.map((a, i) => {
        const [x, y] = polarPoint(cx, cy, maxR, a);
        return React.createElement("line", { key: i, x1: cx, y1: cy, x2: x, y2: y, stroke: "#e7e5e4", strokeWidth: 1 });
    });
    const dataPoints = RADAR_SKILLS.map((skill, i) => polarPoint(cx, cy, maxR * ((values[skill.id] || 0) / 10), axisAngles[i]));
    const dots = dataPoints.map((p, i) => React.createElement("circle", { key: i, cx: p[0], cy: p[1], r: 3, fill: "#C43E0E" }));
    const labels = RADAR_SKILLS.map((skill, i) => {
        const [x, y] = polarPoint(cx, cy, maxR + 20, axisAngles[i]);
        return React.createElement("text", { key: skill.id, x: x, y: y, fontSize: 11, fontWeight: 600, fill: "#6B5D4E", textAnchor: "middle", dominantBaseline: "middle" }, skill.label);
    });
    const pad = 26;
    return React.createElement("svg", { viewBox: `${-pad} ${-pad} ${s + 2 * pad} ${s + 2 * pad}`, width: "100%", style: { maxWidth: s + 2 * pad, display: "block", margin: "0 auto" } },
        ringPolys,
        axisLines,
        React.createElement("polygon", { points: dataPoints.map((p) => p.join(",")).join(" "), fill: "rgba(196,62,14,0.15)", stroke: "#C43E0E", strokeWidth: 2 }),
        dots,
        labels);
}
function RadarEditor({ values, onChange, modes, onModeChange, autoValues }) {
    const rows = RADAR_SKILLS.map((skill) => {
        const mode = modes[skill.id];
        const isAuto = skill.autoCapable && mode === "auto";
        const autoVal = autoValues[skill.id];
        const modeToggle = skill.autoCapable && React.createElement("div", { className: "flex gap-1 bg-stone-100 rounded-full p-0.5 shrink-0" },
            React.createElement("button", { type: "button", onClick: () => onModeChange(skill.id, "auto"), className: `px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${mode === "auto" ? "bg-white text-[#C43E0E] shadow-sm" : "text-slate-400"}` }, "Auto"),
            React.createElement("button", { type: "button", onClick: () => onModeChange(skill.id, "manual"), className: `px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${mode !== "auto" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}` }, "Manuell"));
        const control = isAuto
            ? (autoVal !== null && autoVal !== undefined
                ? React.createElement("span", { className: "flex-1 text-xs text-slate-500" }, "Automatisch berechnet: ", React.createElement("span", { className: "font-bold text-slate-900" }, autoVal), " / 10")
                : React.createElement("span", { className: "flex-1 text-xs text-amber-600" }, "Noch zu wenig Daten – Fallback-Wert wird genutzt."))
            : React.createElement(React.Fragment, null,
                React.createElement("input", { type: "range", min: 1, max: 10, value: values[skill.id] || 5, onChange: (e) => onChange(skill.id, Number(e.target.value)), className: "flex-1 accent-[#C43E0E]" }),
                React.createElement("span", { className: "text-xs font-bold text-slate-900 w-5 text-right" }, values[skill.id] || 5));
        return React.createElement("div", { key: skill.id, className: "flex items-center gap-3" },
            React.createElement("span", { className: "text-xs font-medium text-slate-600 w-28 shrink-0" }, skill.label),
            modeToggle,
            control);
    });
    return React.createElement("div", { className: "space-y-3" }, rows);
}
const WELLNESS_SCALE_COLORS = { 1: "bg-red-500", 2: "bg-orange-500", 3: "bg-amber-400", 4: "bg-lime-500", 5: "bg-emerald-500" };
const TEAM_COLORS = ["from-[#C43E0E] to-[#8A2C0A]", "from-teal-600 to-teal-900", "from-emerald-500 to-emerald-800", "from-violet-500 to-violet-800", "from-amber-500 to-amber-800", "from-slate-600 to-slate-900"];
// Monitoring-Verlauf (Trainingsbelastung + Wellness-Check-in): nach Kalenderwoche
// gruppiert und einzeln ein-/ausklappbar, damit die Seite bei wachsender
// Historie uebersichtlich bleibt - nur die juengste Woche startet aufgeklappt.
function weekGroupsForEntries(entries) {
    const map = new Map();
    entries.forEach((e) => {
        const key = isoWeekKey(e.date);
        if (!map.has(key))
            map.set(key, []);
        map.get(key).push(e);
    });
    return Array.from(map.entries())
        .map(([weekKey, items]) => ({ weekKey, entries: sortByDateDesc(items), monday: startOfWeekMonday(new Date(items[0].date + "T00:00:00")) }))
        .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}
function WeekAccordionSection({ weekKey, monday, defaultOpen, summary, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return React.createElement("div", { className: `${cardClass} overflow-hidden` },
        React.createElement("button", { type: "button", onClick: () => setOpen((v) => !v), className: "w-full flex items-center justify-between px-4 py-3" },
            React.createElement("div", { className: "flex items-center gap-2.5" },
                React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, formatWeekRange(monday)),
                summary),
            React.createElement(IconArrowDown, { size: 14, className: `text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}` })),
        open && React.createElement("div", { className: "px-4 pb-4 pt-1 border-t border-stone-100 space-y-2" }, children));
}
// Trainingsbelastung (sRPE): RPE 1-10 nach Borg CR-10, ein Eintrag pro
// bereits stattgefundenem Kalender-Termin (Typ/Datum kommen vom Termin selbst -
// der Spieler traegt nur noch Anstrengung und ggf. eine abweichende Dauer ein).
function RpeScaleInput({ value, onChange }) {
    const buttons = Array.from({ length: 10 }, (_, i) => i + 1).map((n) => React.createElement("button", { key: n, type: "button", onClick: () => onChange(n), className: `flex-1 h-9 rounded-lg text-sm font-bold transition ${value === n ? "bg-[#C43E0E] text-white shadow-sm scale-105" : "bg-stone-100 text-slate-400 hover:bg-stone-200"}` }, n));
    return React.createElement("div", { className: "space-y-1.5" },
        React.createElement("div", { className: "flex items-center gap-1" }, buttons),
        React.createElement("div", { className: "flex items-center justify-between text-[11px] text-slate-400" },
            React.createElement("span", null, "Sehr leicht"),
            React.createElement("span", null, "Maximal")));
}
function TrainingLoadLogForm({ event, onSubmit }) {
    const typeDefaults = TRAINING_LOAD_TYPE_DEFAULTS[event.type] || { duration: 60, fixed: false };
    const [duration, setDuration] = useState(typeDefaults.fixed ? typeDefaults.duration : (eventDurationMinutes(event) || typeDefaults.duration));
    const [rpe, setRpe] = useState(null);
    function submit(e) {
        e.preventDefault();
        if (!rpe)
            return;
        onSubmit({ eventId: event.id, date: event.date, type: event.type, durationMin: Number(duration) || 0, rpe });
    }
    return React.createElement("form", { onSubmit: submit, className: `${cardClass} p-3.5 space-y-2.5` },
        React.createElement("div", { className: "flex items-center justify-between gap-2" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, event.title || EVENT_TYPE_STYLES[event.type]?.label),
                React.createElement("p", { className: "text-xs text-slate-400" }, fmtDate(event.date), " · ", EVENT_TYPE_STYLES[event.type]?.label || event.type)),
            React.createElement("div", { className: "flex items-center gap-1.5 shrink-0" },
                React.createElement("input", { type: "number", min: 1, className: inputClass + " w-16 text-center", value: duration, disabled: typeDefaults.fixed, onChange: (e) => setDuration(e.target.value) }),
                React.createElement("span", { className: "text-xs text-slate-400" }, "Min."))),
        React.createElement(RpeScaleInput, { value: rpe, onChange: setRpe }),
        React.createElement("button", { type: "submit", disabled: !rpe, className: btnPrimaryClass + " w-full justify-center text-sm disabled:opacity-40" }, "Eintragen"));
}
function TrainingLoadEntryCard({ entry, onDelete, canDelete }) {
    return React.createElement("div", { className: `${cardClass} p-3.5 flex items-center justify-between gap-3` },
        React.createElement("div", { className: "min-w-0" },
            React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, EVENT_TYPE_STYLES[entry.type]?.label || entry.type),
            React.createElement("p", { className: "text-xs text-slate-400" }, fmtDate(entry.date), " · ", entry.durationMin, " Min. · RPE ", entry.rpe)),
        React.createElement("div", { className: "flex items-center gap-3 shrink-0" },
            React.createElement("span", { className: "text-sm font-bold text-slate-900" }, sessionLoad(entry), " AU"),
            canDelete && React.createElement("button", { onClick: () => onDelete(entry.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Eintrag löschen" },
                React.createElement(IconTrash, { size: 13 }))));
}
function TrainingLoadPanel({ isTrainer, isOwnAccount, events, entries, onAddEntry, onDeleteEntry }) {
    const todayKey = today();
    const loggedEventIds = new Set(entries.map((e) => e.eventId).filter(Boolean));
    const openEvents = events
        .filter((e) => e.date && e.date <= todayKey && !loggedEventIds.has(e.id))
        .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
        .slice(0, 10);
    const weekGroups = weekGroupsForEntries(entries);
    const acwr = computeAcwr(entries, todayKey);
    const zone = acwrZone(acwr);
    let form = null;
    if (!isTrainer && isOwnAccount) {
        form = openEvents.length === 0
            ? React.createElement("div", { className: `${cardClass} p-4 flex items-center gap-2.5 text-emerald-700 bg-emerald-50 border border-emerald-100` },
                React.createElement(IconCheck, { size: 16 }),
                React.createElement("span", { className: "text-sm font-medium" }, "Alles eingetragen - keine offenen Einheiten."))
            : React.createElement("div", { className: "space-y-2.5" },
                React.createElement(SectionLabel, null, "Belastung eintragen"),
                openEvents.map((e) => React.createElement(TrainingLoadLogForm, { key: e.id, event: e, onSubmit: onAddEntry })));
    }
    return React.createElement("div", { className: "space-y-4" },
        React.createElement(SectionLabel, null, "Trainingsbelastung"),
        React.createElement("div", { className: "flex items-center gap-3 flex-wrap" },
            React.createElement("div", { className: `${cardClass} px-4 py-2.5 flex items-center gap-2` },
                React.createElement("span", { className: "text-xs text-slate-400" }, "ACWR"),
                React.createElement("span", { className: "text-sm font-black text-slate-900" }, acwr === null ? "–" : acwr)),
            React.createElement("span", { className: `text-xs font-semibold rounded-full px-2.5 py-1 ${zone.cls}` }, zone.label)),
        form,
        React.createElement("div", null,
            weekGroups.length > 0 && React.createElement(SectionLabel, null, "Verlauf"),
            React.createElement("div", { className: "space-y-2 mt-2" }, weekGroups.length === 0
                ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Belastungsdaten vorhanden.")
                : weekGroups.map((g, i) => {
                    const weekLoad = g.entries.reduce((sum, e) => sum + sessionLoad(e), 0);
                    const summary = React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, `${g.entries.length} · ${weekLoad} AU`);
                    return React.createElement(WeekAccordionSection, { key: g.weekKey, weekKey: g.weekKey, monday: g.monday, defaultOpen: i === 0, summary },
                        g.entries.map((e) => React.createElement(TrainingLoadEntryCard, { key: e.id, entry: e, canDelete: isTrainer, onDelete: () => onDeleteEntry(e.id) })));
                }))));
}
function WellnessScaleInput({ field, value, onChange }) {
    const buttons = [1, 2, 3, 4, 5].map((n) => React.createElement("button", { key: n, type: "button", onClick: () => onChange(n), className: `flex-1 h-9 rounded-lg text-sm font-bold transition ${value === n ? WELLNESS_SCALE_COLORS[n] + " text-white shadow-sm scale-105" : "bg-stone-100 text-slate-400 hover:bg-stone-200"}` }, n));
    return React.createElement("div", { className: "space-y-1.5" },
        React.createElement("p", { className: "text-sm font-medium text-slate-700" }, field.label),
        React.createElement("div", { className: "flex items-center gap-1.5" }, buttons),
        React.createElement("div", { className: "flex items-center justify-between text-[11px] text-slate-400" },
            React.createElement("span", null, field.lowLabel),
            React.createElement("span", null, field.highLabel)));
}
function WellnessEntryCard({ entry, onDelete, canDelete }) {
    const pills = WELLNESS_SCALE_FIELDS.map((f) => React.createElement("div", { key: f.id, className: "flex flex-col items-center gap-1" },
        React.createElement("span", { className: `w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${WELLNESS_SCALE_COLORS[entry[f.id]] || "bg-stone-200 text-slate-400"}` }, entry[f.id] || "–"),
        React.createElement("span", { className: "text-[10px] text-slate-400 text-center leading-tight" }, f.label.split(" ")[0])));
    return React.createElement("div", { className: `${cardClass} p-3.5` },
        React.createElement("div", { className: "flex items-center justify-between mb-2.5" },
            React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, fmtDate(entry.date)),
            canDelete && React.createElement("button", { onClick: () => onDelete(entry.id), className: "text-slate-300 hover:text-red-500", "aria-label": "Eintrag löschen" },
                React.createElement(IconTrash, { size: 13 }))),
        React.createElement("div", { className: "grid grid-cols-3 gap-1" }, pills),
        entry.pain && React.createElement("p", { className: "mt-2.5 text-sm text-[#C43E0E] bg-red-50 rounded-lg px-2.5 py-1.5" }, "⚠ ", entry.pain),
        entry.comment && React.createElement("p", { className: "mt-2 text-sm text-slate-600" }, entry.comment));
}
function WellnessPanel({ isTrainer, isOwnAccount, entries, onAddEntry, onDeleteEntry }) {
    const hasCheckedInToday = entries.some((e) => e.date === today());
    const [values, setValues] = useState({ soreness: 3, energy: 3, stress: 3, pain: "", comment: "" });
    function submit(e) {
        e.preventDefault();
        onAddEntry({ soreness: values.soreness, energy: values.energy, stress: values.stress, pain: values.pain.trim(), comment: values.comment.trim() });
        setValues({ soreness: 3, energy: 3, stress: 3, pain: "", comment: "" });
    }
    const scaleInputs = WELLNESS_SCALE_FIELDS.map((f) => React.createElement(WellnessScaleInput, { key: f.id, field: f, value: values[f.id], onChange: (n) => setValues((v) => ({ ...v, [f.id]: n })) }));
    const weekGroups = weekGroupsForEntries(entries);
    let form = null;
    if (!isTrainer && isOwnAccount) {
        form = hasCheckedInToday
            ? React.createElement("div", { className: `${cardClass} p-4 flex items-center gap-2.5 text-emerald-700 bg-emerald-50 border border-emerald-100` },
                React.createElement(IconCheck, { size: 16 }),
                React.createElement("span", { className: "text-sm font-medium" }, "Danke, heute schon eingecheckt! Du kannst dich jeden Tag neu eintragen – muss aber nicht."))
            : React.createElement("form", { onSubmit: submit, className: `${cardClass} p-4 space-y-4` },
                React.createElement(SectionLabel, null, "Check-in (freiwillig, jederzeit möglich)"),
                scaleInputs,
                React.createElement("div", null,
                    React.createElement("label", { className: labelClass }, "Schmerzen / Beschwerden (optional)"),
                    React.createElement("input", { className: inputClass, value: values.pain, onChange: (e) => setValues((v) => ({ ...v, pain: e.target.value })), placeholder: "z. B. Knie zieht seit 2 Tagen" })),
                React.createElement("div", null,
                    React.createElement("label", { className: labelClass }, "Kommentar (optional)"),
                    React.createElement("textarea", { className: inputClass, rows: 2, value: values.comment, onChange: (e) => setValues((v) => ({ ...v, comment: e.target.value })) })),
                React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center" }, "Check-in abschicken"));
    }
    const historyBody = weekGroups.length === 0
        ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Monitoring-Check-ins vorhanden.")
        : weekGroups.map((g, i) => {
            const summary = React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, `${g.entries.length} Check-in${g.entries.length > 1 ? "s" : ""}`);
            return React.createElement(WeekAccordionSection, { key: g.weekKey, weekKey: g.weekKey, monday: g.monday, defaultOpen: i === 0, summary },
                g.entries.map((e) => React.createElement(WellnessEntryCard, { key: e.id, entry: e, canDelete: isTrainer, onDelete: () => onDeleteEntry(e.id) })));
        });
    return React.createElement("div", { className: "space-y-4" },
        form,
        React.createElement("div", null,
            weekGroups.length > 0 && React.createElement(SectionLabel, null, "Verlauf"),
            React.createElement("div", { className: "space-y-2 mt-2" }, historyBody)));
}
function GradeChips({ grades, onRemove }) {
    return React.createElement("div", { className: "flex items-center gap-1 flex-wrap" }, (grades || []).map((g, i) => React.createElement("span", { key: i, className: "inline-flex items-center gap-0.5 text-[10px] font-semibold bg-white border border-stone-200 rounded-full pl-1.5 pr-1 py-0.5 shrink-0" },
        g,
        onRemove && React.createElement("button", { type: "button", onClick: () => onRemove(i), className: "text-slate-400 hover:text-red-500 leading-none", "aria-label": "Klausurnote entfernen" }, "×"))));
}
function GradesPanel({ isTrainer, isOwnAccount, subjects, onSave, onToggleFlag, onRenameSubject, onSetComment }) {
    const [rows, setRows] = useState(subjects);
    const [error, setError] = useState("");
    const [dirty, setDirty] = useState(false);
    useEffect(() => { setRows(subjects); setDirty(false); }, [subjects]);
    function updateRow(id, changes) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
        setDirty(true);
    }
    function addRow() {
        setRows((prev) => [...prev, { id: uid(), name: "", reportGrade: "", examGrades: [] }]);
        setDirty(true);
    }
    function removeRow(id) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setDirty(true);
    }
    function addExamGrade(id, grade) {
        if (!grade)
            return;
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, examGrades: [...(r.examGrades || []), grade] } : r)));
        setDirty(true);
    }
    function removeExamGrade(id, idx) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, examGrades: r.examGrades.filter((_, i) => i !== idx) } : r)));
        setDirty(true);
    }
    function handleSave(e) {
        e.preventDefault();
        const filled = rows.filter((r) => r.name.trim());
        const missing = filled.filter((r) => r.reportGrade && GRADE_OPTIONS.indexOf(r.reportGrade) > GRADE_CRITICAL_INDEX && (!r.examGrades || r.examGrades.length === 0));
        if (missing.length > 0) {
            setError(`Bitte bei folgenden Fächern mindestens eine Klausurnote eintragen: ${missing.map((m) => m.name).join(", ")}`);
            return;
        }
        setError("");
        onSave(filled.map((r) => ({ ...r, name: r.name.trim() })));
        setDirty(false);
    }
    if (isOwnAccount) {
        return React.createElement("form", { onSubmit: handleSave, className: `${cardClass} p-4 space-y-3` },
            React.createElement(SectionLabel, null, "Noten-Umfrage"),
            React.createElement("p", { className: "text-xs text-slate-400 -mt-1" }, "Zeugnisnote bitte bei allen Fächern eintragen. Bei schlechter als 3- bitte zusätzlich Klausurnoten eintragen."),
            React.createElement("div", { className: "space-y-1.5" }, rows.map((r) => React.createElement("div", { key: r.id, className: "bg-stone-50 rounded-lg px-2 py-1.5 space-y-1" },
                React.createElement("div", { className: "flex items-center gap-1.5" },
                    React.createElement("input", { className: "flex-1 min-w-0 text-sm bg-white border border-stone-200 rounded-lg px-2 py-1.5", value: r.name, onChange: (e) => updateRow(r.id, { name: e.target.value }), placeholder: "Fach" }),
                    React.createElement("select", { className: "text-sm bg-white border border-stone-200 rounded-lg px-1 py-1.5 w-14 shrink-0", value: r.reportGrade, onChange: (e) => updateRow(r.id, { reportGrade: e.target.value }) },
                        React.createElement("option", { value: "" }, "–"),
                        GRADE_OPTIONS.map((g) => React.createElement("option", { key: g, value: g }, g))),
                    React.createElement(GradeChips, { grades: r.examGrades, onRemove: (i) => removeExamGrade(r.id, i) }),
                    React.createElement("select", { className: "text-[10px] w-8 border border-dashed border-stone-300 rounded-full px-0.5 py-0.5 text-slate-400 bg-transparent shrink-0", value: "", onChange: (e) => { addExamGrade(r.id, e.target.value); } },
                        React.createElement("option", { value: "" }, "+"),
                        GRADE_OPTIONS.map((g) => React.createElement("option", { key: g, value: g }, g))),
                    React.createElement("button", { type: "button", onClick: () => removeRow(r.id), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "Fach entfernen" },
                        React.createElement(IconX, { size: 14 }))),
                r.trainerComment && React.createElement("p", { className: "flex items-start gap-1 text-xs text-slate-500 italic pl-0.5" },
                    React.createElement(IconInfo, { size: 12, className: "shrink-0 mt-0.5 text-[#C43E0E]" }),
                    r.trainerComment)))),
            React.createElement("button", { type: "button", onClick: addRow, className: "flex items-center gap-1 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B]" },
                React.createElement(IconPlus, { size: 13 }),
                " Fach hinzufügen"),
            error && React.createElement("p", { className: "text-xs text-red-600" }, error),
            React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center" }, dirty ? "Speichern" : "Gespeichert ✓"));
    }
    return React.createElement("div", { className: `${cardClass} p-4 space-y-3` },
        React.createElement(SectionLabel, null, "Noten-Umfrage"),
        subjects.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Der Spieler hat noch keine Fächer eingetragen.")) : (React.createElement("div", { className: "space-y-1.5" }, subjects.map((s) => React.createElement("div", { key: s.id, className: `rounded-lg px-2.5 py-2 space-y-1.5 ${s.flagged ? "bg-amber-50 border border-amber-200" : "bg-stone-50"}` },
            React.createElement("div", { className: "flex items-center gap-2" },
                React.createElement("input", { className: "flex-1 min-w-0 text-sm bg-transparent border-none p-0 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#C43E0E] rounded", defaultValue: s.name, onBlur: (e) => { if (e.target.value.trim() && e.target.value.trim() !== s.name)
                        onRenameSubject(s.id, e.target.value.trim()); } }),
                React.createElement("span", { className: "text-xs font-bold text-slate-700 shrink-0 w-6 text-center" }, s.reportGrade || "–"),
                React.createElement(GradeChips, { grades: s.examGrades }),
                isTrainer && React.createElement("button", { type: "button", onClick: () => onToggleFlag(s.id), className: `text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 transition ${s.flagged ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-400 border-stone-200 hover:border-amber-300"}` }, "Beobachtung")),
            isTrainer && React.createElement("input", { className: "w-full text-xs bg-white border border-stone-200 rounded-lg px-2 py-1 placeholder:text-slate-400", defaultValue: s.trainerComment || "", onBlur: (e) => { if (e.target.value.trim() !== (s.trainerComment || ""))
                    onSetComment(s.id, e.target.value.trim()); }, placeholder: "Kommentar für den Spieler (z. B. Nachhilfe empfehlen) – sichtbar für den Spieler, nur du kannst ihn schreiben" }))))));
}
function RatingScaleInput({ label, value, onChange }) {
    return React.createElement("div", { className: "space-y-1" },
        React.createElement("div", { className: "flex items-center justify-between" },
            React.createElement("p", { className: "text-sm font-medium text-slate-700" }, label),
            React.createElement("span", { className: "text-sm font-bold text-[#C43E0E] tabular-nums" }, value, "/10")),
        React.createElement("input", { type: "range", min: 1, max: 10, step: 1, value: value, onChange: (e) => onChange(Number(e.target.value)), className: "w-full accent-[#C43E0E]" }));
}
function RequestFeedbackToPlayerForm({ player, team, teamPlayers, pastEvents, onSubmit, onClose }) {
    const [scope, setScope] = useState("player");
    const [eventId, setEventId] = useState(pastEvents[0]?.id || "");
    function submit(e) {
        e.preventDefault();
        const chosenEvent = pastEvents.find((ev) => ev.id === eventId);
        const eventLabel = chosenEvent ? feedbackEventLabel(chosenEvent) : "eurem letzten Training";
        const targetIds = scope === "team" ? teamPlayers.map((p) => p.id) : [player.id];
        onSubmit(targetIds, eventId || null, eventLabel);
        onClose();
    }
    return React.createElement("form", { onSubmit: submit, className: "space-y-4" },
        React.createElement(Field, { label: "An wen?" },
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { type: "button", onClick: () => setScope("player"), className: `flex-1 rounded-lg py-2 text-sm font-semibold border transition ${scope === "player" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-stone-300"}` }, `Nur ${player.name}`),
                React.createElement("button", { type: "button", onClick: () => setScope("team"), className: `flex-1 rounded-lg py-2 text-sm font-semibold border transition ${scope === "team" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-stone-300"}` }, `Ganzes Team${team ? " (" + team.name + ")" : ""}`))),
        React.createElement(Field, { label: "Welches Training/Spiel?" },
            pastEvents.length > 0
                ? React.createElement("select", { className: inputClass, value: eventId, onChange: (e) => setEventId(e.target.value) }, pastEvents.map((e) => React.createElement("option", { key: e.id, value: e.id }, `${fmtDate(e.date)} – ${e.title}`)))
                : React.createElement("p", { className: "text-sm text-slate-400" }, "Keine vergangenen Termine gefunden.")),
        React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center px-4 py-2.5" }, "Anfordern"));
}
function RequestFeedbackToTrainerForm({ pastEvents, onSubmit, onClose }) {
    const [eventId, setEventId] = useState(pastEvents[0]?.id || "");
    const [customQuestions, setCustomQuestions] = useState([""]);
    function updateQuestion(i, value) {
        setCustomQuestions((prev) => prev.map((q, idx) => (idx === i ? value : q)));
    }
    function addQuestion() {
        setCustomQuestions((prev) => [...prev, ""]);
    }
    function removeQuestion(i) {
        setCustomQuestions((prev) => prev.filter((_, idx) => idx !== i));
    }
    function submit(e) {
        e.preventDefault();
        const chosenEvent = pastEvents.find((ev) => ev.id === eventId);
        const eventLabel = chosenEvent ? feedbackEventLabel(chosenEvent) : "eurem letzten Training";
        onSubmit(eventId || null, eventLabel, customQuestions.map((q) => q.trim()).filter(Boolean));
        onClose();
    }
    return React.createElement("form", { onSubmit: submit, className: "space-y-4" },
        React.createElement(Field, { label: "Welches Training/Spiel?" },
            pastEvents.length > 0
                ? React.createElement("select", { className: inputClass, value: eventId, onChange: (e) => setEventId(e.target.value) }, pastEvents.map((e) => React.createElement("option", { key: e.id, value: e.id }, `${fmtDate(e.date)} – ${e.title}`)))
                : React.createElement("p", { className: "text-sm text-slate-400" }, "Keine vergangenen Termine gefunden.")),
        React.createElement(Field, { label: "Eigene Fragen an den Trainer (optional)" },
            React.createElement("div", { className: "space-y-2" },
                customQuestions.map((q, i) => React.createElement("div", { key: i, className: "flex gap-2" },
                    React.createElement("input", { className: inputClass, value: q, onChange: (e) => updateQuestion(i, e.target.value), placeholder: "z. B. Wie war mein Verhalten in der Crunchtime?" }),
                    customQuestions.length > 1 && React.createElement("button", { type: "button", onClick: () => removeQuestion(i), className: "shrink-0 text-slate-400 hover:text-red-500 px-1", "aria-label": "Frage entfernen" }, React.createElement(IconX, { size: 16 })))),
                React.createElement("button", { type: "button", onClick: addQuestion, className: "text-sm font-semibold text-[#C43E0E] hover:text-[#8A2C0A]" }, "+ Weitere Frage"))),
        React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center px-4 py-2.5" }, "Anfordern"));
}
function AnswerTrainerToPlayerForm({ item, questions, onSubmit }) {
    const [selfRating, setSelfRating] = useState(5);
    const [energyRating, setEnergyRating] = useState(5);
    const [message, setMessage] = useState("");
    function submit(e) {
        e.preventDefault();
        onSubmit(item.id, { selfRating, energyRating, messageToCoach: message.trim(), answeredAt: today() });
    }
    return React.createElement("form", { onSubmit: submit, className: `${cardClass} p-4 space-y-3 border border-[#C43E0E]/20` },
        React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, `Feedback zu ${item.eventLabel || "eurem Training"}`),
        React.createElement(RatingScaleInput, { label: questions.selfRatingLabel, value: selfRating, onChange: setSelfRating }),
        React.createElement(RatingScaleInput, { label: questions.energyRatingLabel, value: energyRating, onChange: setEnergyRating }),
        React.createElement("div", null,
            React.createElement("label", { className: labelClass }, questions.messageLabel),
            React.createElement("textarea", { className: inputClass, rows: 2, value: message, onChange: (e) => setMessage(e.target.value) })),
        React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center px-4 py-2.5" }, "Absenden"));
}
function AnswerPlayerToTrainerForm({ item, categories, onSubmit }) {
    const questionsList = item.customQuestions || (item.customQuestion ? [item.customQuestion] : []);
    const [ratings, setRatings] = useState(Object.fromEntries(categories.map((c) => [c.id, 5])));
    const [comment, setComment] = useState("");
    const [customAnswers, setCustomAnswers] = useState(questionsList.map(() => ""));
    function submit(e) {
        e.preventDefault();
        onSubmit(item.id, { ratings, comment: comment.trim(), customAnswers: customAnswers.map((a) => a.trim()), answeredAt: today() });
    }
    return React.createElement("form", { onSubmit: submit, className: `${cardClass} p-4 space-y-3 border border-[#C43E0E]/20` },
        React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, `Feedback-Anfrage zu ${item.eventLabel || "einem Training"}`),
        categories.map((c) => React.createElement(RatingScaleInput, { key: c.id, label: c.label, value: ratings[c.id] ?? 5, onChange: (n) => setRatings((r) => ({ ...r, [c.id]: n })) })),
        questionsList.length > 0 && React.createElement("div", { className: "space-y-3" },
            React.createElement("p", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide" }, questionsList.length > 1 ? "Fragen vom Spieler" : "Frage vom Spieler"),
            questionsList.map((q, i) => React.createElement("div", { key: i },
                React.createElement("p", { className: "text-sm text-slate-700 italic mb-1" }, q),
                React.createElement("textarea", { className: inputClass, rows: 2, value: customAnswers[i] || "", onChange: (e) => setCustomAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a))), placeholder: "Deine Antwort darauf" })))),
        React.createElement("div", null,
            React.createElement("label", { className: labelClass }, "Kommentar (optional)"),
            React.createElement("textarea", { className: inputClass, rows: 2, value: comment, onChange: (e) => setComment(e.target.value) })),
        React.createElement("button", { type: "submit", className: btnPrimaryClass + " w-full justify-center px-4 py-2.5" }, "Absenden"));
}
function FeedbackWaitingRow({ item }) {
    const waitingLabel = item.direction === "trainerToPlayer" ? "Wartet auf Antwort vom Spieler" : "Wartet auf Antwort vom Trainer";
    return React.createElement("div", { className: "flex items-center gap-2.5 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5" },
        React.createElement(IconMessage, { size: 14, className: "text-slate-400 shrink-0" }),
        React.createElement("span", { className: "text-sm text-slate-600 flex-1 truncate" }, item.eventLabel || "Feedback-Anfrage"),
        React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, waitingLabel));
}
function FeedbackHistoryCard({ item, questions, categories, isTrainer, onDelete }) {
    const isToPlayer = item.direction === "trainerToPlayer";
    return React.createElement("div", { className: `${cardClass} p-3.5` },
        React.createElement("div", { className: "flex items-center justify-between gap-2 mb-2" },
            React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, item.eventLabel || (isToPlayer ? "Feedback vom Trainer angefragt" : "Feedback vom Spieler angefragt")),
            React.createElement("div", { className: "flex items-center gap-2 shrink-0" },
                React.createElement("span", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-400" }, isToPlayer ? "Selbsteinschätzung" : "Trainer-Bewertung"),
                isTrainer && onDelete && React.createElement("button", { type: "button", onClick: () => onDelete(item.id, item.direction), className: "text-slate-300 hover:text-red-500", "aria-label": "Löschen" }, React.createElement(IconTrash, { size: 13 })))),
        isToPlayer
            ? React.createElement("div", { className: "space-y-1.5" },
                React.createElement("p", { className: "text-xs text-slate-500" }, `${questions.selfRatingLabel} ${item.answer?.selfRating ?? "–"}/10`),
                React.createElement("p", { className: "text-xs text-slate-500" }, `${questions.energyRatingLabel} ${item.answer?.energyRating ?? "–"}/10`),
                item.answer?.messageToCoach && React.createElement("p", { className: "text-sm text-slate-700 italic mt-1" }, `„${item.answer.messageToCoach}“`))
            : React.createElement("div", { className: "space-y-1.5" },
                React.createElement("div", { className: "flex flex-wrap gap-x-4 gap-y-1" }, categories.filter((c) => item.answer?.ratings?.[c.id] !== undefined).map((c) => React.createElement("span", { key: c.id, className: "text-xs text-slate-500" }, `${c.label}: ${item.answer.ratings[c.id]}/10`))),
                (item.customQuestions || (item.customQuestion ? [item.customQuestion] : [])).map((q, i) => {
                    const answers = item.answer?.customAnswers || (item.answer?.customAnswer ? [item.answer.customAnswer] : []);
                    return React.createElement("p", { key: i, className: "text-xs text-slate-500 italic mt-1" }, `Frage: ${q}${answers[i] ? " → " + answers[i] : ""}`);
                }),
                item.answer?.comment && React.createElement("p", { className: "text-sm text-slate-700 italic mt-1" }, `„${item.answer.comment}“`)));
}
function FeedbackPanel({ isTrainer, isOwnAccount, items, loading, questions, categories, onOpenRequest, onAnswerToPlayer, onAnswerToTrainer, onDelete }) {
    const needsMyAnswer = items.filter((it) => it.status === "pending" && ((isOwnAccount && it.direction === "trainerToPlayer") || (isTrainer && it.direction === "playerToTrainer")));
    const waitingOnOther = items.filter((it) => it.status === "pending" && !needsMyAnswer.includes(it));
    const answered = items.filter((it) => it.status === "answered");
    return React.createElement("div", { className: "space-y-5" },
        (isTrainer || isOwnAccount) && React.createElement("button", { type: "button", onClick: onOpenRequest, className: btnPrimaryClass + " px-4 py-2.5" },
            React.createElement(IconMessage, { size: 15 }),
            isTrainer ? "Feedback anfordern" : "Feedback zu Training/Spiel anfordern"),
        loading && React.createElement("p", { className: "text-sm text-slate-400" }, "Lädt…"),
        needsMyAnswer.length > 0 && React.createElement("div", { className: "space-y-3" },
            React.createElement(SectionLabel, null, "Wartet auf deine Antwort"),
            needsMyAnswer.map((it) => it.direction === "trainerToPlayer"
                ? React.createElement(AnswerTrainerToPlayerForm, { key: it.id, item: it, questions: questions, onSubmit: onAnswerToPlayer })
                : React.createElement(AnswerPlayerToTrainerForm, { key: it.id, item: it, categories: categories, onSubmit: onAnswerToTrainer }))),
        waitingOnOther.length > 0 && React.createElement("div", { className: "space-y-2" },
            React.createElement(SectionLabel, null, "Offen"),
            waitingOnOther.map((it) => React.createElement(FeedbackWaitingRow, { key: it.id, item: it }))),
        React.createElement("div", { className: "space-y-2" },
            answered.length > 0 && React.createElement(SectionLabel, null, "Verlauf"),
            !loading && needsMyAnswer.length === 0 && waitingOnOther.length === 0 && answered.length === 0 && React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch kein Feedback vorhanden."),
            answered.map((it) => React.createElement(FeedbackHistoryCard, { key: it.id, item: it, questions: questions, categories: categories, isTrainer: isTrainer, onDelete: isTrainer ? onDelete : null }))));
}
function FeedbackTemplatesEditor({ questions, categories, onSaveQuestions, onAddCategory, onRenameCategory, onDeleteCategory, onMoveCategory, onClose }) {
    const [selfRatingLabel, setSelfRatingLabel] = useState(questions.selfRatingLabel);
    const [energyRatingLabel, setEnergyRatingLabel] = useState(questions.energyRatingLabel);
    const [messageLabel, setMessageLabel] = useState(questions.messageLabel);
    const [saved, setSaved] = useState(false);
    function saveQuestions(e) {
        e.preventDefault();
        onSaveQuestions({
            selfRatingLabel: selfRatingLabel.trim() || questions.selfRatingLabel,
            energyRatingLabel: energyRatingLabel.trim() || questions.energyRatingLabel,
            messageLabel: messageLabel.trim() || questions.messageLabel,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }
    return React.createElement("div", { className: "space-y-6" },
        React.createElement("form", { onSubmit: saveQuestions, className: "space-y-3" },
            React.createElement(SectionLabel, null, "Trainer → Spieler: Fragen zur Selbsteinschätzung"),
            React.createElement(Field, { label: "Frage 1 (Bewertung 1-10)" },
                React.createElement("input", { className: inputClass, value: selfRatingLabel, onChange: (e) => setSelfRatingLabel(e.target.value) })),
            React.createElement(Field, { label: "Frage 2 (Bewertung 1-10)" },
                React.createElement("input", { className: inputClass, value: energyRatingLabel, onChange: (e) => setEnergyRatingLabel(e.target.value) })),
            React.createElement(Field, { label: "Frage 3 (Freitext, optional für den Spieler)" },
                React.createElement("input", { className: inputClass, value: messageLabel, onChange: (e) => setMessageLabel(e.target.value) })),
            React.createElement("button", { type: "submit", className: btnPrimaryClass + " px-4 py-2 text-sm" }, saved ? "Gespeichert ✓" : "Fragen speichern")),
        React.createElement("div", { className: "border-t border-stone-200 pt-4" },
            React.createElement(SectionLabel, null, "Spieler → Trainer: Bewertungs-Kategorien (je 1-10)"),
            React.createElement("div", { className: "mt-2" },
                React.createElement(SimpleListManager, { items: categories, onAdd: onAddCategory, onRename: onRenameCategory, onDelete: onDeleteCategory, onMove: onMoveCategory, addPlaceholder: "z. B. Kommunikation" }))),
        React.createElement("button", { onClick: onClose, className: btnSecondaryClass + " w-full py-2.5" }, "Fertig"));
}
// Eigene Spieler-Seite (ersetzt die lange Spielerliste in der Seitenleiste):
// Karten-Raster nach Team gruppiert, mit Filtern nach Team, Status und Name.
function PlayersPage({ players, teams, onSelectPlayer, onOpenTeam, onAddPlayer, canAddPlayer }) {
    const [teamFilter, setTeamFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const filtered = players
        .filter((p) => teamFilter === "all" || p.teamId === teamFilter)
        .filter((p) => statusFilter === "all" || (p.status || "aktiv") === statusFilter)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.position || "").toLowerCase().includes(q));
    const groups = [
        ...teams.map((t, i) => ({ team: t, colorIdx: i, players: filtered.filter((p) => p.teamId === t.id) })),
        { team: null, colorIdx: teams.length, players: filtered.filter((p) => !teams.some((t) => t.id === p.teamId)) },
    ].filter((g) => g.players.length > 0)
        .map((g) => ({ ...g, players: [...g.players].sort((a, b) => a.name.localeCompare(b.name)) }));
    const statusCount = (s) => players.filter((p) => (teamFilter === "all" || p.teamId === teamFilter) && (s === "all" || (p.status || "aktiv") === s)).length;
    const chip = (active) => `px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition border ${active ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-stone-200 text-slate-500 hover:text-slate-800 hover:border-stone-300"}`;
    return React.createElement("div", { className: "space-y-5 rsk-fade-in" },
        React.createElement("div", { className: "flex items-center justify-between gap-3 flex-wrap" },
            React.createElement("div", null,
                React.createElement("h2", { className: "font-display text-2xl sm:text-3xl tracking-wide text-slate-900" }, "Spieler"),
                React.createElement("p", { className: "text-sm text-slate-500" }, `${players.length} Spieler in ${teams.length} ${teams.length === 1 ? "Team" : "Teams"}`)),
            canAddPlayer && React.createElement("button", { onClick: onAddPlayer, className: btnPrimaryClass + " text-sm px-3.5 py-2 shrink-0" },
                React.createElement(IconPlus, { size: 15 }),
                " Spieler anlegen")),
        React.createElement("div", { className: "space-y-2.5" },
            React.createElement("div", { className: "relative max-w-md" },
                React.createElement(IconSearch, { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }),
                React.createElement("input", { className: inputClass + " pl-8", placeholder: "Name oder Position…", value: query, onChange: (e) => setQuery(e.target.value) })),
            teams.length > 1 && React.createElement("div", { className: "flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" },
                React.createElement("button", { onClick: () => setTeamFilter("all"), className: chip(teamFilter === "all") }, "Alle Teams"),
                teams.map((t) => React.createElement("button", { key: t.id, onClick: () => setTeamFilter(t.id), className: chip(teamFilter === t.id) }, t.name))),
            React.createElement("div", { className: "flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" },
                [{ value: "all", label: "Alle" }, ...STATUS_OPTIONS].map((s) => React.createElement("button", { key: s.value, onClick: () => setStatusFilter(s.value), className: chip(statusFilter === s.value) + " inline-flex items-center gap-1.5" },
                    s.value !== "all" && React.createElement("span", { className: `w-2 h-2 rounded-full ${STATUS_STYLES[s.value]?.dot || "bg-slate-300"}` }),
                    s.label,
                    React.createElement("span", { className: "tabular-nums opacity-60" }, statusCount(s.value)))))),
        groups.length === 0 && React.createElement("p", { className: "text-sm text-slate-400 text-center py-10" }, players.length === 0 ? "Noch keine Spieler angelegt." : "Keine Spieler für diese Filter."),
        groups.map((g) => React.createElement("section", { key: g.team ? g.team.id : "none" },
            React.createElement("div", { className: "flex items-center gap-2.5 mb-2.5" },
                React.createElement("span", { className: `w-6 h-6 rounded-md bg-gradient-to-br ${TEAM_COLORS[g.colorIdx % TEAM_COLORS.length]} text-white flex items-center justify-center text-[11px] font-black shrink-0` }, ((g.team && g.team.name) || "?").charAt(0).toUpperCase()),
                React.createElement("h3", { className: "text-sm font-bold text-slate-800" }, g.team ? g.team.name : "Ohne Team"),
                React.createElement("span", { className: "text-xs text-slate-400 tabular-nums" }, g.players.length),
                g.team && React.createElement("button", { onClick: () => onOpenTeam(g.team.id), className: "ml-auto text-xs font-semibold text-[#C43E0E] hover:text-[#FF6A2B] shrink-0" }, "Team-Übersicht →")),
            React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3" }, g.players.map((p) => {
                const st = STATUS_STYLES[p.status || "aktiv"];
                const hasNumber = p.number !== "" && p.number !== undefined && p.number !== null;
                return React.createElement("button", { key: p.id, onClick: () => onSelectPlayer(p.id), className: "group bg-white rounded-2xl border border-stone-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3 text-left min-w-0" },
                    p.photoUrl
                        ? React.createElement("img", { src: p.photoUrl, alt: "", className: "w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover shrink-0" })
                        : React.createElement("span", { className: "w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white flex items-center justify-center text-sm font-black shrink-0" }, hasNumber ? p.number : (splitName(p.name).first || p.name).charAt(0).toUpperCase()),
                    React.createElement("span", { className: "min-w-0 flex-1" },
                        React.createElement("span", { className: "block text-sm font-semibold text-slate-900 leading-snug line-clamp-2 [hyphens:auto] break-words group-hover:text-[#C43E0E] transition-colors", title: p.name }, p.name),
                        React.createElement("span", { className: "flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 min-w-0" },
                            React.createElement("span", { className: `w-1.5 h-1.5 rounded-full shrink-0 ${st?.dot || "bg-slate-300"}` }),
                            React.createElement("span", { className: "truncate" }, [hasNumber && p.photoUrl ? "#" + p.number : null, POSITION_ABBR[p.position] || p.position].filter(Boolean).join(" · ") || "–"))));
            })))));
}
function TeamOverviewTable({ team, players, privateData, statCategories, onSelectPlayer }) {
    const normalCat = statCategories.find((c) => c.id === "normal") || statCategories[0];
    const normalFields = normalCat ? normalCat.fields.filter((f) => f.kind !== "shooting") : [];
    function avgFor(playerId, fieldId) {
        const entries = (players.find((p) => p.id === playerId)?.stats) || [];
        if (entries.length === 0)
            return "–";
        const sum = entries.reduce((acc, s) => acc + (Number(s[fieldId]) || 0), 0);
        return fmtNum(sum / entries.length, 1);
    }
    function fgPctFor(playerId) {
        const entries = (players.find((p) => p.id === playerId)?.stats) || [];
        const made = entries.reduce((acc, s) => acc + (Number(s.fg_m) || 0), 0);
        const att = entries.reduce((acc, s) => acc + (Number(s.fg_a) || 0), 0);
        return att ? `${Math.round((made / att) * 1000) / 10}%` : "–";
    }
    function latestAttendance(playerId) {
        const entries = sortByDateDesc((privateData[playerId]?.attendance) || []);
        if (entries.length === 0)
            return "–";
        const a = entries[0];
        return a.einheitenGesamt ? `${Math.round((a.anwesend / a.einheitenGesamt) * 1000) / 10}%` : "–";
    }
    return (React.createElement("div", { className: "rsk-fade-in" },
        React.createElement("div", { className: "mb-5" },
            React.createElement("h2", { className: "text-lg font-bold text-slate-900" }, team?.name || "Team"),
            React.createElement("p", { className: "text-sm text-slate-500" },
                players.length,
                " Spieler \u00B7 Klick auf einen Spieler f\u00FCr die Akte")),
        players.length === 0 ? (React.createElement("div", { className: `${cardClass} flex flex-col items-center justify-center gap-2 py-14 text-center` },
            React.createElement(IconUsers, { size: 28, className: "text-stone-300" }),
            React.createElement("p", { className: "text-sm text-slate-400" }, "Noch keine Spieler in diesem Team."))) : (React.createElement("div", { className: `${cardClass} overflow-x-auto` },
            React.createElement("table", { className: "w-full text-sm" },
                React.createElement("thead", null,
                    React.createElement("tr", { className: "border-b-2 border-[#C43E0E]/20 bg-stone-50/60 text-slate-500 text-xs uppercase tracking-wide" },
                        React.createElement("th", { className: "text-left px-4 py-3" }, "#"),
                        React.createElement("th", { className: "text-left px-4 py-3" }, "Name"),
                        React.createElement("th", { className: "text-left px-4 py-3" }, "Position"),
                        normalFields.map((f) => React.createElement("th", { key: f.id, className: "text-right px-4 py-3" }, f.label)),
                        React.createElement("th", { className: "text-right px-4 py-3" }, "FG%"),
                        React.createElement("th", { className: "text-right px-4 py-3" }, "Anwesenheit"))),
                React.createElement("tbody", null, players.map((p) => (React.createElement("tr", { key: p.id, onClick: () => onSelectPlayer(p.id), className: "border-b border-stone-100 last:border-0 odd:bg-stone-50/40 hover:bg-red-50/60 active:bg-red-50 cursor-pointer transition-colors" },
                    React.createElement("td", { className: "px-4 py-3" },
                        React.createElement("span", { className: "w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center text-xs font-bold" }, p.number !== "" && p.number !== undefined ? p.number : "–")),
                    React.createElement("td", { className: "px-4 py-3 font-medium text-slate-800" }, p.name),
                    React.createElement("td", { className: "px-4 py-3 text-slate-500" }, p.position),
                    normalFields.map((f) => React.createElement("td", { key: f.id, className: "px-4 py-3 text-right" }, avgFor(p.id, f.id))),
                    React.createElement("td", { className: "px-4 py-3 text-right" }, fgPctFor(p.id)),
                    React.createElement("td", { className: "px-4 py-3 text-right" }, latestAttendance(p.id)))))))))));
}
