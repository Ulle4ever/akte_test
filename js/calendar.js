// calendar.js - Kalender, Termine, Trainingsbelastungs-Berechnung (sRPE/ACWR), Anwesenheit, Terminkonflikte, Zugaenge und Advanced-Rechner.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const EVENT_TYPE_STYLES = {
    tt: { label: "Teamtraining (TT)", dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700", border: "border-teal-400" },
    it: { label: "Individualtraining (IT)", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700", border: "border-violet-400" },
    at: { label: "Athletiktraining (AT)", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", border: "border-emerald-400" },
    spiel: { label: "Spiel", dot: "bg-[#C43E0E]", chip: "bg-red-50 text-[#A8350C]", border: "border-[#C43E0E]" },
    // Legacy-Werte - vor der TT/IT/AT-Kategorisierung angelegte Termine behalten
    // diese Werte, damit sie weiter korrekt angezeigt werden. Bei Bearbeitung
    // kann jederzeit auf TT/IT/AT umgestellt werden.
    training: { label: "Training (allgemein, alt)", dot: "bg-slate-400", chip: "bg-stone-100 text-slate-600", border: "border-slate-300" },
    individuell: { label: "Sonstiges (individuell)", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", border: "border-amber-400" },
};
const TRAINING_CATEGORY_KEYS = ["tt", "it", "at"];
function startOfWeekMonday(d) {
    const day = (d.getDay() + 6) % 7;
    const r = new Date(d);
    r.setDate(d.getDate() - day);
    r.setHours(0, 0, 0, 0);
    return r;
}
function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getPlayerVisibleEvents(events, player) {
    if (!player)
        return [];
    return events.filter((e) => {
        const matchesTeam = e.teamId === player.teamId;
        const matchesInvite = (e.includedPlayerIds || []).includes(player.id);
        const isExcluded = matchesTeam && (e.excludedPlayerIds || []).includes(player.id);
        return (matchesTeam && !isExcluded) || matchesInvite;
    });
}
// Trainingsbelastung (sRPE-Methode): Dauer eines Termins in Minuten, falls
// Start-/Endzeit gepflegt sind - sonst null (Aufrufer faellt dann auf den
// Typ-Standardwert zurueck).
function eventDurationMinutes(event) {
    if (!event.time || !event.endTime)
        return null;
    const [h1, m1] = event.time.split(":").map(Number);
    const [h2, m2] = event.endTime.split(":").map(Number);
    if ([h1, m1, h2, m2].some((n) => isNaN(n)))
        return null;
    const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    return mins > 0 ? mins : null;
}
function sessionLoad(entry) {
    return Math.round((Number(entry.rpe) || 0) * (Number(entry.durationMin) || 0));
}
function dailyLoadMap(entries) {
    const map = {};
    (entries || []).forEach((e) => { map[e.date] = (map[e.date] || 0) + sessionLoad(e); });
    return map;
}
// Durchschnitt ueber die letzten "days" Kalendertage bis einschliesslich
// referenceDateIso - Tage ohne Eintrag zaehlen bewusst als 0 (wie im Vorbild-
// Sheet: ein vergessenes Log sieht dadurch wie Unterbelastung aus, das ist
// gewollt, siehe Sheet-Legende).
function avgLoadOverDays(dailyMap, referenceDateIso, days) {
    const end = new Date(referenceDateIso + "T00:00:00");
    let sum = 0;
    for (let i = 0; i < days; i++) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        sum += dailyMap[isoDate(d)] || 0;
    }
    return sum / days;
}
function computeAcwr(entries, referenceDateIso) {
    if (!entries || entries.length === 0)
        return null;
    const firstDate = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
    const daysSinceFirst = Math.round((new Date(referenceDateIso) - new Date(firstDate)) / 86400000) + 1;
    if (daysSinceFirst < ACWR_MIN_HISTORY_DAYS)
        return null;
    const dailyMap = dailyLoadMap(entries);
    const chronic = avgLoadOverDays(dailyMap, referenceDateIso, 28);
    if (!chronic)
        return null;
    const acute = avgLoadOverDays(dailyMap, referenceDateIso, 7);
    return Math.round((acute / chronic) * 100) / 100;
}
function acwrZone(acwr) {
    if (acwr === null || acwr === undefined)
        return { label: "Keine Daten", cls: "bg-stone-100 text-slate-400" };
    if (acwr < ACWR_LOW)
        return { label: "Unterbelastung", cls: "bg-sky-50 text-sky-700" };
    if (acwr <= ACWR_HIGH)
        return { label: "Normal", cls: "bg-emerald-50 text-emerald-700" };
    if (acwr < ACWR_ALARM)
        return { label: "Erhöht", cls: "bg-amber-50 text-amber-700" };
    return { label: "Alarm", cls: "bg-red-50 text-red-600" };
}
// Fuer den Feedback-Loop: die letzten (bereits stattgefundenen) Trainings/Spiele
// eines Spielers zur Auswahl - neueste zuerst, auf eine ueberschaubare Anzahl
// begrenzt.
function recentPastEventsForPlayer(events, player, limit = 15) {
    const todayKey = today();
    return getPlayerVisibleEvents(events, player)
        .filter((e) => e.date && e.date <= todayKey)
        .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
        .slice(0, limit);
}
function feedbackEventLabel(event) {
    if (!event)
        return "";
    return `"${event.title}" am ${fmtDate(event.date)}`;
}
function getPlayerVisibleTeamNotes(teamNotes, player) {
    if (!player)
        return [];
    return teamNotes.filter((n) => {
        const matchesTeamAll = n.teamId === player.teamId && n.sharedWithAll;
        const matchesIndiv = (n.sharedWithPlayerIds || []).includes(player.id);
        return matchesTeamAll || matchesIndiv;
    });
}
function CalendarView({ events, isTrainer, team, teams, teamPlayers, allPlayers, contextLabel, onAdd, onEdit, onDelete, onClearTeam, onClearAll }) {
    const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
    const [selectedDate, setSelectedDate] = useState(null);
    const [editingEvent, setEditingEvent] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [clearAllInput, setClearAllInput] = useState("");
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const gridStart = startOfWeekMonday(monthStart);
    const gridEnd = startOfWeekMonday(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 6));
    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1))
        days.push(new Date(d));
    const eventsByDate = {};
    events.forEach((e) => { (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e); });
    const monthLabel = viewMonth.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const todayIso = isoDate(new Date());
    const selectedEvents = selectedDate ? sortByDateDesc(eventsByDate[selectedDate] || []).reverse() : [];
    function openNewEvent(date) {
        setEditingEvent(null);
        setSelectedDate(date);
        setShowForm(true);
    }
    function openEditEvent(ev) {
        setEditingEvent(ev);
        setShowForm(true);
    }
    const canClear = isTrainer && (onClearTeam || onClearAll);
    const clearLabel = onClearAll ? "Gesamten Kalender löschen" : "Kalender dieses Teams leeren";
    function runClear() {
        if (onClearAll)
            onClearAll();
        else if (onClearTeam && team)
            onClearTeam(team.id);
        setConfirmClear(false);
        setClearAllInput("");
    }
    const clearConfirmRow = React.createElement("div", { className: "flex items-center gap-2 flex-wrap bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3" },
        React.createElement("span", { className: "text-xs text-red-700 font-medium" }, onClearAll ? "Wirklich ALLE Termine aller Teams unwiderruflich löschen?" : "Wirklich alle Termine dieses Teams unwiderruflich löschen?"),
        onClearAll && React.createElement("input", { className: "text-xs border border-red-300 rounded px-2 py-1 w-36", placeholder: "LÖSCHEN eingeben", value: clearAllInput, onChange: (e) => setClearAllInput(e.target.value) }),
        React.createElement("button", { type: "button", onClick: runClear, disabled: !!onClearAll && clearAllInput !== "LÖSCHEN", className: "text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5" }, "Ja, löschen"),
        React.createElement("button", { type: "button", onClick: () => { setConfirmClear(false); setClearAllInput(""); }, className: "text-xs font-medium text-slate-500 hover:text-slate-800" }, "Abbrechen"));
    const clearTriggerButton = React.createElement("button", { type: "button", onClick: () => setConfirmClear(true), className: "flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-600 mb-3" },
        React.createElement(IconTrash, { size: 13 }),
        clearLabel);
    const clearSection = canClear ? (confirmClear ? clearConfirmRow : clearTriggerButton) : null;
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4 sm:p-5" },
            clearSection,
            React.createElement("div", { className: "flex items-center justify-between mb-3" },
                React.createElement("button", { onClick: () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)), className: "p-1.5 rounded-lg hover:bg-stone-100 text-slate-500" },
                    React.createElement(IconArrowLeft, { size: 16 })),
                React.createElement("p", { className: "text-sm font-semibold text-slate-800 capitalize" },
                    monthLabel,
                    contextLabel ? ` · ${contextLabel}` : ""),
                React.createElement("button", { onClick: () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)), className: "p-1.5 rounded-lg hover:bg-stone-100 text-slate-500" },
                    React.createElement(IconArrowLeft, { size: 16, className: "rotate-180" }))),
            React.createElement("div", { className: "grid grid-cols-7 gap-1.5 mb-1" }, ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (React.createElement("div", { key: d, className: "text-center text-[10px] font-semibold text-slate-400 uppercase py-1" }, d)))),
            React.createElement("div", { className: "grid grid-cols-7 gap-1.5" }, days.map((d) => {
                const iso = isoDate(d);
                const inMonth = d.getMonth() === viewMonth.getMonth();
                const dayEvents = eventsByDate[iso] || [];
                return (React.createElement("button", { key: iso, onClick: () => setSelectedDate(iso), className: `text-left rounded-lg p-2 min-h-[64px] border transition ${selectedDate === iso ? "border-[#C43E0E] bg-red-50" : "border-transparent hover:bg-stone-50"} ${!inMonth ? "opacity-30" : ""}` },
                    React.createElement("span", { className: `text-xs ${iso === todayIso ? "font-bold text-[#C43E0E]" : "text-slate-600"}` }, d.getDate()),
                    React.createElement("div", { className: "mt-1 space-y-0.5" },
                        dayEvents.slice(0, 2).map((e) => (React.createElement("div", { key: e.id, className: `flex items-center gap-1 text-[11px] font-semibold px-1 py-0.5 rounded truncate border-l-2 ${EVENT_TYPE_STYLES[e.type]?.chip || "bg-stone-100 text-slate-600"} ${EVENT_TYPE_STYLES[e.type]?.border || "border-slate-300"}` },
                            e.time && React.createElement("span", { className: "opacity-70 font-normal shrink-0" }, e.time),
                            React.createElement("span", { className: "truncate" }, e.title)))),
                        dayEvents.length > 2 && React.createElement("div", { className: "text-[10px] font-medium text-slate-400 px-1" },
                            "+",
                            dayEvents.length - 2,
                            " mehr"))));
            }))),
        selectedDate && (React.createElement("div", { className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4 sm:p-5" },
            React.createElement("div", { className: "flex items-center justify-between mb-4" },
                React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, fmtDate(selectedDate)),
                isTrainer && (React.createElement("button", { onClick: () => openNewEvent(selectedDate), className: "flex items-center gap-1 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" },
                    React.createElement(IconPlus, { size: 13 }),
                    " Termin"))),
            selectedEvents.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-3" }, "Keine Termine an diesem Tag.")) : (React.createElement("div", { className: "space-y-2.5" }, selectedEvents.map((e) => (React.createElement("div", { key: e.id, className: "flex items-center gap-3 bg-stone-50 rounded-xl p-3.5" },
                React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[e.type]?.dot || "bg-slate-400"}` }),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, e.title),
                    React.createElement("p", { className: "text-xs text-slate-500" }, [e.time, e.location].filter(Boolean).join(" · ") || EVENT_TYPE_STYLES[e.type]?.label)),
                isTrainer && (React.createElement("div", { className: "flex items-center gap-2 shrink-0" },
                    React.createElement("button", { onClick: () => openEditEvent(e), className: "text-slate-300 hover:text-[#C43E0E]", "aria-label": "Bearbeiten" },
                        React.createElement(IconEdit, { size: 14 })),
                    React.createElement("button", { onClick: () => onDelete(e.id), className: "text-slate-300 hover:text-red-500", "aria-label": "L\u00F6schen" },
                        React.createElement(IconTrash, { size: 14 }))))))))))),
        showForm && (React.createElement(Modal, { title: editingEvent ? "Termin bearbeiten" : "Termin anlegen", onClose: () => setShowForm(false), wide: true },
            React.createElement(EventForm, { initialEvent: editingEvent, defaultDate: selectedDate, defaultTeamId: team?.id, teams: teams || (team ? [team] : []), allPlayers: allPlayers, onSubmit: (vals) => { editingEvent ? onEdit(editingEvent.id, vals) : onAdd(vals); setShowForm(false); }, onClose: () => setShowForm(false) })))));
}
function EventForm({ initialEvent, defaultDate, defaultTeamId, teams, allPlayers, onSubmit, onClose }) {
    const [title, setTitle] = useState(initialEvent?.title || "");
    const [date, setDate] = useState(initialEvent?.date || defaultDate || today());
    const [time, setTime] = useState(initialEvent?.time || "");
    const [endTime, setEndTime] = useState(initialEvent?.endTime || "");
    const [location, setLocation] = useState(initialEvent?.location || "");
    const [type, setType] = useState(initialEvent?.type || "tt");
    const [selectedTeamId, setSelectedTeamId] = useState(initialEvent?.teamId || defaultTeamId || "");
    const [isTeamEvent, setIsTeamEvent] = useState(initialEvent ? !!initialEvent.teamId : true);
    const [excludedPlayerIds, setExcludedPlayerIds] = useState(initialEvent?.excludedPlayerIds || []);
    const [includedPlayerIds, setIncludedPlayerIds] = useState(initialEvent?.includedPlayerIds || []);
    const [showExceptions, setShowExceptions] = useState(false);
    const [repeatWeekly, setRepeatWeekly] = useState(false);
    const [repeatUntil, setRepeatUntil] = useState("");
    const [error, setError] = useState("");
    const team = teams.find((t) => t.id === selectedTeamId) || null;
    const teamPlayers = (allPlayers || []).filter((p) => p.teamId === selectedTeamId);
    const otherPlayers = (allPlayers || []).filter((p) => p.teamId !== selectedTeamId);
    function toggleId(list, setList, id) {
        setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    }
    function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim()) {
            setError("Bitte einen Titel angeben.");
            return;
        }
        if (!date) {
            setError("Bitte ein Datum angeben.");
            return;
        }
        if (isTeamEvent && !selectedTeamId) {
            setError("Bitte ein Team auswählen.");
            return;
        }
        if (!isTeamEvent && includedPlayerIds.length === 0) {
            setError("Bitte mindestens einen Spieler auswählen.");
            return;
        }
        if (repeatWeekly && !repeatUntil) {
            setError("Bitte ein Enddatum für die Wiederholung angeben.");
            return;
        }
        if (repeatWeekly && repeatUntil < date) {
            setError("Das Enddatum muss nach dem Startdatum liegen.");
            return;
        }
        if (endTime && time && endTime <= time) {
            setError("Die Endzeit muss nach der Startzeit liegen.");
            return;
        }
        onSubmit({
            title: title.trim(), date, time, endTime, location, type,
            teamId: isTeamEvent ? selectedTeamId : null,
            excludedPlayerIds: isTeamEvent ? excludedPlayerIds : [],
            includedPlayerIds,
            repeatUntil: repeatWeekly ? repeatUntil : null,
        });
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Titel" },
                React.createElement("input", { className: inputClass, value: title, onChange: (e) => { setTitle(e.target.value); setError(""); }, placeholder: "z. B. Training" })),
            React.createElement(Field, { label: "Art" },
                React.createElement("select", { className: inputClass, value: type, onChange: (e) => setType(e.target.value) }, Object.entries(EVENT_TYPE_STYLES).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.label))))),
        React.createElement("div", { className: "grid grid-cols-4 gap-3" },
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement(Field, { label: "Start (optional)" },
                React.createElement("input", { type: "time", className: inputClass, value: time, onChange: (e) => { setTime(e.target.value); setError(""); } })),
            React.createElement(Field, { label: "Ende (optional)" },
                React.createElement("input", { type: "time", className: inputClass, value: endTime, onChange: (e) => { setEndTime(e.target.value); setError(""); } })),
            React.createElement(Field, { label: "Ort (optional)" },
                React.createElement("input", { className: inputClass, value: location, onChange: (e) => setLocation(e.target.value), placeholder: "z. B. Sporthalle 1" }))),
        !initialEvent && (React.createElement("div", { className: "bg-stone-50 rounded-xl p-3 space-y-2" },
            React.createElement("label", { className: "flex items-center gap-2 text-sm font-medium text-slate-700" },
                React.createElement("input", { type: "checkbox", className: "rounded", checked: repeatWeekly, onChange: (e) => setRepeatWeekly(e.target.checked) }),
                "W\u00F6chentlich wiederholen (legt f\u00FCr jede Woche einen eigenen, einzeln anpassbaren Termin an)"),
            repeatWeekly && (React.createElement(Field, { label: "Wiederholen bis einschlie\u00DFlich" },
                React.createElement("input", { type: "date", className: inputClass, value: repeatUntil, onChange: (e) => { setRepeatUntil(e.target.value); setError(""); }, min: date }))))),
        React.createElement("div", { className: "flex items-center gap-2" },
            React.createElement("input", { type: "checkbox", id: "isTeamEvent", checked: isTeamEvent, onChange: (e) => setIsTeamEvent(e.target.checked), className: "rounded" }),
            React.createElement("label", { htmlFor: "isTeamEvent", className: "text-sm text-slate-700" }, "F\u00FCr ein ganzes Team (statt nur einzelne Spieler)")),
        isTeamEvent && (React.createElement(Field, { label: "Team" },
            React.createElement("select", { className: inputClass, value: selectedTeamId, onChange: (e) => { setSelectedTeamId(e.target.value); setExcludedPlayerIds([]); setError(""); } },
                React.createElement("option", { value: "" }, "\u2013 ausw\u00E4hlen \u2013"),
                teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name))))),
        isTeamEvent && team ? (React.createElement("div", null,
            React.createElement("button", { type: "button", onClick: () => setShowExceptions((v) => !v), className: "text-xs font-medium text-[#C43E0E] hover:underline" }, showExceptions ? "Ausnahmen ausblenden" : "Ausnahmen bearbeiten (Spieler aus-/einblenden)"),
            showExceptions && (React.createElement("div", { className: "grid grid-cols-2 gap-3 mt-2" },
                React.createElement("div", { className: "bg-stone-50 rounded-xl p-3" },
                    React.createElement("p", { className: "text-xs font-semibold text-slate-500 mb-2" },
                        "Nicht sichtbar f\u00FCr (aus ",
                        team.name,
                        ")"),
                    React.createElement("div", { className: "space-y-1 max-h-32 overflow-y-auto" }, (teamPlayers || []).map((p) => (React.createElement("label", { key: p.id, className: "flex items-center gap-2 text-sm text-slate-700" },
                        React.createElement("input", { type: "checkbox", className: "rounded", checked: excludedPlayerIds.includes(p.id), onChange: () => toggleId(excludedPlayerIds, setExcludedPlayerIds, p.id) }),
                        p.name))))),
                React.createElement("div", { className: "bg-stone-50 rounded-xl p-3" },
                    React.createElement("p", { className: "text-xs font-semibold text-slate-500 mb-2" }, "Zus\u00E4tzlich sichtbar f\u00FCr (andere Teams)"),
                    React.createElement("div", { className: "space-y-1 max-h-32 overflow-y-auto" }, otherPlayers.map((p) => (React.createElement("label", { key: p.id, className: "flex items-center gap-2 text-sm text-slate-700" },
                        React.createElement("input", { type: "checkbox", className: "rounded", checked: includedPlayerIds.includes(p.id), onChange: () => toggleId(includedPlayerIds, setIncludedPlayerIds, p.id) }),
                        p.name))))))))) : (!isTeamEvent && (React.createElement("div", { className: "bg-stone-50 rounded-xl p-3" },
            React.createElement("p", { className: "text-xs font-semibold text-slate-500 mb-2" }, "Sichtbar f\u00FCr"),
            React.createElement("div", { className: "space-y-1 max-h-40 overflow-y-auto" }, (allPlayers || []).map((p) => (React.createElement("label", { key: p.id, className: "flex items-center gap-2 text-sm text-slate-700" },
                React.createElement("input", { type: "checkbox", className: "rounded", checked: includedPlayerIds.includes(p.id), onChange: () => toggleId(includedPlayerIds, setIncludedPlayerIds, p.id) }),
                p.name))))))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", className: "w-full bg-[#C43E0E] hover:bg-[#A8350C] text-white rounded-lg py-2.5 text-sm font-semibold transition" }, initialEvent ? "Änderungen speichern" : "Termin anlegen")));
}
function getEventAttendees(event, allPlayers) {
    const matchesTeam = (p) => !!event.teamId && event.teamId === p.teamId;
    const isExcluded = (p) => matchesTeam(p) && (event.excludedPlayerIds || []).includes(p.id);
    const isInvited = (p) => (event.includedPlayerIds || []).includes(p.id);
    return (allPlayers || []).filter((p) => (matchesTeam(p) && !isExcluded(p)) || isInvited(p));
}
/* Welche Teams ein Termin betrifft: das eigene Team plus die Teams aller einzeln
   eingeladenen Spieler (falls die aus einem anderen Team kommen). Wird auf jedem
   Termin mitgespeichert (involvedTeamIds), damit team-beschraenkte Trainer-Zugaenge
   ihre Termine per einfacher Firestore-Query/-Regel finden koennen - inkl. der
   Faelle, in denen einer ihrer Spieler nur einzeln bei einem anderen Team mitmacht. */
function computeInvolvedTeamIds(teamId, includedPlayerIds, allPlayers) {
    const ids = new Set();
    if (teamId)
        ids.add(teamId);
    (includedPlayerIds || []).forEach((pid) => {
        const p = (allPlayers || []).find((pl) => pl.id === pid);
        if (p && p.teamId)
            ids.add(p.teamId);
    });
    return Array.from(ids);
}
/* Anwesenheits-Markierung eines Spielers bei einem Termin: {status: "present"|"absent"|"injured"|null, reason}.
   Aeltere Eintraege (vor dem Grund-Feld) waren nur ein reiner String ("present"/"absent") -
   die werden hier transparent mitgelesen, damit nichts verloren geht. */
function attendanceMark(eventAttendance, eventId, playerId) {
    const raw = eventAttendance?.[eventId]?.[playerId];
    if (!raw)
        return { status: null, reason: "" };
    if (typeof raw === "string")
        return { status: raw, reason: "" };
    return { status: raw.status || null, reason: raw.reason || "" };
}
const ATTENDANCE_STATUS_META = {
    present: { label: "Anwesend", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
    absent: { label: "Abwesend", dot: "bg-red-500", badge: "bg-red-50 text-red-600" },
    injured: { label: "Verletzt", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
};
function attendanceStatusBadge(status) {
    const meta = ATTENDANCE_STATUS_META[status];
    if (!meta)
        return React.createElement("span", { className: "text-xs text-slate-400" }, "Offen");
    return React.createElement("span", { className: `text-xs font-semibold rounded-full px-2 py-0.5 ${meta.badge}` }, meta.label);
}
/* Anwesenheits-Quote: nur "Anwesend" vs. "Abwesend" zaehlen (klassische Quote).
   "Verletzt" zaehlt bewusst NICHT mit rein - ein verpasster Termin wegen
   Verletzung ist keine Holschuld des Spielers und soll die Quote nicht verschlechtern. */
function attendanceQuote(present, absent) {
    const decided = present + absent;
    return decided > 0 ? Math.round((present / decided) * 1000) / 10 : null;
}
/* Schnell-Markieren: ein Klick setzt alle noch UNMARKIERTEN Spieler eines Termins
   auf "Anwesend" - bereits gesetzte Status (z.B. eine Abwesenheit) werden nicht
   angetastet. Danach muss der Trainer nur noch die Ausnahmen umstellen, statt
   jeden Spieler einzeln anzuklicken. */
function markAllPresent(event, attendees, eventAttendance, onSetAttendance) {
    attendees.forEach((p) => {
        if (!attendanceMark(eventAttendance, event.id, p.id).status)
            onSetAttendance(event.id, p.id, "present", "");
    });
}
/* Gemeinsame Zeile fuer die Anwesenheits-Markierung eines Spielers - genutzt in
   "Alle Einheiten" und "Anwesenheit", damit beide gleich aussehen und sich gleich
   bedienen lassen. Drei Buttons statt Durchklicken: direkt "Anwesend"/"Abwesend"/
   "Verletzt" waehlen, nochmal auf den aktiven Button klicken setzt zurueck auf offen.
   Bei "Abwesend" oder "Verletzt" erscheint ein Freitextfeld fuer Grund/Info. */
function AttendanceRow({ player, mark, onSet, subtitle, trailing }) {
    const status = mark.status;
    function setStatus(next) {
        const newStatus = status === next ? null : next;
        onSet(newStatus, newStatus === "absent" || newStatus === "injured" ? mark.reason : "");
    }
    const COLOR_CLASSES = {
        present: "bg-emerald-500 border-emerald-500 text-white",
        absent: "bg-red-500 border-red-500 text-white",
        injured: "bg-amber-500 border-amber-500 text-white",
    };
    const HOVER_CLASSES = {
        present: "hover:border-emerald-400 hover:text-emerald-600",
        absent: "hover:border-red-400 hover:text-red-600",
        injured: "hover:border-amber-400 hover:text-amber-600",
    };
    function statusBtn(value, label) {
        const active = status === value;
        return React.createElement("button", {
            type: "button",
            onClick: () => setStatus(value),
            className: `text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition ${active ? COLOR_CLASSES[value] : "bg-white border-stone-300 text-slate-500 " + HOVER_CLASSES[value]}`,
        }, label);
    }
    return React.createElement("div", { className: "py-2" },
        React.createElement("div", { className: "flex items-center gap-2" },
            React.createElement("div", { className: "min-w-0 flex-1" },
                React.createElement("p", { className: "text-sm text-slate-700 truncate" }, player.name),
                subtitle || null),
            React.createElement("div", { className: "flex items-center gap-1.5 shrink-0" },
                statusBtn("present", "Anwesend"),
                statusBtn("absent", "Abwesend"),
                statusBtn("injured", "Verletzt")),
            trailing || null),
        (status === "absent" || status === "injured") && React.createElement("input", {
            type: "text",
            value: mark.reason || "",
            onChange: (e) => onSet(status, e.target.value),
            placeholder: status === "injured" ? "Info (optional, z. B. Knöchel, bis wann)" : "Grund (optional, z. B. krank, Schule)",
            className: "mt-1.5 w-full text-xs rounded-lg border border-stone-300 px-2.5 py-1.5",
        }));
}
/* Anwesenheit-Tab in der Spieler-Akte: nicht dauerhaft alle Termine auflisten,
   sondern nach Kalenderwoche gruppiert und einklappbar - nur die neueste Woche
   ist standardmaessig offen. */
function PlayerAttendanceTab({ rows }) {
    const groups = {};
    rows.forEach((r) => { const key = isoWeekKey(r.event.date); (groups[key] = groups[key] || []).push(r); });
    const weekKeys = Object.keys(groups).sort().reverse();
    // Beim ersten Rendern ist nur die neueste Woche aufgeklappt (lazy initializer,
    // laeuft nur einmal beim Mounten - so bleibt der Rest kompakt eingeklappt).
    const [expandedWeeks, setExpandedWeeks] = useState(() => new Set(weekKeys.slice(0, 1)));
    function toggleWeek(key) {
        setExpandedWeeks((prev) => {
            const next = new Set(prev);
            if (next.has(key))
                next.delete(key);
            else
                next.add(key);
            return next;
        });
    }
    if (weekKeys.length === 0) {
        return React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Noch keine Termine markiert. Unter \"Anwesenheit\" bzw. \"Alle Einheiten\" lässt sich pro Termin Anwesend/Abwesend/Verletzt eintragen.");
    }
    const weekBlocks = weekKeys.map((key) => {
        const groupRows = groups[key];
        const present = groupRows.filter((r) => r.mark.status === "present").length;
        const absent = groupRows.filter((r) => r.mark.status === "absent").length;
        const injured = groupRows.filter((r) => r.mark.status === "injured").length;
        const quote = attendanceQuote(present, absent);
        const [year, weekNum] = key.split("-W").map(Number);
        const monday = mondayOfIsoWeek(year, weekNum);
        const isExpanded = expandedWeeks.has(key);
        const header = React.createElement("button", { type: "button", onClick: () => toggleWeek(key), className: "w-full flex items-center justify-between gap-3 px-4 py-3 text-left" },
            React.createElement("div", { className: "flex items-center gap-2.5" },
                React.createElement(IconArrowDown, { size: 12, className: `text-slate-300 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}` }),
                React.createElement("span", { className: "text-sm font-semibold text-slate-800" }, "KW ", weekNum),
                React.createElement("span", { className: "text-xs text-slate-400" }, formatWeekRange(monday))),
            React.createElement("div", { className: "flex items-center gap-2" },
                React.createElement("span", { className: "text-xs text-slate-400" }, groupRows.length, groupRows.length === 1 ? " Termin" : " Termine"),
                quote !== null && React.createElement("span", { className: `text-xs font-semibold rounded-full px-2 py-0.5 ${quote < ATTENDANCE_WARN_THRESHOLD ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}` }, quote, "%")));
        const body = isExpanded ? React.createElement("div", { className: "border-t border-stone-100 divide-y divide-stone-100" }, groupRows.map(({ event, mark }) => React.createElement("div", { key: event.id, className: "flex items-center justify-between gap-3 px-4 py-2.5" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement("p", { className: "text-sm text-slate-700 truncate" }, event.title),
                React.createElement("p", { className: "text-xs text-slate-400" }, fmtDate(event.date)),
                mark.reason && React.createElement("p", { className: `text-sm font-medium mt-0.5 ${mark.status === "injured" ? "text-amber-700" : "text-red-600"}` }, mark.reason)),
            attendanceStatusBadge(mark.status)))) : null;
        return React.createElement("div", { key: key, className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden" }, header, body);
    });
    return React.createElement("div", { className: "space-y-2.5" }, weekBlocks);
}
function timeToMinutes(t) {
    if (!t)
        return null;
    const parts = t.split(":");
    const h = Number(parts[0]), m = Number(parts[1]);
    if (Number.isNaN(h) || Number.isNaN(m))
        return null;
    return h * 60 + m;
}
function eventsOverlapMinutes(a, b) {
    const aStart = timeToMinutes(a.time), aEnd = timeToMinutes(a.endTime);
    const bStart = timeToMinutes(b.time), bEnd = timeToMinutes(b.endTime);
    if (aStart == null || aEnd == null || bStart == null || bEnd == null)
        return 0;
    const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
    return overlap > 0 ? overlap : 0;
}
function findScheduleConflicts(events, allPlayers, minOverlapMinutes) {
    const conflicts = [];
    (allPlayers || []).forEach((player) => {
        const playerEvents = getPlayerVisibleEvents(events, player).filter((e) => e.time && e.endTime);
        const byDate = {};
        playerEvents.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
        Object.values(byDate).forEach((dayEvents) => {
            for (let i = 0; i < dayEvents.length; i++) {
                for (let j = i + 1; j < dayEvents.length; j++) {
                    const overlap = eventsOverlapMinutes(dayEvents[i], dayEvents[j]);
                    if (overlap >= minOverlapMinutes) {
                        conflicts.push({ player, eventA: dayEvents[i], eventB: dayEvents[j], overlapMinutes: overlap });
                    }
                }
            }
        });
    });
    return conflicts;
}
function pickMovableEvent(eventA, eventB, allPlayers) {
    // Eine IT-Einheit (Individualtraining) lässt sich am ehesten tauschen, da es
    // davon meist mehrere parallele Gruppen gibt. Sind beide oder keine IT, wird
    // die Einheit mit weniger Teilnehmern als "beweglicher" angenommen.
    if (eventA.type === "it" && eventB.type !== "it")
        return eventA;
    if (eventB.type === "it" && eventA.type !== "it")
        return eventB;
    const countA = getEventAttendees(eventA, allPlayers).length;
    const countB = getEventAttendees(eventB, allPlayers).length;
    return countA <= countB ? eventA : eventB;
}
function alternativesFor(movable, fixed, player, events, minOverlapMinutes) {
    const otherEvents = getPlayerVisibleEvents(events, player).filter((e) => e.id !== movable.id && e.date === movable.date && e.time && e.endTime);
    const candidates = events.filter((e) => e.id !== movable.id && e.id !== fixed.id && e.type === movable.type && e.date === movable.date && e.time && e.endTime && getEventAttendees(e, [player]).length === 0);
    return candidates.filter((cand) => otherEvents.every((oe) => eventsOverlapMinutes(cand, oe) < minOverlapMinutes));
}
function findConflictAlternatives(conflict, events, allPlayers, minOverlapMinutes) {
    const { player, eventA, eventB } = conflict;
    const preferred = pickMovableEvent(eventA, eventB, allPlayers);
    const other = preferred === eventA ? eventB : eventA;
    // Erst die bevorzugte Seite (z.B. die IT-Einheit) prüfen - findet sich dort
    // keine überschneidungsfreie Alternative, stattdessen die andere Seite
    // versuchen, bevor aufgegeben wird.
    const preferredAlternatives = alternativesFor(preferred, other, player, events, minOverlapMinutes);
    if (preferredAlternatives.length > 0)
        return { movable: preferred, fixed: other, alternatives: preferredAlternatives };
    const otherAlternatives = alternativesFor(other, preferred, player, events, minOverlapMinutes);
    if (otherAlternatives.length > 0)
        return { movable: other, fixed: preferred, alternatives: otherAlternatives };
    return { movable: preferred, fixed: other, alternatives: [] };
}
function groupConflictsByEventPair(conflicts) {
    const map = new Map();
    conflicts.forEach((c) => {
        const key = [c.eventA.id, c.eventB.id].sort().join("|");
        if (!map.has(key))
            map.set(key, { eventA: c.eventA, eventB: c.eventB, overlapMinutes: c.overlapMinutes, players: [] });
        map.get(key).players.push(c.player);
    });
    return Array.from(map.values());
}
const CONFLICT_MIN_OVERLAP_MINUTES = 10;
function AllUnitsView({ events, teams, allPlayers, onEdit, onDelete, onAdd, eventAttendance, onSetAttendance }) {
    const [teamFilter, setTeamFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [rangeMode, setRangeMode] = useState("week");
    const [showForm, setShowForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [addPickerFor, setAddPickerFor] = useState(null);
    const [pickerPlayerId, setPickerPlayerId] = useState("");
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    function toggleExpanded(id) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    const todayIso = isoDate(new Date());
    const thisMonday = startOfWeekMonday(new Date());
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 6);
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    let rangeStart = null, rangeEnd = null;
    if (rangeMode === "week") {
        rangeStart = isoDate(thisMonday);
        rangeEnd = isoDate(thisSunday);
    }
    else if (rangeMode === "nextWeek") {
        rangeStart = isoDate(nextMonday);
        rangeEnd = isoDate(nextSunday);
    }
    else if (rangeMode === "upcoming") {
        rangeStart = todayIso;
        rangeEnd = null;
    }
    function inRange(e) {
        return (!rangeStart || e.date >= rangeStart) && (!rangeEnd || e.date <= rangeEnd);
    }
    function teamOfEvent(e) {
        return teams.find((t) => t.id === e.teamId) || null;
    }
    function eventMatchesTeamFilter(e) {
        if (teamFilter === "all")
            return true;
        if (e.teamId === teamFilter)
            return true;
        return getEventAttendees(e, allPlayers).some((p) => p.teamId === teamFilter);
    }
    const rangedEvents = events.filter(inRange);
    const filteredEvents = rangedEvents
        .filter((e) => typeFilter === "all" || e.type === typeFilter)
        .filter(eventMatchesTeamFilter)
        .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    const byDate = {};
    filteredEvents.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const dateKeys = Object.keys(byDate).sort();
    const conflicts = findScheduleConflicts(rangedEvents, allPlayers, CONFLICT_MIN_OVERLAP_MINUTES);
    const conflictGroups = groupConflictsByEventPair(conflicts);
    function openNew() {
        setEditingEvent(null);
        setShowForm(true);
    }
    function openEdit(e) {
        setEditingEvent(e);
        setShowForm(true);
    }
    function toggleTeamPlayerExcluded(event, playerId) {
        const cur = event.excludedPlayerIds || [];
        const next = cur.includes(playerId) ? cur.filter((x) => x !== playerId) : [...cur, playerId];
        onEdit(event.id, { excludedPlayerIds: next });
    }
    function removeIncludedPlayer(event, playerId) {
        const next = (event.includedPlayerIds || []).filter((x) => x !== playerId);
        onEdit(event.id, { includedPlayerIds: next });
    }
    function addIncludedPlayer(event, playerId) {
        if (!playerId)
            return;
        const cur = event.includedPlayerIds || [];
        if (cur.includes(playerId))
            return;
        onEdit(event.id, { includedPlayerIds: [...cur, playerId] });
        setAddPickerFor(null);
        setPickerPlayerId("");
    }
    function movePlayerToAlternative(player, fromEvent, toEvent) {
        if (fromEvent.teamId === player.teamId) {
            onEdit(fromEvent.id, { excludedPlayerIds: [...(fromEvent.excludedPlayerIds || []), player.id] });
        }
        else {
            onEdit(fromEvent.id, { includedPlayerIds: (fromEvent.includedPlayerIds || []).filter((id) => id !== player.id) });
        }
        if (toEvent.teamId === player.teamId) {
            const nextExcluded = (toEvent.excludedPlayerIds || []).filter((id) => id !== player.id);
            onEdit(toEvent.id, { excludedPlayerIds: nextExcluded });
        }
        else {
            const cur = toEvent.includedPlayerIds || [];
            if (!cur.includes(player.id))
                onEdit(toEvent.id, { includedPlayerIds: [...cur, player.id] });
        }
    }
    const filterBar = React.createElement("div", { className: "flex flex-wrap items-center gap-2" },
        React.createElement("select", { className: "text-sm rounded-lg border border-stone-300 px-2.5 py-2", value: teamFilter, onChange: (e) => setTeamFilter(e.target.value) },
            React.createElement("option", { value: "all" }, "Alle Teams"),
            teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name))),
        React.createElement("select", { className: "text-sm rounded-lg border border-stone-300 px-2.5 py-2", value: typeFilter, onChange: (e) => setTypeFilter(e.target.value) },
            React.createElement("option", { value: "all" }, "Alle Arten"),
            Object.entries(EVENT_TYPE_STYLES).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.label))),
        React.createElement("select", { className: "text-sm rounded-lg border border-stone-300 px-2.5 py-2", value: rangeMode, onChange: (e) => setRangeMode(e.target.value) },
            React.createElement("option", { value: "week" }, "Diese Woche"),
            React.createElement("option", { value: "nextWeek" }, "Nächste Woche"),
            React.createElement("option", { value: "upcoming" }, "Alle kommenden"),
            React.createElement("option", { value: "all" }, "Alle (inkl. vergangene)")),
        React.createElement("button", { onClick: openNew, className: "ml-auto flex items-center gap-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg px-3 py-2 hover:bg-slate-800" },
            React.createElement(IconPlus, { size: 14 }),
            " Einheit anlegen"));
    function rosterRow(event, player, kind) {
        const isExcludedChip = kind === "team" && (event.excludedPlayerIds || []).includes(player.id);
        const toggleTitle = kind === "team" ? "Für diese Einheit ausschließen" : "Aus dieser Einheit entfernen";
        const onToggle = kind === "team" ? () => toggleTeamPlayerExcluded(event, player.id) : () => removeIncludedPlayer(event, player.id);
        if (isExcludedChip) {
            return React.createElement("div", { key: player.id, className: "flex items-center gap-2 py-2" },
                React.createElement("p", { className: "text-sm text-slate-400 line-through flex-1 truncate" }, player.name),
                React.createElement("button", { type: "button", onClick: onToggle, className: "text-xs font-medium text-slate-500 hover:text-slate-800 shrink-0" }, "Wieder einschließen"));
        }
        const mark = attendanceMark(eventAttendance, event.id, player.id);
        const removeBtn = React.createElement("button", { type: "button", onClick: onToggle, title: toggleTitle, className: "shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" },
            React.createElement(IconX, { size: 13 }));
        return React.createElement("div", { key: player.id },
            React.createElement(AttendanceRow, {
                player,
                mark,
                onSet: (status, reason) => onSetAttendance(event.id, player.id, status, reason),
                subtitle: kind === "extra" ? React.createElement("span", { className: "text-[11px] text-sky-600" }, "Einzeln eingeladen") : null,
                trailing: removeBtn,
            }));
    }
    function eventRow(event) {
        const team = teamOfEvent(event);
        const isExpanded = expandedIds.has(event.id);
        const teamPlayers = team ? allPlayers.filter((p) => p.teamId === team.id) : [];
        const extraPlayers = allPlayers.filter((p) => (event.includedPlayerIds || []).includes(p.id) && p.teamId !== team?.id);
        const attendees = getEventAttendees(event, allPlayers);
        const attendeeCount = attendees.length;
        const markedCount = attendees.filter((p) => attendanceMark(eventAttendance, event.id, p.id).status).length;
        const presentCount = attendees.filter((p) => attendanceMark(eventAttendance, event.id, p.id).status === "present").length;
        const headerLine = React.createElement("button", { type: "button", onClick: () => toggleExpanded(event.id), className: "w-full flex items-center justify-between gap-3 text-left" },
            React.createElement("div", { className: "min-w-0 flex items-center gap-2.5" },
                React.createElement(IconArrowDown, { size: 12, className: `text-slate-300 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}` }),
                React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[event.type]?.dot || "bg-slate-400"}` }),
                event.time && React.createElement("span", { className: "text-sm font-semibold text-slate-800 shrink-0" }, event.time, event.endTime ? `–${event.endTime}` : ""),
                React.createElement("span", { className: "text-sm text-slate-700 truncate" }, event.title),
                React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, team ? team.name : "Individuell")),
            React.createElement("div", { className: "flex items-center gap-2 shrink-0" },
                markedCount > 0 && React.createElement("span", { className: "text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5" }, presentCount, "/", markedCount, " da"),
                React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, attendeeCount, " Spieler")));
        if (!isExpanded)
            return React.createElement("div", { key: event.id, className: "bg-stone-50 rounded-xl px-3.5 py-2.5" }, headerLine);
        const teamRows = teamPlayers.map((p) => rosterRow(event, p, "team"));
        const extraRows = extraPlayers.map((p) => rosterRow(event, p, "extra"));
        const addBtn = React.createElement("button", { type: "button", onClick: () => setAddPickerFor(addPickerFor === event.id ? null : event.id), className: "inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 border border-dashed border-stone-300 rounded-lg px-2.5 py-1.5 mt-2" },
            React.createElement(IconPlus, { size: 10 }),
            " Spieler hinzufügen");
        const eligibleForAdd = allPlayers.filter((p) => !(event.includedPlayerIds || []).includes(p.id) && p.teamId !== team?.id);
        const addPicker = addPickerFor === event.id ? React.createElement("div", { className: "flex items-center gap-1.5 mt-1.5" },
            React.createElement("select", { className: "text-xs rounded border border-stone-300 px-1.5 py-1", value: pickerPlayerId, onChange: (e) => setPickerPlayerId(e.target.value) },
                React.createElement("option", { value: "" }, "– Spieler wählen –"),
                eligibleForAdd.map((p) => React.createElement("option", { key: p.id, value: p.id }, `${p.name}${p.teamId ? " (" + (teams.find((t) => t.id === p.teamId)?.name || "") + ")" : ""}`))),
            React.createElement("button", { type: "button", onClick: () => addIncludedPlayer(event, pickerPlayerId), className: "text-xs font-medium bg-slate-900 text-white rounded-lg px-2 py-1 hover:bg-slate-800" }, "OK")) : null;
        const markAllBtn = attendees.length > 0 && attendees.some((p) => !attendanceMark(eventAttendance, event.id, p.id).status) && React.createElement("button", { type: "button", onClick: () => markAllPresent(event, attendees, eventAttendance, onSetAttendance), className: "mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-2.5 py-1.5" },
            React.createElement(IconCheck, { size: 12 }),
            " Alle anwesend");
        const rosterSection = React.createElement("div", { className: "mt-2.5 pt-2.5 border-t border-stone-200 divide-y divide-stone-100" }, teamRows, extraRows);
        const editButtons = React.createElement("div", { className: "flex items-center gap-2 mt-2" },
            React.createElement("button", { onClick: () => openEdit(event), className: "flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#C43E0E]" },
                React.createElement(IconEdit, { size: 12 }),
                " Bearbeiten"),
            React.createElement("button", { onClick: () => onDelete(event.id), className: "flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-500" },
                React.createElement(IconTrash, { size: 12 }),
                " Löschen"));
        return React.createElement("div", { key: event.id, className: "bg-stone-50 rounded-xl px-3.5 py-2.5" }, headerLine, markAllBtn, rosterSection, addBtn, addPicker, editButtons);
    }
    const dayGroups = dateKeys.map((iso) => {
        const isToday = iso === todayIso;
        const dayHeader = React.createElement("p", { className: `text-xs font-semibold uppercase tracking-wide mb-2 ${isToday ? "text-[#C43E0E]" : "text-slate-400"}` },
            new Date(iso + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
            isToday && " · Heute");
        const rows = React.createElement("div", { className: "space-y-2" }, byDate[iso].map(eventRow));
        return React.createElement("div", { key: iso }, dayHeader, rows);
    });
    const emptyState = filteredEvents.length === 0 ? React.createElement("p", { className: "text-sm text-slate-400 text-center py-10" }, "Keine Einheiten gefunden.") : null;
    const formModal = showForm ? React.createElement(Modal, { title: editingEvent ? "Einheit bearbeiten" : "Einheit anlegen", onClose: () => setShowForm(false), wide: true },
        React.createElement(EventForm, { initialEvent: editingEvent, teams: teams, allPlayers: allPlayers, onSubmit: (vals) => { editingEvent ? onEdit(editingEvent.id, vals) : onAdd(vals); setShowForm(false); }, onClose: () => setShowForm(false) })) : null;
    function eventLabel(e) {
        return `${e.title} (${e.time}–${e.endTime || "?"}, ${EVENT_TYPE_STYLES[e.type]?.label || e.type})`;
    }
    const conflictsPanel = conflictGroups.length > 0 ? (() => {
        const items = conflictGroups.map((group, idx) => {
            const playerRows = group.players.map((player) => {
                const conflict = { player, eventA: group.eventA, eventB: group.eventB, overlapMinutes: group.overlapMinutes };
                const { movable, alternatives } = findConflictAlternatives(conflict, rangedEvents, allPlayers, CONFLICT_MIN_OVERLAP_MINUTES);
                const altButtons = alternatives.length > 0 ? alternatives.slice(0, 3).map((alt) => React.createElement("button", { key: alt.id, type: "button", onClick: () => movePlayerToAlternative(player, movable, alt), className: "text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" }, "→ ", eventLabel(alt))) : [React.createElement("span", { key: "none", className: "text-xs text-slate-400" }, "keine überschneidungsfreie Alternative gefunden")];
                return React.createElement("div", { key: player.id, className: "flex flex-wrap items-center gap-1.5" },
                    React.createElement("span", { className: "text-xs font-semibold text-slate-700 shrink-0" }, player.name, ":"),
                    altButtons);
            });
            return React.createElement("div", { key: idx, className: "bg-white rounded-xl p-3 space-y-1.5" },
                React.createElement("p", { className: "text-xs text-slate-600" }, eventLabel(group.eventA), " überschneidet sich ", group.overlapMinutes, " Min. mit ", eventLabel(group.eventB)),
                React.createElement("div", { className: "space-y-1 mt-1" }, playerRows));
        });
        return React.createElement("div", { className: "bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2" },
            React.createElement("p", { className: "text-sm font-bold text-red-700 flex items-center gap-1.5" },
                React.createElement(IconInfo, { size: 15 }),
                conflictGroups.length, " Terminüberschneidung(en) im aktuellen Zeitraum"),
            items);
    })() : null;
    return React.createElement("div", { className: "space-y-4" },
        React.createElement("div", null,
            React.createElement(SectionLabel, null, "Alle Einheiten"),
            React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Alle Einheiten der Woche im Überblick - auf eine Einheit klicken zeigt, wer dabei sein sollte.")),
        filterBar,
        conflictsPanel,
        emptyState,
        React.createElement("div", { className: "space-y-5" }, dayGroups),
        formModal);
}
/* Eigener "Anwesenheit"-Reiter (an Spond angelehnt): die aktuelle Woche steht im
   Fokus zum Markieren (mit Vorwoche-Vergleich und "Alle anwesend"-Schnellklick),
   die Spieler-Quoten-Tabelle ist eine einklappbare Zusatzansicht darunter - ein
   einziger, gemeinsamer Team-Filter fuer die ganze Seite statt mehrerer Filter-
   Zeilen. Spieler tauchen automatisch anhand der Team-/Einzel-Zuordnung des
   jeweiligen Termins auf (dieselbe Logik wie in "Alle Einheiten"), Markieren
   nutzt dieselben eventAttendance-Daten. */
function AttendanceView({ events, teams, allPlayers, eventAttendance, onSetAttendance, onSelectPlayer }) {
    const [teamFilter, setTeamFilter] = useState("all");
    const [weekOffset, setWeekOffset] = useState(0);
    // Welcher Wochentag (0=Montag..6=Sonntag) gerade einzeln angezeigt wird - startet
    // beim heutigen Wochentag, bleibt aber beim Wechsel der Woche (Pfeile) erhalten,
    // damit man z.B. immer "Mittwoch" im Blick behalten kann.
    const [selectedDayOffset, setSelectedDayOffset] = useState(() => (new Date().getDay() + 6) % 7);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [showStats, setShowStats] = useState(false);
    const [statsRange, setStatsRange] = useState("all");
    function toggleExpanded(id) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    function teamOfEvent(e) {
        return teams.find((t) => t.id === e.teamId) || null;
    }
    function eventMatchesTeamFilter(e) {
        if (teamFilter === "all")
            return true;
        if (e.teamId === teamFilter)
            return true;
        return getEventAttendees(e, allPlayers).some((p) => p.teamId === teamFilter);
    }
    // Woche, die gerade zum Markieren angezeigt wird (per Pfeil-Navigation verschiebbar).
    const realMonday = startOfWeekMonday(new Date());
    const focusMonday = new Date(realMonday);
    focusMonday.setDate(focusMonday.getDate() + weekOffset * 7);
    const focusSunday = new Date(focusMonday);
    focusSunday.setDate(focusMonday.getDate() + 6);
    const focusStart = isoDate(focusMonday), focusEnd = isoDate(focusSunday);
    const isCurrentWeek = weekOffset === 0;
    const focusEvents = events.filter((e) => e.date >= focusStart && e.date <= focusEnd).filter(eventMatchesTeamFilter)
        .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    const byDate = {};
    focusEvents.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const dateKeys = Object.keys(byDate).sort();
    function eventRow(event) {
        const team = teamOfEvent(event);
        const isExpanded = expandedIds.has(event.id);
        const attendees = getEventAttendees(event, allPlayers);
        const markedCount = attendees.filter((p) => attendanceMark(eventAttendance, event.id, p.id).status).length;
        const presentCount = attendees.filter((p) => attendanceMark(eventAttendance, event.id, p.id).status === "present").length;
        const headerLine = React.createElement("button", { type: "button", onClick: () => toggleExpanded(event.id), className: "w-full flex items-center justify-between gap-3 text-left" },
            React.createElement("div", { className: "min-w-0 flex items-center gap-2.5" },
                React.createElement(IconArrowDown, { size: 12, className: `text-slate-300 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}` }),
                React.createElement("span", { className: `w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[event.type]?.dot || "bg-slate-400"}` }),
                event.time && React.createElement("span", { className: "text-sm font-semibold text-slate-800 shrink-0" }, event.time, event.endTime ? `–${event.endTime}` : ""),
                React.createElement("span", { className: "text-sm text-slate-700 truncate" }, event.title),
                React.createElement("span", { className: "text-xs text-slate-400 shrink-0" }, team ? team.name : "Individuell")),
            React.createElement("div", { className: "flex items-center gap-2 shrink-0" },
                markedCount > 0 && React.createElement("span", { className: "text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5" }, presentCount, "/", markedCount, " da"),
                React.createElement("span", { className: "text-xs font-semibold text-slate-400" }, attendees.length, " Spieler")));
        if (!isExpanded)
            return React.createElement("div", { key: event.id, className: "bg-stone-50 rounded-xl px-3.5 py-2.5" }, headerLine);
        const markAllBtn = attendees.length > 0 && attendees.some((p) => !attendanceMark(eventAttendance, event.id, p.id).status) && React.createElement("button", { type: "button", onClick: () => markAllPresent(event, attendees, eventAttendance, onSetAttendance), className: "mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-2.5 py-1.5" },
            React.createElement(IconCheck, { size: 12 }),
            " Alle anwesend");
        const rows = attendees.length > 0
            ? attendees.map((p) => React.createElement(AttendanceRow, { key: p.id, player: p, mark: attendanceMark(eventAttendance, event.id, p.id), onSet: (status, reason) => onSetAttendance(event.id, p.id, status, reason) }))
            : [React.createElement("p", { key: "none", className: "text-xs text-slate-400 py-2" }, "Keine Spieler zugeordnet.")];
        return React.createElement("div", { key: event.id, className: "bg-stone-50 rounded-xl px-3.5 py-2.5" },
            headerLine,
            markAllBtn,
            React.createElement("div", { className: "mt-2.5 pt-2.5 border-t border-stone-200 divide-y divide-stone-100" }, rows));
    }
    // Statt dauerhaft alle Tage der Woche untereinander zu zeigen: Tages-Reiter
    // zum Durchklicken, nur der ausgewaehlte Tag wird darunter angezeigt.
    const todayIsoForTabs = isoDate(new Date());
    const dayTabs = React.createElement("div", { className: "grid grid-cols-7 gap-1 mb-3" }, Array.from({ length: 7 }, (_, i) => {
        const d = new Date(focusMonday);
        d.setDate(focusMonday.getDate() + i);
        const iso = isoDate(d);
        const isSelected = i === selectedDayOffset;
        const isToday = iso === todayIsoForTabs;
        const hasEvents = !!byDate[iso];
        return React.createElement("button", { key: i, type: "button", onClick: () => setSelectedDayOffset(i), className: `flex flex-col items-center gap-0.5 rounded-lg py-2 transition ${isSelected ? "bg-slate-900 text-white" : isToday ? "bg-red-50 text-[#C43E0E]" : "text-slate-500 hover:bg-stone-100"}` },
            React.createElement("span", { className: "text-[11px] font-semibold uppercase" }, d.toLocaleDateString("de-DE", { weekday: "short" })),
            React.createElement("span", { className: "text-sm font-bold" }, d.getDate()),
            React.createElement("span", { className: `w-1 h-1 rounded-full ${hasEvents ? (isSelected ? "bg-white" : "bg-[#C43E0E]") : "bg-transparent"}` }));
    }));
    const selectedDay = new Date(focusMonday);
    selectedDay.setDate(focusMonday.getDate() + selectedDayOffset);
    const selectedDayIso = isoDate(selectedDay);
    const selectedDayIsToday = selectedDayIso === todayIsoForTabs;
    const selectedDayHeader = React.createElement("p", { className: `text-xs font-semibold uppercase tracking-wide mb-2 ${selectedDayIsToday ? "text-[#C43E0E]" : "text-slate-400"}` },
        selectedDay.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
        selectedDayIsToday && " · Heute");
    const selectedDayEvents = byDate[selectedDayIso] || [];
    const dayContent = selectedDayEvents.length > 0
        ? React.createElement("div", { className: "space-y-2" }, selectedDayEvents.map(eventRow))
        : React.createElement("p", { className: "text-sm text-slate-400 text-center py-8" }, "Keine Einheiten an diesem Tag.");
    // Anwesenheitsquote fuer eine Reihe von Terminen (Team-Filter respektiert) -
    // fuer den Diese-Woche/Vorwoche-Vergleich oben im Wochen-Fokus.
    function quoteForEvents(evs) {
        let present = 0, absent = 0;
        evs.filter(eventMatchesTeamFilter).forEach((e) => {
            getEventAttendees(e, allPlayers).forEach((p) => {
                const status = attendanceMark(eventAttendance, e.id, p.id).status;
                if (status === "present")
                    present++;
                else if (status === "absent")
                    absent++;
            });
        });
        return attendanceQuote(present, absent);
    }
    const realSunday = new Date(realMonday);
    realSunday.setDate(realMonday.getDate() + 6);
    const lastMonday = new Date(realMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(realMonday);
    lastSunday.setDate(lastSunday.getDate() - 1);
    const thisWeekQuote = quoteForEvents(events.filter((e) => e.date >= isoDate(realMonday) && e.date <= isoDate(realSunday)));
    const lastWeekQuote = quoteForEvents(events.filter((e) => e.date >= isoDate(lastMonday) && e.date <= isoDate(lastSunday)));
    function quoteLabel(q) {
        return q === null ? "–" : `${q}%`;
    }
    const quoteCompare = React.createElement("div", { className: "flex items-center gap-2 text-xs text-slate-500 shrink-0" },
        React.createElement("span", null, "Diese Woche ", React.createElement("strong", { className: "text-slate-800" }, quoteLabel(thisWeekQuote))),
        React.createElement("span", { className: "text-slate-300" }, "·"),
        React.createElement("span", null, "Vorwoche ", React.createElement("strong", { className: "text-slate-800" }, quoteLabel(lastWeekQuote))));
    const weekNav = React.createElement("div", { className: "flex items-center gap-1.5" },
        React.createElement("button", { type: "button", onClick: () => setWeekOffset(weekOffset - 1), className: "w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-stone-100 hover:text-slate-700", "aria-label": "Vorherige Woche" },
            React.createElement(IconArrowLeft, { size: 14 })),
        React.createElement("button", { type: "button", onClick: () => setWeekOffset(0), className: `text-sm font-semibold rounded-lg px-2.5 py-1 ${isCurrentWeek ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}` },
            isCurrentWeek ? "Diese Woche" : formatWeekRange(focusMonday)),
        React.createElement("button", { type: "button", onClick: () => setWeekOffset(weekOffset + 1), className: "w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-stone-100 hover:text-slate-700", "aria-label": "Nächste Woche" },
            React.createElement(IconArrowLeft, { size: 14, className: "rotate-180" })));
    const weekCard = React.createElement("div", { className: `${cardClass} p-4` },
        React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-3 mb-3" },
            weekNav,
            quoteCompare),
        dayTabs,
        selectedDayHeader,
        dayContent);
    // Team-Uebersicht: Anwesend/Abwesend/Verletzt je Spieler, gefiltert nach Zeitraum -
    // als einklappbare Zusatzansicht, damit die Seite nicht ueberladen wirkt. Ein
    // Spieler taucht nur bei den Terminen auf, denen er tatsaechlich zugeordnet war -
    // spielt er z.B. gerade bei einem anderen Team, zaehlt das dort und nicht hier.
    const thisMonthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const todayIso = isoDate(new Date());
    function inStatsRange(e) {
        if (statsRange === "week")
            return e.date >= isoDate(realMonday) && e.date <= isoDate(realSunday);
        if (statsRange === "lastWeek")
            return e.date >= isoDate(lastMonday) && e.date <= isoDate(lastSunday);
        if (statsRange === "month")
            return e.date >= thisMonthStart && e.date <= todayIso;
        return true;
    }
    const relevantPlayers = teamFilter === "all" ? allPlayers : allPlayers.filter((p) => p.teamId === teamFilter);
    const statsEvents = events.filter(inStatsRange);
    const statsMap = new Map(relevantPlayers.map((p) => [p.id, { player: p, present: 0, absent: 0, injured: 0 }]));
    statsEvents.forEach((e) => {
        getEventAttendees(e, allPlayers).forEach((p) => {
            const stat = statsMap.get(p.id);
            if (!stat)
                return;
            const status = attendanceMark(eventAttendance, e.id, p.id).status;
            if (status === "present")
                stat.present++;
            else if (status === "absent")
                stat.absent++;
            else if (status === "injured")
                stat.injured++;
        });
    });
    const playerStats = Array.from(statsMap.values())
        .map((s) => ({ ...s, quote: attendanceQuote(s.present, s.absent) }))
        .sort((a, b) => {
        if (a.quote === null && b.quote === null)
            return a.player.name.localeCompare(b.player.name);
        if (a.quote === null)
            return 1;
        if (b.quote === null)
            return -1;
        return a.quote - b.quote;
    });
    const statsRows = playerStats.map((s) => {
        const badgeClass = s.quote === null ? "bg-stone-100 text-slate-400" : s.quote < ATTENDANCE_WARN_THRESHOLD ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700";
        return React.createElement("tr", { key: s.player.id, onClick: () => onSelectPlayer(s.player.id), className: "border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer" },
            React.createElement("td", { className: "px-3 py-2 text-sm text-slate-700 font-medium truncate max-w-[180px]" }, s.player.name),
            React.createElement("td", { className: "px-3 py-2 text-sm text-right text-emerald-600" }, s.present || "–"),
            React.createElement("td", { className: "px-3 py-2 text-sm text-right text-red-500" }, s.absent || "–"),
            React.createElement("td", { className: "px-3 py-2 text-sm text-right text-amber-600" }, s.injured || "–"),
            React.createElement("td", { className: "px-3 py-2 text-right" },
                React.createElement("span", { className: `text-xs font-semibold rounded-full px-2 py-0.5 ${badgeClass}` }, quoteLabel(s.quote))));
    });
    function periodBtn(value, label) {
        return React.createElement("button", { type: "button", onClick: () => setStatsRange(value), className: `text-xs font-medium rounded-lg px-2.5 py-1.5 ${statsRange === value ? "bg-slate-900 text-white" : "bg-stone-100 text-slate-500 hover:bg-stone-200"}` }, label);
    }
    const statsCard = React.createElement("div", { className: `${cardClass} p-4` },
        React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-2" },
            React.createElement("button", { type: "button", onClick: () => setShowStats(!showStats), className: "flex items-center gap-1.5 text-sm font-bold text-slate-900" },
                React.createElement(IconArrowDown, { size: 12, className: `text-slate-400 transition-transform ${showStats ? "" : "-rotate-90"}` }),
                "Spieler-Quoten"),
            showStats && React.createElement("div", { className: "flex items-center gap-1" }, periodBtn("week", "Diese Woche"), periodBtn("lastWeek", "Letzte Woche"), periodBtn("month", "Monat"), periodBtn("all", "Gesamt"))),
        showStats && React.createElement("div", { className: "mt-3" },
            React.createElement("p", { className: "text-xs text-slate-400 mb-3" }, "Quote = Anwesend / (Anwesend + Abwesend). \"Verletzt\" zählt nicht als Fehlen - unter ", ATTENDANCE_WARN_THRESHOLD, "% rot markiert."),
            React.createElement("div", { className: "overflow-x-auto" },
                React.createElement("table", { className: "w-full" },
                    React.createElement("thead", null,
                        React.createElement("tr", { className: "border-b border-stone-200 text-slate-400 text-xs uppercase tracking-wide" },
                            React.createElement("th", { className: "text-left px-3 py-2" }, "Spieler"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "Anwesend"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "Abwesend"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "Verletzt"),
                            React.createElement("th", { className: "text-right px-3 py-2" }, "Quote"))),
                    React.createElement("tbody", null, statsRows.length > 0 ? statsRows : React.createElement("tr", null, React.createElement("td", { colSpan: 5, className: "text-xs text-slate-400 text-center py-6" }, "Keine Spieler in dieser Auswahl.")))))));
    return React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-3" },
            React.createElement("div", null,
                React.createElement(SectionLabel, null, "Anwesenheit"),
                React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Aktuelle Woche markieren - Spieler werden automatisch anhand der Team-/Termin-Zuordnung angezeigt.")),
            React.createElement("select", { className: "text-sm rounded-lg border border-stone-300 px-2.5 py-2", value: teamFilter, onChange: (e) => setTeamFilter(e.target.value) },
                React.createElement("option", { value: "all" }, "Alle Teams"),
                teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name)))),
        weekCard,
        statsCard);
}
function AccountManagerModal({ accounts, accountsLoaded, players, teams, currentUid, onLoad, onCreate, onDelete, onClose }) {
    const [showForm, setShowForm] = useState(false);
    const [label, setLabel] = useState("");
    const [code, setCode] = useState(() => generateCode());
    const [role, setRole] = useState("player");
    const [playerId, setPlayerId] = useState("");
    const [trainerTeamId, setTrainerTeamId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { if (!accountsLoaded)
        onLoad(); }, []);
    async function handleCreate(e) {
        e.preventDefault();
        setError("");
        if (!label.trim()) {
            setError("Bitte einen Namen/Bezeichnung für den Zugang angeben.");
            return;
        }
        if (!code.trim()) {
            setError("Bitte einen Code angeben oder generieren lassen.");
            return;
        }
        if (role === "player" && !playerId) {
            setError("Bitte einen Spieler auswählen.");
            return;
        }
        setBusy(true);
        try {
            await onCreate({ label: label.trim(), code: code.trim(), role, playerId, teamId: role === "trainer" ? (trainerTeamId || null) : null });
            setLabel("");
            setCode(generateCode());
            setPlayerId("");
            setTrainerTeamId("");
            setShowForm(false);
        }
        catch (err) {
            setError(err?.code === "auth/email-already-in-use" ? "Dieser Code ist schon vergeben, bitte einen anderen generieren." : "Fehler beim Anlegen: " + (err?.message || err));
        }
        finally {
            setBusy(false);
        }
    }
    function playerName(id) {
        return players.find((p) => p.id === id)?.name || "(gelöschter Spieler)";
    }
    function teamName(id) {
        return teams.find((t) => t.id === id)?.name || "(gelöschtes Team)";
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("p", { className: "text-xs text-slate-500" }, "Trainer-Zugänge mit Vollzugriff sehen und bearbeiten alles. Ein Trainer-Zugang kann stattdessen auf ein einzelnes Team eingeschränkt werden - der sieht dann nur Spieler, Termine, Statistiken etc. dieses Teams und kann keine Zugänge oder club-weiten Vorlagen verwalten. Spieler/Eltern-Zugänge sehen nur Kalender, Videos und Basic-Stats des verknüpften Spielers. Jeder Zugang bekommt einen eigenen Code zum Anmelden – kein Passwort, keine E-Mail nötig."),
        !showForm ? (React.createElement("button", { onClick: () => setShowForm(true), className: "flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-800" },
            React.createElement(IconPlus, { size: 15 }),
            " Neuen Zugang anlegen")) : (React.createElement("form", { onSubmit: handleCreate, className: "space-y-3 bg-stone-50 rounded-xl p-4" },
            React.createElement("div", { className: "grid grid-cols-2 gap-3" },
                React.createElement(Field, { label: "Rolle" },
                    React.createElement("select", { className: inputClass, value: role, onChange: (e) => { setRole(e.target.value); setPlayerId(""); setTrainerTeamId(""); } },
                        React.createElement("option", { value: "player" }, "Spieler / Eltern"),
                        React.createElement("option", { value: "trainer" }, "Trainer"))),
                role === "player" && (React.createElement(Field, { label: "Verknüpfter Spieler" },
                    React.createElement("select", { className: inputClass, value: playerId, onChange: (e) => setPlayerId(e.target.value) },
                        React.createElement("option", { value: "" }, "– auswählen –"),
                        players.map((p) => React.createElement("option", { key: p.id, value: p.id }, p.name))))),
                role === "trainer" && (React.createElement(Field, { label: "Zugriff" },
                    React.createElement("select", { className: inputClass, value: trainerTeamId, onChange: (e) => setTrainerTeamId(e.target.value) },
                        React.createElement("option", { value: "" }, "Vollzugriff (alle Teams)"),
                        teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, "Nur " + t.name)))))),
            React.createElement(Field, { label: "Name / Bezeichnung (nur zur eigenen Übersicht)" },
                React.createElement("input", { type: "text", className: inputClass, value: label, onChange: (e) => setLabel(e.target.value), placeholder: role === "trainer" ? "z. B. Max Trainer" : "z. B. Eltern von Marko Cuvalo" })),
            React.createElement(Field, { label: "Code (wird zum Anmelden benötigt)" },
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("input", { type: "text", className: inputClass + " font-mono tracking-wide", value: code, onChange: (e) => setCode(e.target.value) }),
                    React.createElement("button", { type: "button", onClick: () => setCode(generateCode()), className: "shrink-0 bg-stone-200 hover:bg-stone-300 text-slate-700 rounded-lg px-3 text-sm font-medium" }, "Neu generieren"))),
            error && React.createElement("p", { className: "text-xs text-red-600" }, error),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { type: "button", onClick: () => setShowForm(false), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2 text-sm font-semibold" }, "Abbrechen"),
                React.createElement("button", { type: "submit", disabled: busy, className: "flex-1 bg-[#C43E0E] hover:bg-[#A8350C] disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold" }, busy ? "Wird angelegt…" : "Zugang anlegen")))),
        React.createElement("div", { className: "space-y-2" }, !accountsLoaded ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Lädt…")) : accounts.length === 0 ? (React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Noch keine Zugänge angelegt.")) : (accounts.map((a) => (React.createElement("div", { key: a.uid, className: "flex items-center justify-between gap-3 bg-white rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-3" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, a.label || a.email),
                React.createElement("p", { className: "text-xs text-slate-400" },
                    a.role === "trainer" ? (a.teamId ? `Trainer · nur ${teamName(a.teamId)}` : "Trainer · Vollzugriff") : `Spieler-Zugang · ${playerName(a.playerId)}`,
                    " · Code: ",
                    React.createElement("span", { className: "font-mono" }, a.code))),
            a.uid !== currentUid && (React.createElement("button", { onClick: () => onDelete(a.uid), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "Zugang entfernen" },
                React.createElement(IconTrash, { size: 15 }))))))))));
}
function AdvancedRechnerLiveModal({ players, teams, onConfirm, onClose }) {
    const [stage, setStage] = useState("open");
    const [error, setError] = useState("");
    const [rows, setRows] = useState([]);
    const [matches, setMatches] = useState([]);
    const [date, setDate] = useState(today());
    const [gegner, setGegner] = useState("");
    const winRef = useRef(null);
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    const playerOptionLabel = (p) => `${p.name}${p.number !== "" && p.number !== undefined ? " #" + p.number : ""}${p.teamId ? " (" + teamName(p.teamId) + ")" : ""}`;
    function openRechner() {
        const w = window.open("rechner.html", "spielerAkteRechner");
        if (!w) {
            setError("Der Browser hat das Öffnen blockiert (Pop-up-Blocker). Bitte Pop-ups für diese Seite erlauben und nochmal versuchen.");
            return;
        }
        winRef.current = w;
        setError("");
    }
    function fetchValues() {
        try {
            const w = winRef.current;
            if (!w) {
                setError("Der Rechner wurde noch nicht geöffnet. Erst auf \"Rechner in neuem Tab öffnen\" klicken.");
                return;
            }
            let closed = false;
            try {
                closed = w.closed;
            }
            catch (e) { /* manche Browser blockieren sogar diese Abfrage */ }
            if (closed) {
                setError("Der Rechner-Tab wurde geschlossen. Bitte erneut öffnen.");
                return;
            }
            let exportFn;
            try {
                exportFn = w.spielerAkteExport;
            }
            catch (e) {
                setError("Kein Zugriff auf den Rechner-Tab (Browser blockiert die Verbindung). Liegen beide Dateien wirklich auf derselben Adresse (selbes Repository)?");
                return;
            }
            if (typeof exportFn !== "function") {
                setError("Der Rechner-Tab antwortet nicht. Ist dort wirklich die aktuelle rechner.html geladen (nicht eine alte, gecachte Version)? Einmal dort Strg+F5 versuchen.");
                return;
            }
            let data;
            try {
                data = exportFn.call(w);
            }
            catch (e) {
                setError("Fehler beim Abrufen der Werte: " + (e?.message || String(e)));
                return;
            }
            if (!data || data.length === 0) {
                setError("Keine Spieler im Rechner gefunden. Sind dort Spieler mit Namen eingetragen?");
                return;
            }
            setRows(data);
            setMatches(data.map((row) => {
                const norm = normalizeName(row.name);
                const hit = players.find((p) => normalizeName(p.name) === norm);
                return hit ? hit.id : "";
            }));
            setError("");
            setStage("review");
        }
        catch (e) {
            setError("Unerwarteter Fehler: " + (e?.message || String(e)));
        }
    }
    function setMatchAt(i, playerId) {
        setMatches((m) => m.map((v, idx) => (idx === i ? playerId : v)));
    }
    function handleConfirm() {
        const entries = rows
            .map((row, i) => ({ row, playerId: matches[i] }))
            .filter((x) => x.playerId)
            .map((x) => ({ playerId: x.playerId, values: x.row.values }));
        onConfirm(entries, date, gegner.trim());
        onClose();
    }
    const matchedCount = matches.filter(Boolean).length;
    if (stage === "open") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, "\u00D6ffnet euren Advanced-Rechner in einem neuen Tab, unver\u00E4ndert wie gewohnt. Tragt dort Spieler, Team- und Gegner-Boxscore ein, lasst berechnen \u2013 dann kommt ihr hierher zur\u00FCck und holt euch die fertigen Werte ab."),
            React.createElement("button", { onClick: openRechner, className: "w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-3 text-sm font-semibold transition" },
                React.createElement(IconUpload, { size: 16 }),
                " Rechner in neuem Tab \u00F6ffnen"),
            React.createElement("button", { onClick: fetchValues, className: "w-full flex items-center justify-center gap-2 bg-[#C43E0E] hover:bg-[#A8350C] text-white rounded-lg py-3 text-sm font-semibold transition" }, "Werte aus Rechner abrufen"),
            error && React.createElement("p", { className: "text-xs text-red-600" }, error)));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex items-center gap-3 flex-wrap" },
            React.createElement(Field, { label: "Datum des Spiels" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement(Field, { label: "Gegner (optional)" },
                React.createElement("input", { className: inputClass, value: gegner, onChange: (e) => setGegner(e.target.value), placeholder: "z. B. TSV Nord" }))),
        React.createElement("p", { className: "text-xs text-slate-500" },
            rows.length,
            " Spieler aus dem Rechner abgerufen. Namensabgleich \u2013 bitte unklare Zuordnungen pr\u00FCfen."),
        React.createElement("div", { className: "max-h-[40vh] overflow-y-auto border border-stone-200 rounded-lg" },
            React.createElement("table", { className: "w-full text-xs" },
                React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
                    React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
                        React.createElement("th", { className: "text-left px-2.5 py-2" }, "Aus Rechner"),
                        React.createElement("th", { className: "text-left px-2.5 py-2 w-1/2" }, "Zugeordneter Spieler"))),
                React.createElement("tbody", null, rows.map((row, i) => (React.createElement("tr", { key: i, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("div", { className: "font-medium text-slate-700" }, row.name)),
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("select", { className: `w-full rounded border px-1.5 py-1 text-xs ${matches[i] ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`, value: matches[i], onChange: (e) => setMatchAt(i, e.target.value) },
                            React.createElement("option", { value: "" }, "\u2013 \u00DCberspringen \u2013"),
                            players.map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))))))))),
        React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { onClick: () => setStage("open"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Erneut abrufen"),
            React.createElement("button", { onClick: handleConfirm, disabled: matchedCount === 0 || !date, className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" },
                matchedCount,
                " Spieler importieren"))));
}
