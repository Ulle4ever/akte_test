// reports.js - Berichte fuer die Main Accounts (Wochenbericht, Merkliste mit
// Spieler-Dossiers, PDF-Export) und die Verletzungshistorie in der Spielerakte.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";

/* ---------------- PDF-Export ----------------
   Rendert ein Element mit fester Breite als Bild und verteilt es auf A4-Seiten.
   Seitenumbrueche nur zwischen Bloecken mit data-pdf-block (nie mitten durch
   eine Tabelle); data-pdf-newpage erzwingt eine neue Seite (z. B. je Dossier). */
const PDF_RENDER_WIDTH = 900;
async function exportElementToPdf(el, filename) {
    if (!el || !window.html2canvas || !window.jspdf)
        throw new Error("PDF-Export nicht verfügbar.");
    const prevWidth = el.style.width;
    el.style.width = PDF_RENDER_WIDTH + "px";
    try {
        const pdf = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        // Mehrere Dossiers (data-pdf-doc) einzeln rendern: ein einziges riesiges
        // Bild ueberschreitet sonst die Canvas-Grenze der Browser (v. a. iPhone)
        const docs = [...el.querySelectorAll("[data-pdf-doc]")];
        let first = true;
        for (const part of docs.length ? docs : [el])
            first = await renderPdfPart(pdf, part, first);
        pdf.save(filename);
    }
    finally {
        el.style.width = prevWidth;
    }
}
async function renderPdfPart(pdf, el, first) {
    const scale = 2;
    const base = el.getBoundingClientRect().top;
    const blocks = [...el.querySelectorAll("[data-pdf-block]")].map((b) => {
        const r = b.getBoundingClientRect();
        return { top: (r.top - base) * scale, bottom: (r.bottom - base) * scale, newPage: b.hasAttribute("data-pdf-newpage") };
    });
    const canvas = await window.html2canvas(el, { scale, backgroundColor: "#ffffff", useCORS: true, windowWidth: PDF_RENDER_WIDTH + 40 });
    const margin = 10, pageW = 210 - 2 * margin, pageH = 297 - 2 * margin;
    const pagePx = Math.floor(pageH * (canvas.width / pageW));
    let start = 0;
    while (start < canvas.height - 2) {
        let end = Math.min(start + pagePx, canvas.height);
        if (end < canvas.height) {
            // letzte Blockgrenze, die noch auf die Seite passt
            const fits = blocks.filter((b) => b.bottom <= end && b.bottom > start + 40).map((b) => b.bottom);
            if (fits.length)
                end = Math.max(...fits) + 8;
        }
        const forced = blocks.find((b) => b.newPage && b.top > start + 40 && b.top < end);
        if (forced)
            end = forced.top - 1;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = end - start;
        const ctx = slice.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, start, canvas.width, end - start, 0, 0, canvas.width, end - start);
        if (!first)
            pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", margin, margin, pageW, (end - start) * (pageW / canvas.width));
        first = false;
        start = end;
    }
    return first;
}
function safeFileName(s) {
    return String(s || "Export").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

// Im PDF-Bereich keine CSS-Grossschreibung (uppercase): html2canvas bricht ab,
// wenn sich dabei die Textlaenge aendert ("Größe" -> "GRÖSSE"). Deshalb dort
// direkt per toUpperCase().
/* ---------------- Gemeinsame Auswertungen ---------------- */
function reportWeekRange(offsetWeeks) {
    const monday = currentWeekMonday();
    monday.setDate(monday.getDate() + offsetWeeks * 7);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), to: iso(sunday), weekKey: isoWeekKey(iso(monday)), label: formatWeekRange(monday) };
}
// Stat-Eintraege eines Spielers, die zu einem Team zaehlen (Doppellizenz: statTeamId)
function statsForTeam(player, teamId) {
    return (player.stats || []).filter((st) => (st.statTeamId ? st.statTeamId === teamId : player.teamId === teamId));
}
function statFieldIds(statCategories) {
    return {
        eff: findFieldId(statCategories, ["effizienz", "eff", "ef"]),
        pm: findFieldId(statCategories, ["plus/minus", "+/-"]),
    };
}
const numOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
// Top 3 je Team: Effizienz, wo es sie gibt (NBBL/JBBL/Herren), sonst Punkte
// (U-Teams mit DBB Scores: Punkte, dazu Plus/Minus)
function topPlayersForTeam(team, players, statCategories, from, to) {
    const ids = statFieldIds(statCategories);
    const rows = playersOfTeam(players, team.id).map((p) => {
        const games = statsForTeam(p, team.id).filter((st) => st.date >= from && st.date <= to);
        if (games.length === 0)
            return null;
        const sum = (key) => games.reduce((acc, st) => { const n = numOrNull(st[key]); return n === null ? acc : (acc ?? 0) + n; }, null);
        return { player: p, games: games.length, pts: sum("punkte") ?? 0, eff: ids.eff ? sum(ids.eff) : null, pm: ids.pm ? sum(ids.pm) : null };
    }).filter(Boolean);
    if (rows.length === 0)
        return null;
    const useEff = !DBB_SCORES_ALTERSKLASSEN.includes(team.altersklasse) && rows.some((r) => r.eff !== null);
    const metric = useEff ? "eff" : "pts";
    const top = [...rows].sort((a, b) => (b[metric] ?? -999) - (a[metric] ?? -999) || b.pts - a.pts).slice(0, 3);
    return { metric, top };
}
function topLine(r, metric) {
    const parts = metric === "eff" ? [`${r.eff} EFF`, `${r.pts} Pkt`] : [`${r.pts} Pkt`, r.pm !== null ? `${r.pm > 0 ? "+" : ""}${r.pm} +/-` : null];
    return parts.filter(Boolean).join(" · ") + (r.games > 1 ? ` (${r.games} Spiele)` : "");
}
function wellnessFlagReasonReport(entry) {
    const r = [];
    if (entry.pain && entry.pain.trim())
        r.push(entry.pain.trim());
    if (Number(entry.energy) <= 2)
        r.push("Energie niedrig");
    if (Number(entry.soreness) <= 2)
        r.push("Stark erschöpft");
    if (Number(entry.stress) >= 4)
        r.push("Stress hoch");
    return r;
}

/* ---------------- Wochenbericht ---------------- */
const REPORT_WEEK_OPTIONS = 8;
function ReportSection({ title, children, count }) {
    return React.createElement("section", { "data-pdf-block": "", className: "py-4 border-t border-stone-200 first:border-0" },
        React.createElement("div", { className: "flex items-center gap-2 mb-2" },
            React.createElement("h3", { className: "text-sm font-black tracking-wider text-slate-900" }, title.toUpperCase()),
            count !== undefined && React.createElement("span", { className: "text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 bg-stone-100 text-slate-600" }, count)),
        children);
}
const reportEmpty = (text) => React.createElement("p", { className: "text-sm text-slate-400" }, text);
function WeeklyReport({ teams, players, events, dbbData, statCategories, wellnessData, trainingLoadData, eventAttendance, devPlanWaiting, feedbackWaiting, watchlist, onSelectPlayer }) {
    const [offset, setOffset] = useState(-1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const ref = useRef(null);
    const range = reportWeekRange(offset);
    const inRange = (d) => d && d >= range.from && d <= range.to;
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    // Ergebnisse
    const results = teams.flatMap((t) => ((dbbData[t.id] || {}).matches || []).filter((m) => inRange(m.date) && dbbScore(m)).map((m) => ({ team: t, m, sc: dbbScore(m) })));
    const wins = results.filter((r) => r.sc.won).length;
    // Top 3
    const tops = teams.map((t) => ({ team: t, res: topPlayersForTeam(t, players, statCategories, range.from, range.to) })).filter((x) => x.res);
    // fehlende Stats
    const missing = results.filter((r) => playersOfTeam(players, r.team.id).length > 0 && !statsExistForGame(players, r.team.id, r.m));
    // Verletzungen
    const injured = players.filter(isInjured).sort((a, b) => (injuryCountdown(a).days ?? 9999) - (injuryCountdown(b).days ?? 9999));
    const recovered = players.flatMap((p) => (p.injuryHistory || []).filter((h) => inRange(h.back)).map((h) => ({ p, h })));
    // Auffaelligkeiten
    const wellnessFlags = players.map((p) => ({ p, e: (wellnessData[p.id]?.entries || []).find((e) => e.weekKey === range.weekKey) })).filter((x) => x.e && wellnessFlagReasonReport(x.e).length);
    const weekEvents = events.filter((e) => inRange(e.date));
    const absences = players.map((p) => {
        let absent = 0, present = 0;
        weekEvents.forEach((e) => {
            if (!getEventAttendees(e, players).some((a) => a.id === p.id))
                return;
            const st = attendanceMark(eventAttendance, e.id, p.id).status;
            if (st === "absent")
                absent++;
            else if (st === "present")
                present++;
        });
        return { p, absent, present };
    }).filter((x) => x.absent >= 2).sort((a, b) => b.absent - a.absent);
    const loadAlarms = players.map((p) => ({ p, acwr: computeAcwr(trainingLoadData[p.id]?.entries || [], range.to) })).filter((x) => acwrZone(x.acwr).label === "Alarm");
    // Merkliste
    const starred = players.filter((p) => (watchlist || []).includes(p.id));
    // Ausblick
    const nextFrom = addDaysIso(range.to, 1), nextTo = addDaysIso(range.to, 7);
    const upcoming = teams.flatMap((t) => ((dbbData[t.id] || {}).matches || []).filter((m) => m.date >= nextFrom && m.date <= nextTo && !m.cancelled).map((m) => ({ team: t, m })))
        .sort((a, b) => (a.m.date + (a.m.time || "")).localeCompare(b.m.date + (b.m.time || "")));
    async function exportPdf() {
        setBusy(true);
        setError("");
        try {
            await exportElementToPdf(ref.current, `Wochenbericht_${range.weekKey}.pdf`);
        }
        catch (e) {
            setError("PDF konnte nicht erstellt werden: " + (e.message || e));
        }
        setBusy(false);
    }
    const playerLink = (p, extra) => React.createElement("button", { onClick: () => onSelectPlayer(p.id), className: "font-semibold text-slate-900 hover:text-[#C43E0E] text-left" }, p.name, extra);
    const weekOptions = Array.from({ length: REPORT_WEEK_OPTIONS + 1 }, (_, i) => {
        const o = -i;
        const r = reportWeekRange(o);
        return { o, label: `${o === 0 ? "Diese Woche" : o === -1 ? "Letzte Woche" : "KW " + Number(r.weekKey.split("-W")[1])} · ${r.label}` };
    });
    return React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex items-center gap-2 flex-wrap" },
            React.createElement("select", { className: "text-sm rounded-lg border border-stone-300 px-2.5 py-2 bg-white", value: offset, onChange: (e) => setOffset(Number(e.target.value)) },
                weekOptions.map((w) => React.createElement("option", { key: w.o, value: w.o }, w.label))),
            React.createElement("button", { onClick: exportPdf, disabled: busy, className: btnPrimaryClass + " text-sm px-3 py-2 ml-auto" },
                busy ? React.createElement(IconLoader, { size: 14 }) : React.createElement(IconDownload, { size: 14 }),
                busy ? "PDF wird erstellt…" : "Als PDF speichern")),
        error && React.createElement("p", { className: "text-sm text-red-600" }, error),
        React.createElement("div", { ref, className: `${cardClass} p-5 sm:p-7 bg-white` },
            React.createElement("header", { "data-pdf-block": "", className: "flex items-center gap-4 pb-4" },
                React.createElement("img", { src: LOGO_DATA_URI, alt: "", className: "w-12 h-12 object-contain" }),
                React.createElement("div", { className: "min-w-0" },
                    React.createElement("p", { className: "text-[11px] font-bold tracking-[0.18em] text-[#C43E0E]" }, "RHEINSTARS · WOCHENBERICHT"),
                    React.createElement("h2", { className: "font-display italic font-black text-2xl text-slate-900 leading-tight" }, `KW ${Number(range.weekKey.split("-W")[1])} · ${range.label}`),
                    React.createElement("p", { className: "text-xs text-slate-500" }, `${results.length} Spiele · ${wins} Siege, ${results.length - wins} Niederlagen · ${injured.length} verletzt/Reha · erstellt ${new Date().toLocaleDateString("de-DE")}`))),
            React.createElement(ReportSection, { title: "Ergebnisse", count: results.length },
                results.length === 0 ? reportEmpty("Keine Spiele in dieser Woche.")
                    : React.createElement("div", { className: "grid sm:grid-cols-2 gap-x-6" }, results.map(({ team, m, sc }) => React.createElement("div", { key: team.id + m.matchId, className: "flex items-center gap-2.5 py-1.5 border-b border-stone-100 min-w-0" },
                        React.createElement(ResultChip, { score: sc }),
                        React.createElement("span", { className: "text-sm font-black tabular-nums w-14 shrink-0" }, `${sc.us}:${sc.them}`),
                        React.createElement("span", { className: "min-w-0 text-sm" },
                            React.createElement("span", { className: "font-semibold text-slate-900" }, team.name),
                            React.createElement("span", { className: "text-slate-500" }, ` ${m.isHome ? "vs" : "@"} ${dbbOpponent(m).name} · ${shortDateLabel(m.date)}`)))))),
            React.createElement(ReportSection, { title: "Top 3 je Team" },
                tops.length === 0 ? reportEmpty("Für diese Woche sind noch keine Statistiken eingetragen.")
                    : React.createElement("div", { className: "grid sm:grid-cols-2 gap-3" }, tops.map(({ team, res }) => React.createElement("div", { key: team.id, className: "rounded-xl bg-stone-50 p-3" },
                        React.createElement("p", { className: "text-xs font-bold text-slate-500 mb-1.5" }, team.name, React.createElement("span", { className: "font-normal" }, res.metric === "eff" ? " · nach Effizienz" : " · nach Punkten")),
                        res.top.map((r, i) => React.createElement("div", { key: r.player.id, className: "flex items-baseline gap-2 text-sm py-0.5" },
                            React.createElement("span", { className: `w-5 shrink-0 font-black ${i === 0 ? "text-[#C43E0E]" : "text-slate-400"}` }, `${i + 1}.`),
                            React.createElement("span", { className: "min-w-0 flex-1" }, playerLink(r.player, (watchlist || []).includes(r.player.id) ? " ★" : "")),
                            React.createElement("span", { className: "text-xs text-slate-600 tabular-nums shrink-0" }, topLine(r, res.metric)))))))),
            React.createElement(ReportSection, { title: "Statistik fehlt", count: missing.length },
                missing.length === 0 ? reportEmpty("Für alle Spiele der Woche sind Statistiken da.")
                    : React.createElement("ul", { className: "text-sm space-y-1" }, missing.map(({ team, m }) => React.createElement("li", { key: team.id + m.matchId }, React.createElement("span", { className: "font-semibold" }, team.name), ` ${m.isHome ? "vs" : "@"} ${dbbOpponent(m).name} · ${shortDateLabel(m.date)}`)))),
            React.createElement(ReportSection, { title: "Verletzungen", count: injured.length },
                injured.length === 0 && recovered.length === 0 ? reportEmpty("Keine verletzten Spieler.")
                    : React.createElement("div", { className: "space-y-1 text-sm" },
                        injured.map((p) => React.createElement("div", { key: p.id, className: "flex items-baseline gap-2 flex-wrap" },
                            playerLink(p),
                            React.createElement("span", { className: "text-slate-500" }, `${teamName(p.teamId)} · ${p.injuryReason || STATUS_OPTIONS.find((s) => s.value === p.status)?.label}`),
                            React.createElement("span", { className: `text-xs font-bold ${injuryCountdown(p).overdue ? "text-amber-600" : "text-rose-600"}` }, injuryCountdown(p).label),
                            inRange(p.injurySince) && React.createElement("span", { className: "text-[10px] font-bold text-white bg-rose-500 rounded px-1.5" }, "NEU"))),
                        recovered.map(({ p, h }) => React.createElement("div", { key: p.id + h.back, className: "flex items-baseline gap-2 flex-wrap text-emerald-700" },
                            playerLink(p),
                            React.createElement("span", null, `wieder fit seit ${shortDateLabel(h.back)}${h.reason ? " (" + h.reason + ")" : ""}`))))),
            React.createElement(ReportSection, { title: "Auffälligkeiten", count: wellnessFlags.length + absences.length + loadAlarms.length },
                wellnessFlags.length + absences.length + loadAlarms.length === 0 ? reportEmpty("Keine Auffälligkeiten bei Wellness, Anwesenheit und Belastung.")
                    : React.createElement("div", { className: "space-y-1 text-sm" },
                        wellnessFlags.map(({ p, e }) => React.createElement("div", { key: "w" + p.id }, React.createElement("span", { className: "text-xs font-bold text-orange-600 mr-2" }, "Wellness"), playerLink(p), React.createElement("span", { className: "text-slate-500" }, " · " + wellnessFlagReasonReport(e).join(", ")))),
                        absences.map(({ p, absent, present }) => React.createElement("div", { key: "a" + p.id }, React.createElement("span", { className: "text-xs font-bold text-sky-700 mr-2" }, "Anwesenheit"), playerLink(p), React.createElement("span", { className: "text-slate-500" }, ` · ${absent}× gefehlt, ${present}× da`))),
                        loadAlarms.map(({ p, acwr }) => React.createElement("div", { key: "l" + p.id }, React.createElement("span", { className: "text-xs font-bold text-fuchsia-600 mr-2" }, "Belastung"), playerLink(p), React.createElement("span", { className: "text-slate-500" }, ` · ACWR ${acwr}`)))),
                ((devPlanWaiting || []).length > 0 || (feedbackWaiting || []).length > 0) && React.createElement("p", { className: "text-xs text-slate-500 mt-2" }, `Offen: ${(devPlanWaiting || []).length} Development-Pläne warten auf Freigabe · ${(feedbackWaiting || []).length} Feedback-Anfragen von Spielern`)),
            React.createElement(ReportSection, { title: "Merkliste ★", count: starred.length },
                starred.length === 0 ? reportEmpty("Noch keine Spieler mit Stern markiert.")
                    : React.createElement("div", { className: "space-y-1 text-sm" }, starred.map((p) => {
                        const ids = statFieldIds(statCategories);
                        const games = (p.stats || []).filter((st) => inRange(st.date));
                        const line = games.length === 0 ? "kein Spiel diese Woche" : games.map((st) => [`${st.punkte ?? 0} Pkt`, ids.eff && numOrNull(st[ids.eff]) !== null ? `${st[ids.eff]} EFF` : null, st.minuten ? `${fmtNum(st.minuten, 0)} Min` : null, st.gegner ? `vs ${st.gegner}` : null].filter(Boolean).join(" · ")).join(" | ");
                        return React.createElement("div", { key: p.id, className: "flex items-baseline gap-2 flex-wrap" },
                            playerLink(p),
                            React.createElement("span", { className: "text-slate-500" }, `${teamName(p.teamId)} · ${line}`),
                            isInjured(p) && React.createElement("span", { className: "text-xs font-bold text-rose-600" }, injuryCountdown(p).label));
                    }))),
            React.createElement(ReportSection, { title: "Ausblick nächste Woche", count: upcoming.length },
                upcoming.length === 0 ? reportEmpty("Keine Spiele angesetzt.")
                    : React.createElement("div", { className: "grid sm:grid-cols-2 gap-x-6 text-sm" }, upcoming.map(({ team, m }) => React.createElement("div", { key: team.id + m.matchId, className: "py-1 border-b border-stone-100 flex gap-2 min-w-0" },
                        React.createElement("span", { className: "text-slate-500 tabular-nums shrink-0 w-24" }, `${shortDateLabel(m.date)}${m.time ? " " + m.time : ""}`),
                        React.createElement("span", { className: "min-w-0" }, React.createElement("span", { className: "font-semibold" }, team.name), ` ${m.isHome ? "vs" : "@"} ${dbbOpponent(m).name}`)))))));
}

/* ---------------- Spieler-Dossier (Export) ---------------- */
function PlayerDossier({ player, teams, statCategories, privateData, wellnessEntries, events, allPlayers, eventAttendance, dbbData, newPage }) {
    const team = teams.find((t) => t.id === player.teamId);
    const dlTeams = (player.dlTeamIds || []).map((id) => teams.find((t) => t.id === id)).filter(Boolean);
    const ids = statFieldIds(statCategories);
    const stats = sortByDateDesc(player.stats || []);
    const n = stats.length;
    const avgOf = (key) => {
        const vals = stats.map((st) => numOrNull(st[key])).filter((v) => v !== null);
        return vals.length ? fmtNum(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : "–";
    };
    const shot = (m, a) => {
        const made = stats.reduce((acc, st) => acc + (Number(st[m]) || 0), 0), att = stats.reduce((acc, st) => acc + (Number(st[a]) || 0), 0);
        return att ? `${made}/${att} (${fmtNum((made / att) * 100, 0)}%)` : "–";
    };
    const tests = privateData?.tests || [];
    const latestTests = Object.values(tests.reduce((acc, t) => { if (!acc[t.testType] || t.date > acc[t.testType].date) acc[t.testType] = t; return acc; }, {}));
    const notes = sortByDateDesc(privateData?.notes || []).slice(0, 3);
    const pastEvents = events.filter((e) => e.date && e.date <= today() && getEventAttendees(e, allPlayers).some((a) => a.id === player.id));
    let present = 0, absent = 0;
    pastEvents.forEach((e) => { const s = attendanceMark(eventAttendance, e.id, player.id).status; if (s === "present") present++; else if (s === "absent") absent++; });
    const quote = attendanceQuote(present, absent);
    const recentWell = (wellnessEntries || []).slice(0, 4);
    const history = [...(player.injuryHistory || [])].reverse();
    const fact = (label, value) => React.createElement("div", null,
        React.createElement("p", { className: "text-[10px] font-bold tracking-wider text-slate-400" }, label.toUpperCase()),
        React.createElement("p", { className: "text-sm font-semibold text-slate-900" }, value || "–"));
    const block = (title, children) => React.createElement("section", { "data-pdf-block": "", className: "py-3 border-t border-stone-200" },
        React.createElement("h4", { className: "text-xs font-black tracking-wider text-slate-900 mb-2" }, title.toUpperCase()), children);
    return React.createElement("div", { "data-pdf-doc": "", className: "bg-white px-5 py-4" },
        React.createElement("header", { "data-pdf-block": "", ...(newPage ? { "data-pdf-newpage": "" } : {}), className: "flex items-center gap-4 pb-4" },
            player.photoUrl
                ? React.createElement("img", { src: cloudinaryImage(player.photoUrl, 96, 112), crossOrigin: "anonymous", alt: "", className: "w-20 h-24 rounded-xl object-cover" })
                : React.createElement("div", { className: "w-20 h-24 rounded-xl bg-slate-900 text-white flex items-center justify-center text-2xl font-black" }, player.number !== "" && player.number != null ? "#" + player.number : (player.name || "?").charAt(0)),
            React.createElement("div", { className: "min-w-0 flex-1" },
                React.createElement("p", { className: "text-[11px] font-bold tracking-[0.18em] text-[#C43E0E]" }, "RHEINSTARS · SPIELER-DOSSIER"),
                React.createElement("h2", { className: "font-display italic font-black text-3xl text-slate-900 leading-tight" }, (player.name || "").toUpperCase()),
                React.createElement("p", { className: "text-sm text-slate-500" }, [team?.name, dlTeams.length ? "Doppellizenz " + dlTeams.map((t) => t.name).join(", ") : null, player.position, player.number !== "" && player.number !== undefined ? "#" + player.number : null].filter(Boolean).join(" · "))),
            React.createElement("img", { src: team?.logoUrl || LOGO_DATA_URI, crossOrigin: "anonymous", alt: "", className: "w-14 h-14 object-contain opacity-80" })),
        block("Steckbrief", React.createElement("div", { className: "grid grid-cols-3 sm:grid-cols-6 gap-3" },
            fact("Alter", calcAge(player.birthdate) !== null ? `${calcAge(player.birthdate)} J. (${fmtDate(player.birthdate)})` : null),
            fact("Größe", player.height ? player.height + " cm" : null),
            fact("Gewicht", player.weight ? player.weight + " kg" : null),
            fact("Starke Hand", player.handedness),
            fact("Letzter Verein", player.previousClub),
            fact("Status", isInjured(player) ? `${STATUS_OPTIONS.find((s) => s.value === player.status)?.label} · ${injuryCountdown(player).label}` : "Aktiv"))),
        block(`Saison-Statistik · ${n} ${n === 1 ? "Spiel" : "Spiele"}`, n === 0 ? reportEmpty("Noch keine Statistiken.") : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3" },
                fact("Minuten Ø", avgOf("minuten")), fact("Punkte Ø", avgOf("punkte")), fact("Rebounds Ø", avgOf("rebounds")),
                fact("Assists Ø", avgOf("assists")), fact("Effizienz Ø", ids.eff ? avgOf(ids.eff) : "–"), fact("Plus/Minus Ø", ids.pm ? avgOf(ids.pm) : "–")),
            React.createElement("div", { className: "grid grid-cols-3 gap-3 mb-3" }, fact("Feldwürfe", shot("fg_m", "fg_a")), fact("Dreier", shot("tp_m", "tp_a")), fact("Freiwürfe", shot("ft_m", "ft_a"))),
            React.createElement("table", { className: "w-full text-xs tabular-nums" },
                React.createElement("thead", null, React.createElement("tr", { className: "text-slate-400" }, ["DATUM", "GEGNER", "MIN", "PKT", "REB", "AST", "EFF"].map((h, i) => React.createElement("th", { key: h, className: `py-1 ${i < 2 ? "text-left" : "text-right"}` }, h)))),
                React.createElement("tbody", null, stats.slice(0, 8).map((st) => React.createElement("tr", { key: st.id, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "py-1" }, fmtDate(st.date)),
                    React.createElement("td", { className: "py-1" }, st.gegner || "–"),
                    ["minuten", "punkte", "rebounds", "assists", ids.eff].map((k, i) => React.createElement("td", { key: i, className: "py-1 text-right" }, k && numOrNull(st[k]) !== null ? fmtNum(st[k], 0) : "–")))))))),
        block("Athletik-Tests (jeweils letzter Wert)", latestTests.length === 0 ? reportEmpty("Keine Tests erfasst.")
            : React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, latestTests.map((t) => fact(t.testType, `${fmtNum(t.result, 2)} ${t.unit || ""} · ${fmtDate(t.date)}`)))),
        block("Betreuung", React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" },
            fact("Anwesenheit", quote !== null ? `${quote}% (${present} da, ${absent} gefehlt)` : "noch nicht genug Daten"),
            fact("Wellness zuletzt", recentWell.length ? recentWell.map((w) => `E${w.energy}/K${w.soreness}/S${w.stress}`).join(" · ") : null),
            fact("Verletzungen bisher", String(history.length + (isInjured(player) ? 1 : 0))),
            fact("Schule", player.school))),
        (history.length > 0 || isInjured(player)) && block("Verletzungshistorie", React.createElement("ul", { className: "text-sm space-y-0.5" },
            isInjured(player) && React.createElement("li", { className: "text-rose-700 font-semibold" }, `aktuell: ${player.injuryReason || "ohne Angabe"} · seit ${fmtDate(player.injurySince)} · ${injuryCountdown(player).label}`),
            history.map((h, i) => React.createElement("li", { key: i, className: "text-slate-700" }, `${h.reason || "ohne Angabe"} · ${fmtDate(h.since)} – ${fmtDate(h.back)}${h.since && h.back ? ` (${Math.max(0, -daysBetweenIso(h.back, h.since))} Tage)` : ""}`)))),
        notes.length > 0 && block("Letzte Trainer-Notizen", React.createElement("ul", { className: "text-sm space-y-1" }, notes.map((nt) => React.createElement("li", { key: nt.id }, React.createElement("span", { className: "text-slate-400 mr-2" }, fmtDate(nt.date)), nt.title || "", nt.text ? ` – ${nt.text}` : "")))),
        React.createElement("p", { "data-pdf-block": "", className: "text-[10px] text-slate-400 pt-3" }, `Erstellt am ${new Date().toLocaleDateString("de-DE")} · vertraulich, nur für die sportliche Leitung`));
}
function daysBetweenIso(a, b) {
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

/* ---------------- Merkliste ---------------- */
function Watchlist({ teams, players, watchlist, onToggleStar, onSelectPlayer, dossierProps }) {
    const [exporting, setExporting] = useState(null); // playerId | "all"
    const [error, setError] = useState("");
    const ref = useRef(null);
    const starred = players.filter((p) => (watchlist || []).includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    const exportPlayers = exporting === "all" ? starred : starred.filter((p) => p.id === exporting);
    useEffect(() => {
        if (!exporting)
            return;
        // erst rendern lassen (Bilder laden), dann exportieren
        const timer = setTimeout(async () => {
            try {
                const name = exporting === "all" ? `Merkliste_${today()}.pdf` : `Dossier_${safeFileName(exportPlayers[0]?.name)}.pdf`;
                await exportElementToPdf(ref.current, name);
            }
            catch (e) {
                setError("PDF konnte nicht erstellt werden: " + (e.message || e));
            }
            setExporting(null);
        }, 900);
        return () => clearTimeout(timer);
    }, [exporting]);
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    return React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex items-center gap-2 flex-wrap" },
            React.createElement("p", { className: "text-sm text-slate-500 flex-1 min-w-[200px]" }, "Spieler mit Stern markierst du in der Spielerakte oben rechts. Die Merkliste teilen sich alle Main Accounts."),
            starred.length > 1 && React.createElement("button", { onClick: () => { setError(""); setExporting("all"); }, disabled: !!exporting, className: btnPrimaryClass + " text-sm px-3 py-2" },
                exporting === "all" ? React.createElement(IconLoader, { size: 14 }) : React.createElement(IconDownload, { size: 14 }),
                exporting === "all" ? "PDF wird erstellt…" : `Alle ${starred.length} als PDF`)),
        error && React.createElement("p", { className: "text-sm text-red-600" }, error),
        starred.length === 0
            ? React.createElement("div", { className: `${cardClass} p-8 text-center text-sm text-slate-400` }, "Noch keine Spieler auf der Merkliste.")
            : React.createElement("div", { className: `${cardClass} divide-y divide-stone-100` }, starred.map((p) => {
                const games = (p.stats || []).length;
                const avgPts = games ? fmtNum((p.stats || []).reduce((a, st) => a + (Number(st.punkte) || 0), 0) / games, 1) : "–";
                return React.createElement("div", { key: p.id, className: "flex items-center gap-3 px-4 py-3" },
                    React.createElement("button", { onClick: () => onToggleStar(p.id), className: "text-amber-500 hover:text-slate-300 shrink-0", "aria-label": "Von der Merkliste nehmen", title: "Von der Merkliste nehmen" }, React.createElement(IconStar, { size: 18, filled: true })),
                    React.createElement("button", { onClick: () => onSelectPlayer(p.id), className: "min-w-0 flex-1 text-left" },
                        React.createElement("span", { className: "block text-sm font-semibold text-slate-900 truncate hover:text-[#C43E0E]" }, p.name),
                        React.createElement("span", { className: "block text-xs text-slate-500 truncate" }, [teamName(p.teamId), `${games} Spiele`, `${avgPts} Pkt Ø`, isInjured(p) ? injuryCountdown(p).label : null].filter(Boolean).join(" · "))),
                    React.createElement("button", { onClick: () => { setError(""); setExporting(p.id); }, disabled: !!exporting, className: "flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-lg px-2.5 py-1.5 shrink-0" },
                        exporting === p.id ? React.createElement(IconLoader, { size: 13 }) : React.createElement(IconDownload, { size: 13 }), "Dossier"));
            })),
        // Unsichtbar gerenderte Dossiers fuer den PDF-Export
        exporting && React.createElement("div", { style: { position: "fixed", left: "-10000px", top: 0, width: PDF_RENDER_WIDTH + "px" }, "aria-hidden": "true" },
            React.createElement("div", { ref, className: "bg-white p-6" }, exportPlayers.map((p, i) => React.createElement(PlayerDossier, { key: p.id, player: p, newPage: i > 0, ...dossierProps(p) })))));
}

/* ---------------- Berichte-Seite (nur Main Accounts) ---------------- */
function ReportsPage(props) {
    const [tab, setTab] = useState("woche");
    const tabBtn = (key, label) => React.createElement("button", { key, onClick: () => setTab(key), className: `text-sm font-semibold rounded-full px-3.5 py-1.5 border transition ${tab === key ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-stone-200 text-slate-600 hover:border-stone-300"}` }, label);
    return React.createElement("div", { className: "space-y-4 rsk-fade-in" },
        React.createElement("div", null,
            React.createElement(SectionLabel, null, "Berichte"),
            React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Nur für Main Accounts sichtbar. Jeden Montag um 7 Uhr kommt eine Push-Nachricht, sobald der Bericht der Vorwoche fertig ist.")),
        React.createElement("div", { className: "flex gap-2" }, tabBtn("woche", "Wochenbericht"), tabBtn("merkliste", `Merkliste ★ ${(props.watchlist || []).length}`)),
        tab === "woche" ? React.createElement(WeeklyReport, props) : React.createElement(Watchlist, props));
}

/* ---------------- Verletzungshistorie (Spielerakte) ---------------- */
function InjuryHistoryCard({ player, canEdit, onSave }) {
    const [adding, setAdding] = useState(false);
    const [reason, setReason] = useState("");
    const [since, setSince] = useState("");
    const [back, setBack] = useState("");
    const history = [...(player.injuryHistory || [])].map((h, i) => ({ ...h, idx: i })).sort((a, b) => (b.since || b.back || "").localeCompare(a.since || a.back || ""));
    if (!isInjured(player) && history.length === 0 && !canEdit)
        return null;
    function add(e) {
        e.preventDefault();
        if (!since || !back || back < since)
            return;
        onSave([...(player.injuryHistory || []), { reason: reason.trim(), since, until: "", back, status: "verletzt", manual: true }]);
        setAdding(false);
        setReason("");
        setSince("");
        setBack("");
    }
    const totalDays = history.reduce((acc, h) => acc + (h.since && h.back ? Math.max(0, daysBetweenIso(h.since, h.back)) : 0), 0);
    return React.createElement("div", { className: `${cardClass} p-4 sm:p-5` },
        React.createElement("div", { className: "flex items-center justify-between gap-2 mb-2" },
            React.createElement(SectionLabel, null, "Verletzungen"),
            canEdit && !adding && React.createElement("button", { onClick: () => setAdding(true), className: "flex items-center gap-1 text-xs font-medium text-[#C43E0E] hover:text-[#FF6A2B]" }, React.createElement(IconPlus, { size: 13 }), " Frühere nachtragen")),
        adding && React.createElement("form", { onSubmit: add, className: "grid sm:grid-cols-4 gap-2 mb-3 bg-stone-50 rounded-xl p-3" },
            React.createElement("input", { className: inputClass + " sm:col-span-2", value: reason, onChange: (e) => setReason(e.target.value), placeholder: "Grund, z. B. Fingerbruch links" }),
            React.createElement("input", { type: "date", className: inputClass, value: since, onChange: (e) => setSince(e.target.value), "aria-label": "Verletzt seit", title: "Verletzt seit" }),
            React.createElement("input", { type: "date", className: inputClass, value: back, onChange: (e) => setBack(e.target.value), "aria-label": "Wieder fit am", title: "Wieder fit am" }),
            React.createElement("div", { className: "sm:col-span-4 flex items-center gap-2" },
                React.createElement("p", { className: "text-xs text-slate-400 flex-1" }, "Von – bis (wieder fit)."),
                React.createElement("button", { type: "button", onClick: () => setAdding(false), className: "text-sm text-slate-500 px-3 py-1.5" }, "Abbrechen"),
                React.createElement("button", { type: "submit", disabled: !since || !back || back < since, className: "text-sm font-semibold bg-slate-900 text-white rounded-lg px-3 py-1.5 disabled:opacity-40" }, "Speichern"))),
        !isInjured(player) && history.length === 0 && !adding && React.createElement("p", { className: "text-sm text-slate-400" }, "Keine Verletzungen erfasst."),
        React.createElement("div", { className: "space-y-1.5" },
            isInjured(player) && React.createElement("div", { className: "flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2" },
                React.createElement("span", { className: "w-2 h-2 rounded-full bg-rose-500 shrink-0" }),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("p", { className: "text-sm font-semibold text-slate-900" }, player.injuryReason || "Ohne Angabe", React.createElement("span", { className: "ml-2 text-xs font-bold text-rose-600" }, "aktuell")),
                    React.createElement("p", { className: "text-xs text-slate-500" }, [`seit ${fmtDate(player.injurySince)}`, player.injuryUntil ? `zurück ca. ${fmtDate(player.injuryUntil)}` : null].filter(Boolean).join(" · "))),
                React.createElement("span", { className: "text-xs font-bold text-rose-700 shrink-0" }, injuryCountdown(player).label)),
            history.map((h) => React.createElement("div", { key: h.idx, className: "flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 group" },
                React.createElement("span", { className: "w-2 h-2 rounded-full bg-emerald-500 shrink-0" }),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, h.reason || "Ohne Angabe"),
                    React.createElement("p", { className: "text-xs text-slate-500" }, `${fmtDate(h.since)} – ${fmtDate(h.back)}${h.since && h.back ? ` · ${Math.max(0, daysBetweenIso(h.since, h.back))} Tage` : ""}`)),
                canEdit && React.createElement("button", { onClick: () => onSave((player.injuryHistory || []).filter((_, i) => i !== h.idx)), className: "text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0", "aria-label": "Eintrag löschen" }, React.createElement(IconTrash, { size: 14 })))),
            history.length > 1 && React.createElement("p", { className: "text-xs text-slate-400 pt-1" }, `${history.length} auskurierte Verletzungen · zusammen ${totalDays} Tage Ausfall`)));
}

/* ---------------- Dossier-Export aus der Spielerakte ---------------- */
function DossierExportButton({ player, dossierProps }) {
    const [busy, setBusy] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!busy)
            return;
        const timer = setTimeout(async () => {
            try {
                await exportElementToPdf(ref.current, `Dossier_${safeFileName(player.name)}.pdf`);
            }
            catch (e) {
                window.alert("PDF konnte nicht erstellt werden: " + (e.message || e));
            }
            setBusy(false);
        }, 900);
        return () => clearTimeout(timer);
    }, [busy]);
    return React.createElement(React.Fragment, null,
        React.createElement("button", { onClick: () => setBusy(true), disabled: busy, className: "p-1.5 sm:p-2 rounded-lg bg-black/20 hover:bg-black/35 text-white/80 disabled:opacity-60", "aria-label": "Dossier als PDF", title: "Dossier als PDF" },
            busy ? React.createElement(IconLoader, { size: 16 }) : React.createElement(IconDownload, { size: 16 })),
        busy && React.createElement("div", { style: { position: "fixed", left: "-10000px", top: 0, width: PDF_RENDER_WIDTH + "px" }, "aria-hidden": "true" },
            React.createElement("div", { ref, className: "bg-white p-6" }, React.createElement(PlayerDossier, { player, ...dossierProps }))));
}

/* ---------------- Kalender-Abo ---------------- */
function CalendarSubscribe() {
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    async function load(reset) {
        setBusy(true);
        setError("");
        try {
            const r = await functionsInstance.httpsCallable("getCalendarFeedUrl")({ reset: !!reset });
            setUrl(r.data.url);
        }
        catch (e) {
            setError("Link konnte nicht erstellt werden. Bitte später nochmal versuchen.");
        }
        setBusy(false);
    }
    useEffect(() => { load(false); }, []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (e) { }
    }
    const webcal = url.replace(/^https:/, "webcal:");
    return React.createElement("div", { className: "space-y-4" },
        React.createElement("p", { className: "text-sm text-slate-600" }, "Mit diesem Link erscheinen alle Termine und Spiele automatisch im Handy- oder Outlook-Kalender und bleiben aktuell (der Kalender holt sich Änderungen alle paar Stunden)."),
        busy ? React.createElement("div", { className: "py-6 text-center" }, React.createElement(IconLoader, { className: "animate-spin mx-auto text-[#C43E0E]", size: 22 }))
            : error ? React.createElement("p", { className: "text-sm text-red-600" }, error)
                : React.createElement(React.Fragment, null,
                    React.createElement("a", { href: webcal, className: btnPrimaryClass + " w-full py-2.5 text-sm" }, React.createElement(IconCalendar, { size: 15 }), "Im Kalender abonnieren"),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("input", { readOnly: true, value: url, onFocus: (e) => e.target.select(), className: inputClass + " font-mono text-xs" }),
                        React.createElement("button", { onClick: copy, className: btnSecondaryClass + " px-3 text-sm shrink-0" }, copied ? "Kopiert ✓" : "Kopieren")),
                    React.createElement("div", { className: "text-xs text-slate-500 space-y-1" },
                        React.createElement("p", null, React.createElement("b", null, "iPhone: "), "„Im Kalender abonnieren“ tippen → Abonnieren."),
                        React.createElement("p", null, React.createElement("b", null, "Android / Google: "), "Link kopieren → calendar.google.com am PC → Weitere Kalender „+“ → Per URL."),
                        React.createElement("p", null, React.createElement("b", null, "Outlook: "), "Kalender hinzufügen → Aus dem Internet → Link einfügen.")),
                    React.createElement("button", { onClick: () => load(true), className: "text-xs text-slate-400 hover:text-red-500" }, "Link zurücksetzen (alter Link funktioniert dann nicht mehr)")));
}
