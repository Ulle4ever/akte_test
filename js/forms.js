// forms.js - Gemeinsame Styles, Modal und Formulare (Teams, Spieler, Statistiken, Tests, Videos, Notizen), Development Plan und die Import-Dialoge.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2.5 sm:py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#C43E0E] focus:border-[#C43E0E] transition";
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const shadowClass = "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)]";
const cardClass = `bg-white rounded-2xl ${shadowClass}`;
const btnPrimaryClass = `inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#C43E0E] to-[#A8350C] hover:from-[#FF6A2B] hover:to-[#8A2C0A] active:scale-[0.97] disabled:bg-none disabled:bg-stone-200 disabled:text-slate-400 disabled:active:scale-100 text-white rounded-xl font-semibold transition-all ${shadowClass}`;
const btnSecondaryClass = "inline-flex items-center justify-center gap-1.5 bg-stone-100 hover:bg-stone-200 active:scale-[0.97] text-slate-700 rounded-xl font-semibold transition-all";
function Modal({ title, onClose, children, wide }) {
    return (React.createElement("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 rsk-backdrop-in", onClick: onClose },
        React.createElement("div", { className: `bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${wide ? "sm:max-w-xl" : "sm:max-w-md"} max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rsk-sheet-in pb-safe relative`, onClick: (e) => e.stopPropagation() },
            React.createElement("div", { className: "hidden sm:block absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-[#C43E0E] to-[#C43E0E]" }),
            React.createElement("div", { className: "sm:hidden flex justify-center pt-2.5 pb-1 sticky top-0 bg-white" },
                React.createElement("span", { className: "h-1 w-10 rounded-full bg-stone-300" })),
            React.createElement("div", { className: "flex items-center justify-between px-5 py-3.5 sm:py-4 border-b border-stone-200 sticky top-0 bg-white/95 backdrop-blur z-10" },
                React.createElement("h3", { className: "text-base font-bold text-slate-900" }, title),
                React.createElement("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600 hover:bg-stone-100 rounded-full p-1.5 -mr-1.5 transition", "aria-label": "Schlie\u00DFen" },
                    React.createElement(IconX, { size: 18 }))),
            React.createElement("div", { className: "p-5" }, children))));
}
function Field({ label, children }) {
    return (React.createElement("div", null,
        React.createElement("label", { className: labelClass }, label),
        children));
}
function TeamsManager({ teams, onEdit, onClose }) {
    return (React.createElement("div", { className: "space-y-2" },
        teams.length === 0 && React.createElement("p", { className: "text-sm text-slate-400" }, "Noch keine Teams angelegt."),
        sortTeams(teams).map((t) => (React.createElement("div", { key: t.id, className: "flex items-center justify-between gap-3 bg-stone-50 rounded-xl px-3 py-2.5" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement("p", { className: "text-sm font-semibold text-slate-800 truncate" }, t.name),
                React.createElement("p", { className: "text-xs text-slate-400" }, t.altersklasse || "Keine Altersklasse hinterlegt", isDoppellizenzTeam(t) ? " · Doppellizenz" : "", t.dbbTeamId ? " · DBB verbunden" : "", t.trainer && ` · ${t.trainer}`)),
            React.createElement("button", { onClick: () => onEdit(t), className: "shrink-0 p-2 rounded-lg hover:bg-stone-200 text-slate-500", "aria-label": "Bearbeiten" },
                React.createElement(IconEdit, { size: 15 }))))),
        React.createElement("button", { onClick: onClose, className: "w-full text-sm text-slate-500 hover:text-slate-700 pt-2" }, "Schließen")));
}
const ALTERSKLASSE_OPTIONS = ["U10", "U12", "U14", "U16", "U18", "JBBL", "NBBL", "ProA", "1. Regionalliga", "Oberliga"];
// Altersklassen, fuer die der DBB-Scores-Statistik-Import angeboten wird (JBBL/NBBL
// haben eigene, ausfuehrlichere Statistiken und brauchen den Import nicht).
const DBB_SCORES_ALTERSKLASSEN = ["U10", "U12", "U14", "U16", "U18"];
// Doppellizenz-Teams (Herren: ProA, 1. Regionalliga, Oberliga): kein eigener Kader - Spieler bleiben in ihrem
// Hauptteam (NBBL/JBBL) und werden dort per player.dlTeamIds zugeordnet.
const DOPPELLIZENZ_ALTERSKLASSEN = ["ProA", "1. Regionalliga", "Oberliga"];
function isDoppellizenzTeam(team) {
    return !!team && DOPPELLIZENZ_ALTERSKLASSEN.includes(team.altersklasse);
}
// Feste Reihenfolge ueberall (Seitenleiste, Dashboard, Auswahllisten): Herren,
// dann Nachwuchs-Bundesligen, dann die U-Teams absteigend, innerhalb nach Name.
const TEAM_SORT_ORDER = ["ProA", "1. Regionalliga", "Oberliga", "NBBL", "JBBL", "U18", "U16", "U14", "U12", "U10"];
function sortTeams(teams) {
    const rank = (t) => {
        const i = TEAM_SORT_ORDER.indexOf(t.altersklasse);
        return i === -1 ? TEAM_SORT_ORDER.length : i;
    };
    return [...(teams || [])].sort((a, b) => rank(a) - rank(b) || (a.name || "").localeCompare(b.name || "", "de", { numeric: true }));
}
// Trainer-Zugang: teamIds (Liste, max. MAX_TRAINER_TEAMS) oder altes Einzelfeld
// teamId; null = Vollzugriff ("Main Account"). Die Firestore-Regeln pruefen die
// Liste Index fuer Index, deshalb die feste Obergrenze.
const MAX_TRAINER_TEAMS = 4;
function accountTeamIds(account) {
    if (!account || account.role !== "trainer")
        return null;
    if (Array.isArray(account.teamIds) && account.teamIds.length > 0)
        return account.teamIds;
    return account.teamId ? [account.teamId] : null;
}
// teamId bleibt als erstes Team mit drin: aeltere Regeln kennen nur das
// Einzelfeld und schraenken so wenigstens auf das erste Team ein, statt
// faelschlich Vollzugriff zu geben.
function accountTeamFields(teamIds) {
    const ids = (teamIds || []).filter(Boolean).slice(0, MAX_TRAINER_TEAMS);
    return { teamIds: ids.length ? ids : null, teamId: ids[0] || null };
}
// Spieler eines Teams inkl. Doppellizenzler (fuer ProA-/Regio-Teams)
function playersOfTeam(players, teamId) {
    return players.filter((p) => p.teamId === teamId || (p.dlTeamIds || []).includes(teamId));
}
// Cloudinary liefert sonst das Original (Handyfotos ~4000x6000 px), das der
// Browser auf 100 px herunterrechnet - das sieht pixelig/zackig aus und laedt
// langsam. Stattdessen passend skaliert + aufs Gesicht zugeschnitten abrufen.
function cloudinaryImage(url, w, h) {
    if (!url || !/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url))
        return url;
    const t = ["c_fill", "g_face", `w_${w}`, h ? `h_${h}` : null, "q_auto", "f_auto", "dpr_3.0"].filter(Boolean).join(",");
    return url.replace("/image/upload/", `/image/upload/${t}/`);
}
// Liga-/Verbandslogo fuer die Spieler-Uebersicht: JBBL/NBBL zeigen ihr eigenes
// Liga-Logo, die U-Mannschaften (ohne eigene Liga) zeigen stattdessen das WBV-Logo.
function getLeagueLogo(altersklasse) {
    if (altersklasse === "JBBL")
        return LOGO_JBBL_DATA_URI;
    if (altersklasse === "NBBL")
        return LOGO_NBBL_DATA_URI;
    if (DBB_SCORES_ALTERSKLASSEN.includes(altersklasse))
        return LOGO_WBV_DATA_URI;
    return null;
}
// "163337", ".../team/163337", "...teamId=163337" -> 163337 (gleiche Logik wie in functions/index.js)
function parseDbbTeamId(value) {
    const s = String(value || "").trim();
    const m = s.match(/team(?:id)?[\/=](\d{4,})/i) || s.match(/^(\d{4,})$/);
    return m ? Number(m[1]) : null;
}
function TeamForm({ initial, onSubmit, onClose, limited }) {
    const [name, setName] = useState(initial?.name || "");
    const [altersklasse, setAltersklasse] = useState(initial?.altersklasse || "");
    const [trainer, setTrainer] = useState(initial?.trainer || "");
    const [dbbTeamId, setDbbTeamId] = useState(initial?.dbbTeamId ? String(initial.dbbTeamId) : "");
    const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || "");
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    function pickLogo(file) {
        setLogoFile(file || null);
        setLogoPreview(file ? URL.createObjectURL(file) : "");
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) {
            setError("Bitte einen Teamnamen eingeben.");
            return;
        }
        const parsedDbbId = parseDbbTeamId(dbbTeamId);
        if (dbbTeamId.trim() && !parsedDbbId) {
            setError("DBB-Team: bitte die Team-ID (z. B. 163337) oder einen Link von basketball-bund.net mit /team/… einfügen.");
            return;
        }
        let finalLogoUrl = logoUrl;
        if (logoFile) {
            setSaving(true);
            try {
                finalLogoUrl = (await uploadToCloudinary(logoFile)).url;
            }
            catch (err) {
                setSaving(false);
                setError("Logo-Upload fehlgeschlagen. Bitte nochmal versuchen (oder ohne neues Logo speichern).");
                return;
            }
            setSaving(false);
        }
        onSubmit({ name: name.trim(), altersklasse, trainer: trainer.trim(), dbbTeamId: parsedDbbId ? String(parsedDbbId) : "", logoUrl: finalLogoUrl });
        onClose();
    }
    const shownLogo = logoPreview || logoUrl;
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement(Field, { label: "Teamname" },
            React.createElement("input", { className: inputClass, value: name, onChange: (e) => { setName(e.target.value); setError(""); }, placeholder: "z. B. U16 Herren", autoFocus: true }),
            error && React.createElement("p", { className: "text-xs text-red-600 mt-1" }, error)),
        !limited && React.createElement(Field, { label: "Altersklasse / Liga" },
            React.createElement("select", { className: inputClass, value: altersklasse, onChange: (e) => setAltersklasse(e.target.value) },
                React.createElement("option", { value: "" }, "– bitte wählen –"),
                ALTERSKLASSE_OPTIONS.map((a) => React.createElement("option", { key: a, value: a }, a)))),
        React.createElement(Field, { label: "Cheftrainer" },
            React.createElement("input", { className: inputClass, value: trainer, onChange: (e) => setTrainer(e.target.value), placeholder: "Name" })),
        React.createElement(Field, { label: "DBB-Spielplan (optional)" },
            React.createElement("input", { className: inputClass, value: dbbTeamId, onChange: (e) => { setDbbTeamId(e.target.value); setError(""); }, placeholder: "Team-ID oder Link von basketball-bund.net" }),
            React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Damit kommen Spielplan, Ergebnisse und Tabelle automatisch ins Dashboard und die Spiele in den Kalender.")),
        React.createElement(Field, { label: "Teamlogo (optional)" },
            React.createElement("div", { className: "flex items-center gap-3" },
                shownLogo && React.createElement("img", { src: shownLogo, alt: "", className: "w-12 h-12 rounded-lg object-contain bg-slate-900 p-1.5 shrink-0" }),
                React.createElement("input", { type: "file", accept: "image/*", onChange: (e) => pickLogo(e.target.files[0]), className: "block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }),
                shownLogo && React.createElement("button", { type: "button", onClick: () => { pickLogo(null); setLogoUrl(""); }, className: "text-xs text-slate-400 hover:text-red-500 shrink-0" }, "Entfernen")),
            React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Erscheint weich im Hintergrund der Spielerakte und im Spieltag-Banner. Am besten PNG mit transparentem Hintergrund.")),
        React.createElement("button", { type: "submit", disabled: saving, className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60" }, saving ? "Logo wird hochgeladen…" : initial ? "Speichern" : "Team anlegen")));
}
function PlayerForm({ teams, initial, onSubmit, onClose }) {
    const [name, setName] = useState(initial?.name || "");
    const rosterTeams = sortTeams(teams.filter((t) => !isDoppellizenzTeam(t)));
    const dlTeams = sortTeams(teams.filter(isDoppellizenzTeam));
    const [teamId, setTeamId] = useState(initial?.teamId || rosterTeams[0]?.id || "");
    const [dlTeamIds, setDlTeamIds] = useState(initial?.dlTeamIds || []);
    const [position, setPosition] = useState(initial?.position || POSITIONS[0]);
    const [number, setNumber] = useState(initial?.number ?? "");
    const [birthdate, setBirthdate] = useState(initial?.birthdate || "");
    const [status, setStatus] = useState(initial?.status || "aktiv");
    const [handedness, setHandedness] = useState(initial?.handedness || "");
    const [previousClub, setPreviousClub] = useState(initial?.previousClub || "");
    const [nationality, setNationality] = useState(initial?.nationality || "");
    const [height, setHeight] = useState(initial?.height ?? "");
    const [weight, setWeight] = useState(initial?.weight ?? "");
    const [school, setSchool] = useState(initial?.school || "");
    const [city, setCity] = useState(initial?.city || "");
    const [district, setDistrict] = useState(initial?.district || "");
    const [photoFile, setPhotoFile] = useState(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const wasInjured = isInjured(initial);
    const [injuryReason, setInjuryReason] = useState(initial?.injuryReason || "");
    const [injuryUntil, setInjuryUntil] = useState(initial?.injuryUntil || "");
    const injurySince = wasInjured && initial?.injurySince ? initial.injurySince : today();
    const [durAmount, setDurAmount] = useState(() => initial?.injuryUntil ? String(Math.max(0, daysUntilIso(initial.injuryUntil))) : "");
    const [durUnit, setDurUnit] = useState("tage");
    function setDuration(amount, unit) {
        setDurAmount(amount);
        setDurUnit(unit);
        const n = parseInt(amount, 10);
        setInjuryUntil(isNaN(n) || n < 0 ? "" : addDaysIso(today(), unit === "wochen" ? n * 7 : n));
    }
    const [photoInputKey, setPhotoInputKey] = useState(0); // Datei-Feld nach "Entfernen" leeren
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [error, setError] = useState("");
    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) {
            setError("Bitte einen Namen eingeben.");
            return;
        }
        if (!teamId) {
            setError("Bitte ein Team auswählen.");
            return;
        }
        let photoUrl = removePhoto ? "" : (initial?.photoUrl || "");
        if (photoFile) {
            setUploadingPhoto(true);
            try {
                const result = await uploadToCloudinary(photoFile);
                photoUrl = result.url;
            }
            catch (err) {
                setUploadingPhoto(false);
                setError("Foto-Upload fehlgeschlagen. Bitte nochmal versuchen (oder ohne neues Foto speichern).");
                return;
            }
            setUploadingPhoto(false);
        }
        onSubmit({
            name: name.trim(),
            teamId,
            position,
            number: number === "" ? "" : Number(number),
            birthdate,
            status,
            handedness,
            previousClub: previousClub.trim(),
            nationality: nationality.trim(),
            height: height === "" ? "" : Number(height),
            weight: weight === "" ? "" : Number(weight),
            school: school.trim(),
            city: city.trim(),
            district: district.trim(),
            photoUrl,
            dlTeamIds: dlTeamIds.filter((id) => dlTeams.some((t) => t.id === id)),
            ...injuryFieldsForSubmit(),
        });
        onClose();
    }
    // Verletzt/Reha: Grund + Rueckkehrdatum speichern; wieder "aktiv" -> die
    // Verletzung wandert in die Historie und die Felder werden geleert.
    function injuryFieldsForSubmit() {
        if (INJURY_STATUSES.includes(status))
            return { injuryReason: injuryReason.trim(), injurySince, injuryUntil };
        if (!wasInjured)
            return {};
        const history = [...(initial.injuryHistory || []), { reason: initial.injuryReason || "", since: initial.injurySince || "", until: initial.injuryUntil || "", back: today(), status: initial.status }];
        return { injuryReason: "", injurySince: "", injuryUntil: "", injuryHistory: history };
    }
    const injuredNow = INJURY_STATUSES.includes(status);
    const previewCountdown = injuredNow ? injuryCountdown({ status, injuryUntil }) : null;
    const injuryFields = injuredNow && React.createElement("div", { className: "rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-3" },
        React.createElement(Field, { label: "Grund" },
            React.createElement("input", { className: inputClass, value: injuryReason, onChange: (e) => setInjuryReason(e.target.value), placeholder: "z. B. Bänderdehnung Knöchel rechts" })),
        React.createElement(Field, { label: "Fällt voraussichtlich aus" },
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("input", { type: "number", min: "0", className: inputClass + " w-24", value: durAmount, onChange: (e) => setDuration(e.target.value, durUnit), placeholder: "z. B. 3" }),
                React.createElement("select", { className: inputClass + " w-32", value: durUnit, onChange: (e) => setDuration(durAmount, e.target.value) },
                    React.createElement("option", { value: "tage" }, "Tage"),
                    React.createElement("option", { value: "wochen" }, "Wochen")),
                React.createElement("input", { type: "date", className: inputClass, value: injuryUntil, onChange: (e) => { setInjuryUntil(e.target.value); setDurAmount(e.target.value ? String(Math.max(0, daysUntilIso(e.target.value))) : ""); setDurUnit("tage"); }, "aria-label": "Zurück am" }))),
        React.createElement("p", { className: "text-xs text-rose-700" }, injuryUntil
            ? `Zurück voraussichtlich am ${fmtDate(injuryUntil)} · ${previewCountdown.label}. Die App zählt automatisch runter.`
            : "Ohne Dauer steht beim Spieler „Dauer offen“."));
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement(Field, { label: "Name" },
            React.createElement("input", { className: inputClass, value: name, onChange: (e) => { setName(e.target.value); setError(""); }, placeholder: "Vor- und Nachname", autoFocus: true })),
        React.createElement(Field, { label: "Team" },
            React.createElement("select", { className: inputClass, value: teamId, onChange: (e) => setTeamId(e.target.value) },
                rosterTeams.length === 0 && React.createElement("option", { value: "" }, "Kein Team vorhanden"),
                rosterTeams.map((t) => (React.createElement("option", { key: t.id, value: t.id }, t.name))))),
        dlTeams.length > 0 && React.createElement(Field, { label: "Doppellizenz (optional)" },
            React.createElement("div", { className: "flex flex-wrap gap-2" }, dlTeams.map((t) => {
                const on = dlTeamIds.includes(t.id);
                return React.createElement("button", { key: t.id, type: "button", "aria-pressed": on, onClick: () => setDlTeamIds((prev) => on ? prev.filter((x) => x !== t.id) : [...prev, t.id]), className: `text-sm font-semibold rounded-lg px-3 py-1.5 border transition ${on ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-stone-300 text-slate-600 hover:border-stone-400"}` }, (on ? "✓ " : "") + t.name);
            })),
            React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Spieler bleibt im Hauptteam, sieht aber zusätzlich den Spielplan dieser Mannschaft, und du kannst Stats aus deren Spielen für ihn importieren.")),
        React.createElement(Field, { label: "Portraitfoto (optional)" },
            React.createElement("div", { className: "flex items-center gap-3" },
                (photoFile || (initial?.photoUrl && !removePhoto)) && React.createElement("img", { src: photoFile ? URL.createObjectURL(photoFile) : cloudinaryImage(initial.photoUrl, 48, 56), alt: "", className: "w-12 h-14 rounded-lg object-cover shrink-0" }),
                React.createElement("input", { key: photoInputKey, type: "file", accept: "image/*", onChange: (e) => { setPhotoFile(e.target.files[0] || null); setRemovePhoto(false); }, className: "block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }),
                (photoFile || (initial?.photoUrl && !removePhoto)) && React.createElement("button", { type: "button", onClick: () => { setPhotoFile(null); setRemovePhoto(true); setPhotoInputKey((k) => k + 1); }, className: "text-xs text-slate-400 hover:text-red-500 shrink-0" }, "Entfernen")),
            initial?.photoUrl && !photoFile && !removePhoto && React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Neue Datei wählen, um das Foto zu ersetzen."),
            removePhoto && initial?.photoUrl && React.createElement("p", { className: "text-xs text-amber-600 mt-1" }, "Foto wird beim Speichern entfernt.")),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Position" },
                React.createElement("select", { className: inputClass, value: position, onChange: (e) => setPosition(e.target.value) }, POSITIONS.map((p) => React.createElement("option", { key: p, value: p }, p)))),
            React.createElement(Field, { label: "R\u00FCckennummer" },
                React.createElement("input", { type: "number", className: inputClass, value: number, onChange: (e) => setNumber(e.target.value), min: "0", max: "99" }))),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Geburtsdatum" },
                React.createElement("input", { type: "date", className: inputClass, value: birthdate, onChange: (e) => setBirthdate(e.target.value) })),
            React.createElement(Field, { label: "Status" },
                React.createElement("select", { className: inputClass, value: status, onChange: (e) => setStatus(e.target.value) }, STATUS_OPTIONS.map((s) => React.createElement("option", { key: s.value, value: s.value }, s.label))))),
        injuryFields,
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Starke Hand" },
                React.createElement("select", { className: inputClass, value: handedness, onChange: (e) => setHandedness(e.target.value) },
                    React.createElement("option", { value: "" }, "Unbekannt"),
                    React.createElement("option", { value: "rechts" }, "Rechts"),
                    React.createElement("option", { value: "links" }, "Links"),
                    React.createElement("option", { value: "beidhaendig" }, "Beidhändig"))),
            React.createElement(Field, { label: "Letzter Verein" },
                React.createElement("input", { className: inputClass, value: previousClub, onChange: (e) => setPreviousClub(e.target.value), placeholder: "z. B. TSV Nord" }))),
        React.createElement(Field, { label: "Nationalität (optional)" },
            React.createElement("input", { className: inputClass, value: nationality, onChange: (e) => setNationality(e.target.value), placeholder: "z. B. DE oder DE/NG" })),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Größe (cm)" },
                React.createElement("input", { type: "number", className: inputClass, value: height, onChange: (e) => setHeight(e.target.value), min: "0", max: "260", placeholder: "z. B. 188" })),
            React.createElement(Field, { label: "Gewicht (kg)" },
                React.createElement("input", { type: "number", className: inputClass, value: weight, onChange: (e) => setWeight(e.target.value), min: "0", max: "250", placeholder: "z. B. 82" }))),
        React.createElement(Field, { label: "Schule" },
            React.createElement("input", { className: inputClass, value: school, onChange: (e) => setSchool(e.target.value), placeholder: "z. B. Gymnasium Nord" })),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Wohnort (Stadt)" },
                React.createElement("input", { className: inputClass, value: city, onChange: (e) => setCity(e.target.value), placeholder: "z. B. Köln oder Düsseldorf" })),
            React.createElement(Field, { label: "Stadtteil" },
                React.createElement("input", { className: inputClass, value: district, onChange: (e) => setDistrict(e.target.value), placeholder: "z. B. Ehrenfeld" }))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", disabled: uploadingPhoto, className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition" }, uploadingPhoto ? "Foto wird hochgeladen…" : initial ? "Änderungen speichern" : "Spieler anlegen")));
}
/* Formular, das der Spieler/die Eltern selbst ausfüllen - bewusst ohne
   Team/Position/Rückennummer/Status (die bleiben Trainer-Sache). Wird sowohl
   beim allerersten Login (Pflicht, kein Abbrechen) als auch später über
   "Meine Daten bearbeiten" (freiwillig, mit Abbrechen) verwendet. */
function PlayerSelfProfileForm({ initial, mandatory, onSubmit, onClose }) {
    const [birthdate, setBirthdate] = useState(initial?.birthdate || "");
    const [city, setCity] = useState(initial?.city || "");
    const [district, setDistrict] = useState(initial?.district || "");
    const [school, setSchool] = useState(initial?.school || "");
    const [height, setHeight] = useState(initial?.height ?? "");
    const [weight, setWeight] = useState(initial?.weight ?? "");
    const [handedness, setHandedness] = useState(initial?.handedness || "");
    const [previousClub, setPreviousClub] = useState(initial?.previousClub || "");
    const [phone, setPhone] = useState(initial?.phone || "");
    const [email, setEmail] = useState(initial?.email || "");
    const [emergencyContactName, setEmergencyContactName] = useState(initial?.emergencyContactName || "");
    const [emergencyContactPhone, setEmergencyContactPhone] = useState(initial?.emergencyContactPhone || "");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        if (!phone.trim() || !city.trim() || !emergencyContactName.trim() || !emergencyContactPhone.trim()) {
            setError("Bitte Telefonnummer, Wohnort und Notfallkontakt (Name + Telefon) ausfüllen - der Rest ist optional.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            await onSubmit({
                birthdate,
                city: city.trim(),
                district: district.trim(),
                school: school.trim(),
                height: height === "" ? "" : Number(height),
                weight: weight === "" ? "" : Number(weight),
                handedness,
                previousClub: previousClub.trim(),
                phone: phone.trim(),
                email: email.trim(),
                emergencyContactName: emergencyContactName.trim(),
                emergencyContactPhone: emergencyContactPhone.trim(),
                onboardingCompleted: true,
            });
        }
        finally {
            setBusy(false);
        }
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement(SectionLabel, null, "Kontakt"),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Telefonnummer *" },
                React.createElement("input", { type: "tel", className: inputClass, value: phone, onChange: (e) => setPhone(e.target.value), placeholder: "z. B. 0151 23456789" })),
            React.createElement(Field, { label: "E-Mail" },
                React.createElement("input", { type: "email", className: inputClass, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "optional" }))),
        React.createElement(SectionLabel, null, "Notfallkontakt"),
        React.createElement("p", { className: "text-xs text-slate-400 -mt-2" }, "Wer soll im Notfall beim Training/Spiel erreichbar sein?"),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Name *" },
                React.createElement("input", { className: inputClass, value: emergencyContactName, onChange: (e) => setEmergencyContactName(e.target.value), placeholder: "z. B. Mutter/Vater" })),
            React.createElement(Field, { label: "Telefon *" },
                React.createElement("input", { type: "tel", className: inputClass, value: emergencyContactPhone, onChange: (e) => setEmergencyContactPhone(e.target.value) }))),
        React.createElement(SectionLabel, null, "Persönliche Daten"),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Geburtsdatum" },
                React.createElement("input", { type: "date", className: inputClass, value: birthdate, onChange: (e) => setBirthdate(e.target.value) })),
            React.createElement(Field, { label: "Schule" },
                React.createElement("input", { className: inputClass, value: school, onChange: (e) => setSchool(e.target.value) }))),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Wohnort (Stadt) *" },
                React.createElement("input", { className: inputClass, value: city, onChange: (e) => setCity(e.target.value), placeholder: "z. B. Köln" })),
            React.createElement(Field, { label: "Stadtteil" },
                React.createElement("input", { className: inputClass, value: district, onChange: (e) => setDistrict(e.target.value), placeholder: "z. B. Ehrenfeld" }))),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Größe (cm)" },
                React.createElement("input", { type: "number", className: inputClass, value: height, onChange: (e) => setHeight(e.target.value), min: "0", max: "260" })),
            React.createElement(Field, { label: "Gewicht (kg)" },
                React.createElement("input", { type: "number", className: inputClass, value: weight, onChange: (e) => setWeight(e.target.value), min: "0", max: "250" }))),
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Starke Hand" },
                React.createElement("select", { className: inputClass, value: handedness, onChange: (e) => setHandedness(e.target.value) },
                    React.createElement("option", { value: "" }, "Unbekannt"),
                    React.createElement("option", { value: "rechts" }, "Rechts"),
                    React.createElement("option", { value: "links" }, "Links"),
                    React.createElement("option", { value: "beidhaendig" }, "Beidhändig"))),
            React.createElement(Field, { label: "Letzter Verein" },
                React.createElement("input", { className: inputClass, value: previousClub, onChange: (e) => setPreviousClub(e.target.value) }))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("div", { className: "flex gap-2 pt-1" },
            !mandatory && onClose && React.createElement("button", { type: "button", onClick: onClose, className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold" }, "Abbrechen"),
            React.createElement("button", { type: "submit", disabled: busy, className: "flex-1 bg-[#C43E0E] hover:bg-[#A8350C] disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold" }, busy ? "Wird gespeichert…" : "Speichern"))));
}
function SectionLabel({ children }) {
    return React.createElement("p", { className: "flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider pt-1" },
        React.createElement("span", { className: "w-[3px] h-3.5 rounded-full bg-[#C43E0E] shrink-0" }),
        children);
}
function SimpleListManager({ title, description, items, onAdd, onRename, onDelete, onMove, onClose, addPlaceholder }) {
    const [newLabel, setNewLabel] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    function submitNew(e) {
        e.preventDefault();
        if (!newLabel.trim())
            return;
        onAdd(newLabel.trim());
        setNewLabel("");
    }
    function startEdit(f) {
        setEditingId(f.id);
        setEditValue(f.label);
    }
    function saveEdit(id) {
        if (editValue.trim())
            onRename(id, editValue.trim());
        setEditingId(null);
    }
    return (React.createElement("div", { className: "space-y-4" },
        description && React.createElement("p", { className: "text-xs text-slate-500" }, description),
        React.createElement("div", { className: "space-y-1.5" },
            items.length === 0 && React.createElement("p", { className: "text-sm text-slate-400 text-center py-4" }, "Noch keine Eintr\u00E4ge."),
            items.map((f, i) => (React.createElement("div", { key: f.id, className: "flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" },
                React.createElement("div", { className: "flex flex-col -my-1 shrink-0" },
                    React.createElement("button", { onClick: () => onMove(f.id, -1), disabled: i === 0, className: "text-slate-400 hover:text-slate-700 disabled:opacity-20", "aria-label": "Nach oben" },
                        React.createElement(IconArrowUp, { size: 13 })),
                    React.createElement("button", { onClick: () => onMove(f.id, 1), disabled: i === items.length - 1, className: "text-slate-400 hover:text-slate-700 disabled:opacity-20", "aria-label": "Nach unten" },
                        React.createElement(IconArrowDown, { size: 13 }))),
                editingId === f.id ? (React.createElement("input", { className: "flex-1 rounded border border-[#C43E0E]/40 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C43E0E]", value: editValue, onChange: (e) => setEditValue(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                        saveEdit(f.id); if (e.key === "Escape")
                        setEditingId(null); }, autoFocus: true, onBlur: () => saveEdit(f.id) })) : (React.createElement("button", { className: "flex-1 text-left text-sm text-slate-800 hover:text-[#C43E0E]", onClick: () => startEdit(f) }, f.label)),
                React.createElement("button", { onClick: () => startEdit(f), className: "text-slate-400 hover:text-slate-700 shrink-0", "aria-label": "Umbenennen" },
                    React.createElement(IconEdit, { size: 14 })),
                React.createElement("button", { onClick: () => onDelete(f.id), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "L\u00F6schen" },
                    React.createElement(IconTrash, { size: 14 })))))),
        React.createElement("form", { onSubmit: submitNew, className: "flex gap-2 pt-2 border-t border-stone-200" },
            React.createElement("input", { className: inputClass, placeholder: addPlaceholder || "Neuer Eintrag", value: newLabel, onChange: (e) => setNewLabel(e.target.value) }),
            React.createElement("button", { type: "submit", className: "shrink-0 bg-slate-900 text-white rounded-lg px-4 text-sm font-semibold hover:bg-slate-800" }, "Hinzuf\u00FCgen")),
        onClose && React.createElement("button", { onClick: onClose, className: "w-full bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Fertig")));
}
function CategoryBlock({ category, catIndex, catCount, onRenameCat, onDeleteCat, onMoveCat, onAddField, onRenameField, onDeleteField, onMoveField }) {
    const [editingCat, setEditingCat] = useState(false);
    const [catValue, setCatValue] = useState(category.label);
    const [newFieldLabel, setNewFieldLabel] = useState("");
    const [newFieldKind, setNewFieldKind] = useState(category.id === "shooting" ? "shooting" : "number");
    const [editingFieldId, setEditingFieldId] = useState(null);
    const [editFieldValue, setEditFieldValue] = useState("");
    function saveCat() {
        if (catValue.trim())
            onRenameCat(category.id, catValue.trim());
        setEditingCat(false);
    }
    function submitField(e) {
        e.preventDefault();
        if (!newFieldLabel.trim())
            return;
        onAddField(category.id, newFieldLabel.trim(), newFieldKind);
        setNewFieldLabel("");
    }
    function startEditField(f) {
        setEditingFieldId(f.id);
        setEditFieldValue(f.label);
    }
    function saveEditField(id) {
        if (editFieldValue.trim())
            onRenameField(category.id, id, editFieldValue.trim());
        setEditingFieldId(null);
    }
    return (React.createElement("div", { className: "border border-stone-200 rounded-lg overflow-hidden" },
        React.createElement("div", { className: "flex items-center gap-2 bg-stone-100 px-3 py-2" },
            React.createElement("div", { className: "flex flex-col -my-1 shrink-0" },
                React.createElement("button", { onClick: () => onMoveCat(category.id, -1), disabled: catIndex === 0, className: "text-slate-400 hover:text-slate-700 disabled:opacity-20", "aria-label": "Kategorie nach oben" },
                    React.createElement(IconArrowUp, { size: 12 })),
                React.createElement("button", { onClick: () => onMoveCat(category.id, 1), disabled: catIndex === catCount - 1, className: "text-slate-400 hover:text-slate-700 disabled:opacity-20", "aria-label": "Kategorie nach unten" },
                    React.createElement(IconArrowDown, { size: 12 }))),
            editingCat ? (React.createElement("input", { className: "flex-1 rounded border border-[#C43E0E]/40 px-2 py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-[#C43E0E]", value: catValue, onChange: (e) => setCatValue(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                    saveCat(); if (e.key === "Escape")
                    setEditingCat(false); }, autoFocus: true, onBlur: saveCat })) : (React.createElement("button", { className: "flex-1 text-left text-sm font-bold text-slate-800 hover:text-[#C43E0E]", onClick: () => setEditingCat(true) }, category.label)),
            React.createElement("button", { onClick: () => setEditingCat(true), className: "text-slate-400 hover:text-slate-700 shrink-0", "aria-label": "Kategorie umbenennen" },
                React.createElement(IconEdit, { size: 14 })),
            React.createElement("button", { onClick: () => onDeleteCat(category.id), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "Kategorie l\u00F6schen" },
                React.createElement(IconTrash, { size: 14 }))),
        React.createElement("div", { className: "p-3 space-y-1.5" },
            category.fields.length === 0 && React.createElement("p", { className: "text-xs text-slate-400 text-center py-2" }, "Keine Felder in dieser Kategorie."),
            category.fields.map((f, i) => (React.createElement("div", { key: f.id, className: "flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-2.5 py-1.5" },
                React.createElement("div", { className: "flex flex-col -my-1 shrink-0" },
                    React.createElement("button", { onClick: () => onMoveField(category.id, f.id, -1), disabled: i === 0, className: "text-slate-300 hover:text-slate-700 disabled:opacity-20", "aria-label": "Feld nach oben" },
                        React.createElement(IconArrowUp, { size: 11 })),
                    React.createElement("button", { onClick: () => onMoveField(category.id, f.id, 1), disabled: i === category.fields.length - 1, className: "text-slate-300 hover:text-slate-700 disabled:opacity-20", "aria-label": "Feld nach unten" },
                        React.createElement(IconArrowDown, { size: 11 }))),
                editingFieldId === f.id ? (React.createElement("input", { className: "flex-1 rounded border border-[#C43E0E]/40 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C43E0E]", value: editFieldValue, onChange: (e) => setEditFieldValue(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                        saveEditField(f.id); if (e.key === "Escape")
                        setEditingFieldId(null); }, autoFocus: true, onBlur: () => saveEditField(f.id) })) : (React.createElement("button", { className: "flex-1 text-left text-xs text-slate-700 hover:text-[#C43E0E]", onClick: () => startEditField(f) }, f.label)),
                React.createElement("span", { className: "text-[10px] text-slate-400 shrink-0" }, f.kind === "shooting" ? "Treffer/Versuche" : "Zahl"),
                React.createElement("button", { onClick: () => startEditField(f), className: "text-slate-400 hover:text-slate-700 shrink-0", "aria-label": "Feld umbenennen" },
                    React.createElement(IconEdit, { size: 12 })),
                React.createElement("button", { onClick: () => onDeleteField(category.id, f.id), className: "text-slate-300 hover:text-red-500 shrink-0", "aria-label": "Feld l\u00F6schen" },
                    React.createElement(IconTrash, { size: 12 }))))),
            React.createElement("form", { onSubmit: submitField, className: "flex gap-1.5 pt-1.5" },
                React.createElement("input", { className: inputClass + " text-xs py-1.5", placeholder: "Neues Feld", value: newFieldLabel, onChange: (e) => setNewFieldLabel(e.target.value) }),
                React.createElement("select", { className: inputClass + " text-xs py-1.5 w-auto shrink-0", value: newFieldKind, onChange: (e) => setNewFieldKind(e.target.value) },
                    React.createElement("option", { value: "number" }, "Zahl"),
                    React.createElement("option", { value: "shooting" }, "Treffer/Versuche")),
                React.createElement("button", { type: "submit", className: "shrink-0 bg-slate-900 text-white rounded-lg px-3 text-xs font-semibold hover:bg-slate-800" }, "+")))));
}
function StatCategoriesManager({ categories, onAddCat, onRenameCat, onDeleteCat, onMoveCat, onAddField, onRenameField, onDeleteField, onMoveField, onClose }) {
    const [newCatLabel, setNewCatLabel] = useState("");
    function submitCat(e) {
        e.preventDefault();
        if (!newCatLabel.trim())
            return;
        onAddCat(newCatLabel.trim());
        setNewCatLabel("");
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("p", { className: "text-xs text-slate-500" }, "Komplett frei einstellbar: Kategorien und Felder hinzuf\u00FCgen, umbenennen, l\u00F6schen, umsortieren. \"Treffer/Versuche\" rechnet automatisch eine Quote aus, \"Zahl\" ist ein einfaches Eingabefeld. \u00C4nderungen wirken nur auf Anzeige/neue Eintr\u00E4ge, bestehende Daten bleiben erhalten."),
        React.createElement("div", { className: "space-y-3" }, categories.map((cat, i) => (React.createElement(CategoryBlock, { key: cat.id, category: cat, catIndex: i, catCount: categories.length, onRenameCat: onRenameCat, onDeleteCat: onDeleteCat, onMoveCat: onMoveCat, onAddField: onAddField, onRenameField: onRenameField, onDeleteField: onDeleteField, onMoveField: onMoveField })))),
        React.createElement("form", { onSubmit: submitCat, className: "flex gap-2 pt-2 border-t border-stone-200" },
            React.createElement("input", { className: inputClass, placeholder: "Neue Kategorie, z. B. Verteidigung", value: newCatLabel, onChange: (e) => setNewCatLabel(e.target.value) }),
            React.createElement("button", { type: "submit", className: "shrink-0 bg-slate-900 text-white rounded-lg px-4 text-sm font-semibold hover:bg-slate-800" }, "Kategorie")),
        React.createElement("button", { onClick: onClose, className: "w-full bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Fertig")));
}
function StatForm({ onSubmit, onClose, statCategories, initialEntry }) {
    const [form, setForm] = useState(() => {
        const base = { date: initialEntry?.date || today(), gegner: initialEntry?.gegner || "", minuten: initialEntry?.minuten ?? "" };
        statCategories.forEach((cat) => {
            cat.fields.forEach((f) => {
                if (f.kind === "shooting") {
                    base[`${f.id}_m`] = initialEntry?.[`${f.id}_m`] ?? "";
                    base[`${f.id}_a`] = initialEntry?.[`${f.id}_a`] ?? "";
                }
                else {
                    base[f.id] = initialEntry?.[f.id] ?? "";
                }
            });
        });
        return base;
    });
    const [error, setError] = useState("");
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const n = (k) => Number(form[k]) || 0;
    function handleSubmit(e) {
        e.preventDefault();
        if (!form.date) {
            setError("Bitte ein Datum angeben.");
            return;
        }
        const entry = { date: form.date, gegner: form.gegner.trim(), minuten: n("minuten") };
        if (initialEntry?.id)
            entry.id = initialEntry.id;
        statCategories.forEach((cat) => {
            cat.fields.forEach((f) => {
                if (f.kind === "shooting") {
                    entry[`${f.id}_m`] = n(`${f.id}_m`);
                    entry[`${f.id}_a`] = n(`${f.id}_a`);
                }
                else {
                    entry[f.id] = n(f.id);
                }
            });
        });
        onSubmit(entry);
        onClose();
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-3" },
        React.createElement("div", { className: "grid grid-cols-3 gap-3" },
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: form.date, onChange: set("date") })),
            React.createElement(Field, { label: "Gegner" },
                React.createElement("input", { className: inputClass, value: form.gegner, onChange: set("gegner"), placeholder: "z. B. TSV Nord" })),
            React.createElement(Field, { label: "Minuten" },
                React.createElement("input", { type: "number", className: inputClass, value: form.minuten, onChange: set("minuten") }))),
        statCategories.map((cat) => (cat.fields.length > 0 && (React.createElement("div", { key: cat.id },
            React.createElement(SectionLabel, null, cat.label),
            React.createElement("div", { className: "space-y-2 mt-1" },
                cat.fields.map((f) => (f.kind === "shooting" ? (React.createElement("div", { key: f.id, className: "grid grid-cols-3 gap-3" },
                    React.createElement(Field, { label: `${f.label} Treffer` },
                        React.createElement("input", { type: "number", className: inputClass, value: form[`${f.id}_m`], onChange: set(`${f.id}_m`) })),
                    React.createElement(Field, { label: `${f.label} Versuche` },
                        React.createElement("input", { type: "number", className: inputClass, value: form[`${f.id}_a`], onChange: set(`${f.id}_a`) })),
                    React.createElement("div", { className: "flex items-end pb-2 text-xs text-slate-400" }, pct(form[`${f.id}_m`], form[`${f.id}_a`]) !== null ? `${pct(form[`${f.id}_m`], form[`${f.id}_a`])}%` : ""))) : null)),
                React.createElement("div", { className: "grid grid-cols-3 gap-3" }, cat.fields.filter((f) => f.kind !== "shooting").map((f) => (React.createElement(Field, { key: f.id, label: f.label },
                    React.createElement("input", { type: "number", className: inputClass, value: form[f.id] ?? "", onChange: set(f.id) })))))))))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition" }, "Eintrag speichern")));
}
function TestForm({ onSubmit, onClose, testTypes, initialEntry }) {
    const [testType, setTestType] = useState(initialEntry?.testType || testTypes[0]?.label || "");
    const [date, setDate] = useState(initialEntry?.date || today());
    const [result, setResult] = useState(initialEntry?.result ?? "");
    const [unit, setUnit] = useState(initialEntry?.unit || "");
    const [error, setError] = useState("");
    function handleSubmit(e) {
        e.preventDefault();
        if (!testType.trim()) {
            setError("Bitte eine Testart angeben.");
            return;
        }
        if (result === "") {
            setError("Bitte ein Ergebnis eingeben.");
            return;
        }
        onSubmit({ ...(initialEntry ? { id: initialEntry.id } : {}), date, testType: testType.trim(), result: Number(result), unit: unit.trim() });
        onClose();
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement(Field, { label: "Testart" }, testTypes.length > 0 ? (React.createElement("select", { className: inputClass, value: testType, onChange: (e) => setTestType(e.target.value) }, testTypes.map((t) => React.createElement("option", { key: t.id, value: t.label }, t.label)))) : (React.createElement("input", { className: inputClass, value: testType, onChange: (e) => setTestType(e.target.value), placeholder: "z. B. Sprint 20m" }))),
        React.createElement("div", { className: "grid grid-cols-3 gap-3" },
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement(Field, { label: "Ergebnis" },
                React.createElement("input", { type: "number", step: "0.01", className: inputClass, value: result, onChange: (e) => { setResult(e.target.value); setError(""); } })),
            React.createElement(Field, { label: "Einheit" },
                React.createElement("input", { className: inputClass, value: unit, onChange: (e) => setUnit(e.target.value), placeholder: "sek, cm, kg" }))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition" }, initialEntry ? "Änderungen speichern" : "Testergebnis speichern")));
}
function VideoForm({ onSubmit, onClose, defaultType }) {
    const [date, setDate] = useState(today());
    const [type, setType] = useState(defaultType || VIDEO_TYPES[0]);
    const [mode, setMode] = useState("link");
    const [url, setUrl] = useState("");
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [description, setDescription] = useState("");
    const [error, setError] = useState("");
    async function handleSubmit(e) {
        e.preventDefault();
        if (mode === "upload") {
            if (!file) {
                setError("Bitte eine Videodatei auswählen.");
                return;
            }
            setUploading(true);
            setUploadProgress(0);
            try {
                const result = await uploadToCloudinary(file, setUploadProgress);
                onSubmit({ date, type, url: result.url, description: description.trim() });
                onClose();
            }
            catch (err) {
                setUploading(false);
                setError("Datei-Upload fehlgeschlagen. Bitte nochmal versuchen oder per Link einfügen.");
            }
            return;
        }
        if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
            setError("Bitte einen gültigen Link (mit http:// oder https://) eingeben.");
            return;
        }
        onSubmit({ date, type, url: url.trim(), description: description.trim() });
        onClose();
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement(Field, { label: "Typ" },
                React.createElement("select", { className: inputClass, value: type, onChange: (e) => setType(e.target.value) }, VIDEO_TYPES.map((t) => React.createElement("option", { key: t, value: t }, t))))),
        React.createElement("div", { className: "flex gap-1 bg-stone-100 rounded-xl p-1" },
            React.createElement("button", { type: "button", onClick: () => setMode("link"), className: `flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${mode === "link" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}` }, "Link einf\u00FCgen"),
            React.createElement("button", { type: "button", onClick: () => setMode("upload"), className: `flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${mode === "upload" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}` }, "Datei hochladen")),
        mode === "link"
            ? React.createElement(Field, { label: "Link (z. B. nicht gelisteter YouTube-Link)" },
                React.createElement("input", { className: inputClass, value: url, onChange: (e) => { setUrl(e.target.value); setError(""); }, placeholder: "https://..." }))
            : React.createElement(Field, { label: "Videodatei" },
                React.createElement("input", { type: "file", accept: "video/*", onChange: (e) => { setFile(e.target.files[0] || null); setError(""); }, className: "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }),
                file && React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Ausgew\u00E4hlt: ", file.name)),
        React.createElement(Field, { label: "Beschreibung" },
            React.createElement("textarea", { className: inputClass, rows: 2, value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Was ist zu sehen?" })),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", disabled: uploading, className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60" }, uploading ? `Wird hochgeladen\u2026 ${uploadProgress}%` : mode === "upload" ? "Video hochladen" : "Video verkn\u00FCpfen")));
}
function NoteForm({ onSubmit, onClose }) {
    const [date, setDate] = useState(today());
    const [category, setCategory] = useState(NOTE_CATEGORIES[0].value);
    const [author, setAuthor] = useState("Trainer");
    const [text, setText] = useState("");
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    async function handleSubmit(e) {
        e.preventDefault();
        if (!text.trim()) {
            setError("Bitte einen Text eingeben.");
            return;
        }
        const entry = { date, category, author: author.trim() || "Trainer", text: text.trim() };
        if (file) {
            setUploading(true);
            try {
                const result = await uploadToCloudinary(file);
                entry.attachmentUrl = result.url;
                entry.attachmentName = file.name;
            }
            catch (err) {
                setUploading(false);
                setError("Datei-Upload fehlgeschlagen. Bitte nochmal versuchen (oder ohne Anhang speichern).");
                return;
            }
            setUploading(false);
        }
        onSubmit(entry);
        onClose();
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement("div", { className: "grid grid-cols-3 gap-3" },
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement(Field, { label: "Kategorie" },
                React.createElement("select", { className: inputClass, value: category, onChange: (e) => setCategory(e.target.value) }, NOTE_CATEGORIES.map((c) => React.createElement("option", { key: c.value, value: c.value }, c.label)))),
            React.createElement(Field, { label: "Von" },
                React.createElement("input", { className: inputClass, value: author, onChange: (e) => setAuthor(e.target.value) }))),
        React.createElement(Field, { label: "Notiz" },
            React.createElement("textarea", { className: inputClass, rows: 3, value: text, onChange: (e) => { setText(e.target.value); setError(""); }, placeholder: "z. B. Schw\u00E4che linke Hand beim Layup" })),
        React.createElement(Field, { label: "PDF oder Scan anh\u00E4ngen (optional)" },
            React.createElement("input", { type: "file", accept: "application/pdf,image/*", onChange: (e) => setFile(e.target.files[0] || null), className: "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }),
            file && React.createElement("p", { className: "text-xs text-slate-500 mt-1" },
                "Ausgew\u00E4hlt: ",
                file.name)),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", disabled: uploading, className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60" }, uploading ? "Wird hochgeladen…" : "Notiz speichern")));
}
const DEFAULT_DEVPLAN_TEMPLATES = {
    player: [
        { id: "p-t1", label: "Meine Ziele", questions: [
                { id: "p-q1", type: "text", label: "Langfristige Ziele – Wo willst du langfristig hin?" },
                { id: "p-q2", type: "text", label: "Ziele für diese Saison – Was willst du kommende Saison erreichen?" },
                { id: "p-q3", type: "text", label: "Schule" },
            ] },
        { id: "p-t2", label: "Mein Körper", questions: [
                { id: "p-q4", type: "text", label: "Verletzungshistorie" },
                { id: "p-q5", type: "text", label: "Meine athletischen Ziele" },
            ] },
        { id: "p-t3", label: "Mein Verhalten im Team", questions: [
                { id: "p-q6", type: "text", label: "Wie nimmst du dich auf dem Spielfeld wahr?" },
                { id: "p-q7", type: "text", label: "Wie glaubst du, nehmen dich die anderen Spieler wahr?" },
            ] },
        { id: "p-t4", label: "Häufige Situationen & NOCH nicht häufige Situationen", questions: [
                { id: "p-q8", type: "situationPair", label: "Situation 1" },
                { id: "p-q9", type: "situationPair", label: "Situation 2" },
                { id: "p-q10", type: "text", label: "Was sind die 1-2 Fähigkeiten, die dein Spiel überragend machen würden?" },
            ] },
    ],
    trainer: [
        { id: "t-t1", label: "Körper", questions: [
                { id: "t-q1", type: "text", label: "Spielt der Spieler physisch in seinen Möglichkeiten?" },
                { id: "t-q2", type: "text", label: "Athletische Ziele des Spielers" },
                { id: "t-q3", type: "text", label: "Kommentar Athletiktrainer" },
                { id: "t-q4", type: "text", label: "Werte nach Athletiktestung" },
                { id: "t-q5", type: "date", label: "Datum der Testung" },
            ] },
        { id: "t-t2", label: "Verhalten im Team", questions: [
                { id: "t-q6", type: "text", label: "Wir nehmen dich auf dem Spielfeld wie folgt wahr" },
                { id: "t-q7", type: "text", label: "Wir haben die Wahrnehmung, dass du dich wie folgt auf dem Feld wahrnimmst" },
            ] },
        { id: "t-t3", label: "Häufige Situationen & NOCH nicht häufige Situationen", questions: [
                { id: "t-q8", type: "situationPair", label: "Situation 1" },
                { id: "t-q9", type: "situationPair", label: "Situation 2" },
                { id: "t-q10", type: "text", label: "Was sind die 1-2 Fähigkeiten, die sein Spiel überragend machen würden?" },
            ] },
        { id: "t-t4", label: "Interventionen & Teaching Points (nur Trainer)", questions: [
                { id: "t-q11", type: "text", label: "Intervention im KGT 1" },
                { id: "t-q12", type: "text", label: "Intervention im KGT 2" },
                { id: "t-q13", type: "text", label: "Teaching Point im TT 1" },
                { id: "t-q14", type: "text", label: "Teaching Point im TT 2" },
                { id: "t-q15", type: "date", label: "Nächster Check-In" },
            ] },
    ],
    combined: [
        { id: "c-t1", label: "Selbstbild & Ziele", questions: [
                { id: "c-q1", type: "text", label: "Long Range Goals" },
                { id: "c-q2", type: "text", label: "Next Season Goals" },
                { id: "c-q3", type: "text", label: "Schule" },
            ] },
        { id: "c-t2", label: "Körper", questions: [
                { id: "c-q4", type: "text", label: "Verletzungshistorie" },
                { id: "c-q5", type: "text", label: "Athletische Ziele" },
                { id: "c-q6", type: "text", label: "Kommentar Athletiktrainer" },
                { id: "c-q7", type: "text", label: "Werte nach Athletiktestung" },
                { id: "c-q8", type: "date", label: "Datum der Testung" },
            ] },
        { id: "c-t3", label: "Verhalten im Team", questions: [
                { id: "c-q9", type: "text", label: "So nimmt der Spieler sich selbst auf dem Feld wahr" },
                { id: "c-q10", type: "text", label: "So nehmen wir als Trainerteam ihn auf dem Feld wahr" },
            ] },
        { id: "c-t4", label: "Häufige Situationen & NOCH nicht häufige Situationen", questions: [
                { id: "c-q11", type: "situationPair", label: "Situation 1" },
                { id: "c-q12", type: "situationPair", label: "Situation 2" },
                { id: "c-q13", type: "text", label: "Was sind die 1-2 Fähigkeiten, die dein Spiel überragend machen würden?" },
                { id: "c-q14", type: "date", label: "Nächster Check-In" },
            ] },
    ],
};
function DPQuestionField({ q, value, onChange, readOnly }) {
    if (q.type === "situationPair") {
        const v = value || {};
        return (React.createElement("div", { className: "mb-3" },
            React.createElement("p", { className: "text-sm font-semibold text-slate-700 mb-1.5" }, q.label),
            React.createElement("div", { className: "grid grid-cols-2 gap-3" }, ["off", "def"].map((side) => (React.createElement("div", { key: side, className: "bg-stone-50 rounded-xl p-2.5" },
                React.createElement("p", { className: "text-xs font-bold text-slate-500 uppercase mb-1" }, side === "off" ? "Offensiv" : "Defensiv"),
                readOnly ? (React.createElement(React.Fragment, null,
                    React.createElement("p", { className: "text-xs text-slate-800 whitespace-pre-wrap mb-1" }, v[`${side}Text`] || "–"),
                    React.createElement("p", { className: "text-[11px] text-slate-400" },
                        "Videostelle: ",
                        v[`${side}Video`] || "–"))) : (React.createElement(React.Fragment, null,
                    React.createElement("textarea", { className: inputClass + " text-xs mb-1", rows: 2, value: v[`${side}Text`] || "", onChange: (e) => onChange({ ...v, [`${side}Text`]: e.target.value }) }),
                    React.createElement("input", { className: inputClass + " text-xs", placeholder: "Videostelle (Min:Sek)", value: v[`${side}Video`] || "", onChange: (e) => onChange({ ...v, [`${side}Video`]: e.target.value }) })))))))));
    }
    if (q.type === "date") {
        return (React.createElement("div", { className: "mb-3" },
            React.createElement("p", { className: "text-sm font-semibold text-slate-700 mb-1" }, q.label),
            readOnly ? React.createElement("p", { className: "text-sm text-slate-800" }, value ? fmtDate(value) : "–") : React.createElement("input", { type: "date", className: inputClass, value: value || "", onChange: (e) => onChange(e.target.value) })));
    }
    return (React.createElement("div", { className: "mb-3" },
        React.createElement("p", { className: "text-sm font-semibold text-slate-700" }, q.label),
        readOnly ? (React.createElement("p", { className: "text-sm text-slate-800 bg-stone-50 rounded-lg p-2.5 mt-1 whitespace-pre-wrap min-h-[2.5rem]" }, value || "–")) : (React.createElement("textarea", { className: inputClass + " mt-1", rows: 2, value: value || "", onChange: (e) => onChange(e.target.value) }))));
}
function DynamicDevPlanForm({ template, answers, onSave, onRelease, readOnly, showRelease }) {
    const [form, setForm] = useState(() => ({ ...(answers || {}) }));
    function setAnswer(qId, val) {
        setForm((f) => ({ ...f, [qId]: val }));
    }
    return (React.createElement("div", { className: "space-y-5" },
        template.map((theme, i) => (React.createElement("div", { key: theme.id },
            React.createElement(DevPlanThemeHeader, { n: i + 1, label: theme.label }),
            theme.questions.map((q) => (React.createElement(DPQuestionField, { key: q.id, q: q, value: form[q.id], onChange: (v) => setAnswer(q.id, v), readOnly: readOnly })))))),
        !readOnly && (React.createElement("div", { className: "flex gap-2 sticky bottom-0 bg-white pt-3 border-t border-stone-100" },
            React.createElement("button", { onClick: () => onSave(form), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold" }, "Speichern"),
            showRelease && (React.createElement("button", { onClick: () => { onSave(form); onRelease(); }, className: "flex-1 bg-[#C43E0E] hover:bg-[#A8350C] text-white rounded-lg py-2.5 text-sm font-semibold" }, "Speichern & Freigeben"))))));
}
function DevPlanThemeHeader({ n, label }) {
    return (React.createElement("div", { className: "flex items-center gap-2 mb-2" },
        React.createElement("span", { className: "w-5 h-5 rounded-full bg-[#C43E0E] text-white text-[10px] font-bold flex items-center justify-center shrink-0" }, n),
        React.createElement("p", { className: "text-xs font-bold text-slate-500 uppercase tracking-wide" }, label)));
}
function DevPlanTemplateEditor({ templates, onSave, onClose }) {
    const [formType, setFormType] = useState("player");
    const [data, setData] = useState(() => JSON.parse(JSON.stringify(templates)));
    const FORM_TYPE_LABELS = { player: "Spieler-Bogen", trainer: "Trainer-Bogen", combined: "Zusammengefasst" };
    const themes = data[formType];
    function addTheme() {
        setData((d) => ({ ...d, [formType]: [...d[formType], { id: uid(), label: "Neues Thema", questions: [] }] }));
    }
    function renameTheme(themeId, label) {
        setData((d) => ({ ...d, [formType]: d[formType].map((t) => (t.id === themeId ? { ...t, label } : t)) }));
    }
    function deleteTheme(themeId) {
        setData((d) => ({ ...d, [formType]: d[formType].filter((t) => t.id !== themeId) }));
    }
    function moveTheme(themeId, dir) {
        setData((d) => {
            const arr = [...d[formType]];
            const i = arr.findIndex((t) => t.id === themeId);
            const j = i + dir;
            if (j < 0 || j >= arr.length)
                return d;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            return { ...d, [formType]: arr };
        });
    }
    function addQuestion(themeId, type) {
        setData((d) => ({
            ...d,
            [formType]: d[formType].map((t) => (t.id === themeId ? { ...t, questions: [...t.questions, { id: uid(), type, label: type === "situationPair" ? "Neue Situation" : "Neue Frage" }] } : t)),
        }));
    }
    function renameQuestion(themeId, qId, label) {
        setData((d) => ({
            ...d,
            [formType]: d[formType].map((t) => (t.id === themeId ? { ...t, questions: t.questions.map((q) => (q.id === qId ? { ...q, label } : q)) } : t)),
        }));
    }
    function deleteQuestion(themeId, qId) {
        setData((d) => ({
            ...d,
            [formType]: d[formType].map((t) => (t.id === themeId ? { ...t, questions: t.questions.filter((q) => q.id !== qId) } : t)),
        }));
    }
    function moveQuestion(themeId, qId, dir) {
        setData((d) => ({
            ...d,
            [formType]: d[formType].map((t) => {
                if (t.id !== themeId)
                    return t;
                const arr = [...t.questions];
                const i = arr.findIndex((q) => q.id === qId);
                const j = i + dir;
                if (j < 0 || j >= arr.length)
                    return t;
                [arr[i], arr[j]] = [arr[j], arr[i]];
                return { ...t, questions: arr };
            }),
        }));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex gap-1.5" }, Object.entries(FORM_TYPE_LABELS).map(([k, l]) => (React.createElement("button", { key: k, onClick: () => setFormType(k), className: `px-3 py-1.5 rounded-lg text-sm font-medium ${formType === k ? "bg-slate-900 text-white" : "bg-stone-100 text-slate-600"}` }, l)))),
        React.createElement("div", { className: "space-y-3 max-h-[50vh] overflow-y-auto pr-1" }, themes.map((theme, ti) => (React.createElement("div", { key: theme.id, className: "bg-stone-50 rounded-xl p-3" },
            React.createElement("div", { className: "flex items-center gap-2 mb-2" },
                React.createElement("input", { className: inputClass + " font-semibold", value: theme.label, onChange: (e) => renameTheme(theme.id, e.target.value) }),
                React.createElement("button", { onClick: () => moveTheme(theme.id, -1), disabled: ti === 0, className: "text-slate-400 hover:text-slate-700 disabled:opacity-30" },
                    React.createElement(IconArrowUp, { size: 14 })),
                React.createElement("button", { onClick: () => moveTheme(theme.id, 1), disabled: ti === themes.length - 1, className: "text-slate-400 hover:text-slate-700 disabled:opacity-30" },
                    React.createElement(IconArrowDown, { size: 14 })),
                React.createElement("button", { onClick: () => deleteTheme(theme.id), className: "text-slate-300 hover:text-red-500" },
                    React.createElement(IconTrash, { size: 14 }))),
            React.createElement("div", { className: "space-y-1.5 mb-2" }, theme.questions.map((q, qi) => (React.createElement("div", { key: q.id, className: "flex items-center gap-2 bg-white rounded-lg px-2 py-1.5" },
                React.createElement("span", { className: "text-[10px] font-semibold text-slate-400 uppercase w-16 shrink-0" }, q.type === "situationPair" ? "Situation" : q.type === "date" ? "Datum" : "Text"),
                React.createElement("input", { className: inputClass + " text-sm", value: q.label, onChange: (e) => renameQuestion(theme.id, q.id, e.target.value) }),
                React.createElement("button", { onClick: () => moveQuestion(theme.id, q.id, -1), disabled: qi === 0, className: "text-slate-400 hover:text-slate-700 disabled:opacity-30 shrink-0" },
                    React.createElement(IconArrowUp, { size: 13 })),
                React.createElement("button", { onClick: () => moveQuestion(theme.id, q.id, 1), disabled: qi === theme.questions.length - 1, className: "text-slate-400 hover:text-slate-700 disabled:opacity-30 shrink-0" },
                    React.createElement(IconArrowDown, { size: 13 })),
                React.createElement("button", { onClick: () => deleteQuestion(theme.id, q.id), className: "text-slate-300 hover:text-red-500 shrink-0" },
                    React.createElement(IconTrash, { size: 13 })))))),
            React.createElement("div", { className: "flex gap-1.5" },
                React.createElement("button", { onClick: () => addQuestion(theme.id, "text"), className: "text-xs font-medium bg-stone-200 hover:bg-stone-300 text-slate-700 rounded-lg px-2 py-1" }, "+ Textfrage"),
                React.createElement("button", { onClick: () => addQuestion(theme.id, "situationPair"), className: "text-xs font-medium bg-stone-200 hover:bg-stone-300 text-slate-700 rounded-lg px-2 py-1" }, "+ Situation (Off/Def)"),
                React.createElement("button", { onClick: () => addQuestion(theme.id, "date"), className: "text-xs font-medium bg-stone-200 hover:bg-stone-300 text-slate-700 rounded-lg px-2 py-1" }, "+ Datumsfeld")))))),
        React.createElement("button", { onClick: addTheme, className: "w-full border-2 border-dashed border-stone-300 rounded-xl py-2 text-sm font-medium text-slate-500 hover:border-[#C43E0E] hover:text-[#C43E0E] transition" }, "+ Neues Thema"),
        React.createElement("button", { onClick: () => { onSave(data); onClose(); }, className: "w-full bg-[#C43E0E] hover:bg-[#A8350C] text-white rounded-lg py-2.5 text-sm font-semibold" }, "Vorlage speichern")));
}
function DevelopmentPlanPanel({ player, isTrainer, cycles, templates, onCreateCycle, onSavePlayer, onReleasePlayer, onSaveTrainer, onReleaseTrainer, onSaveCombined, onDeleteCycle }) {
    const [openCycleId, setOpenCycleId] = useState(null);
    const [view, setView] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const sorted = sortByDateDesc(cycles);
    const openCycle = sorted.find((c) => c.id === openCycleId);
    if (openCycle && view) {
        const playerDoc = openCycle.player || {};
        const trainerDoc = openCycle.trainer || {};
        const combinedDoc = openCycle.combined || {};
        return (React.createElement("div", { className: "p-4 md:p-6 max-w-3xl mx-auto" },
            React.createElement("button", { onClick: () => setView(null), className: "flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-3" },
                React.createElement(IconArrowLeft, { size: 13 }),
                " Zur\u00FCck zur \u00DCbersicht"),
            view === "player" && (React.createElement(DynamicDevPlanForm, { template: templates.player, answers: playerDoc.answers, readOnly: isTrainer || !!playerDoc.released, showRelease: !playerDoc.released, onSave: (vals) => onSavePlayer(openCycle.id, vals), onRelease: () => onReleasePlayer(openCycle.id) })),
            view === "trainer" && (React.createElement(DynamicDevPlanForm, { template: templates.trainer, answers: trainerDoc.answers, readOnly: !isTrainer || !!trainerDoc.released, showRelease: !trainerDoc.released, onSave: (vals) => onSaveTrainer(openCycle.id, vals), onRelease: () => onReleaseTrainer(openCycle.id) })),
            view === "combined" && (React.createElement(DynamicDevPlanForm, { template: templates.combined, answers: combinedDoc.answers, readOnly: !isTrainer, showRelease: false, onSave: (vals) => onSaveCombined(openCycle.id, vals) }))));
    }
    if (openCycle) {
        const playerDoc = openCycle.player || {};
        const trainerDoc = openCycle.trainer || {};
        const bothReleased = playerDoc.released && trainerDoc.released;
        return (React.createElement("div", { className: "max-w-3xl" },
            React.createElement("button", { onClick: () => setOpenCycleId(null), className: "flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-4" },
                React.createElement(IconArrowLeft, { size: 13 }),
                " Zurück zur Übersicht"),
            React.createElement("div", { className: "flex items-center justify-between mb-4" },
                React.createElement(SectionLabel, null, fmtDate(openCycle.date)),
                isTrainer && (confirmDelete ? (React.createElement("span", { className: "flex items-center gap-2 text-xs" },
                    React.createElement("span", { className: "text-slate-500" }, "Wirklich löschen?"),
                    React.createElement("button", { onClick: () => onDeleteCycle(openCycle.id), className: "text-white bg-red-600 hover:bg-red-700 rounded-lg px-2 py-1 font-semibold" }, "Ja, löschen"),
                    React.createElement("button", { onClick: () => setConfirmDelete(false), className: "text-slate-500 hover:text-slate-800" }, "Abbrechen"))) : (React.createElement("button", { onClick: () => setConfirmDelete(true), className: "text-slate-300 hover:text-red-500", "aria-label": "Zyklus löschen" },
                    React.createElement(IconTrash, { size: 15 }))))),
            React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4" },
                React.createElement("button", { onClick: () => setView("player"), className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all" },
                    React.createElement("span", { className: "w-9 h-9 rounded-xl bg-gradient-to-br from-[#C43E0E] to-[#A8350C] text-white flex items-center justify-center mb-3" },
                        React.createElement(IconUsers, { size: 16 })),
                    React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, "Spieler-Bogen"),
                    React.createElement("p", { className: `text-xs mt-1 font-medium ${playerDoc.released ? "text-emerald-600" : "text-slate-400"}` }, playerDoc.released ? "✓ Freigegeben" : "Entwurf")),
                (isTrainer || trainerDoc?.released) && (React.createElement("button", { onClick: () => setView("trainer"), className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all" },
                    React.createElement("span", { className: "w-9 h-9 rounded-xl bg-gradient-to-br from-[#C43E0E] to-[#8A2C0A] text-white flex items-center justify-center mb-3" },
                        React.createElement(IconClipboard, { size: 16 })),
                    React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, "Trainer-Bogen"),
                    React.createElement("p", { className: `text-xs mt-1 font-medium ${trainerDoc.released ? "text-emerald-600" : "text-slate-400"}` }, trainerDoc.released ? "✓ Freigegeben" : "Entwurf"))),
                (isTrainer || bothReleased) && (React.createElement("button", { onClick: () => setView("combined"), className: "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all" },
                    React.createElement("span", { className: "w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center mb-3" },
                        React.createElement(IconCheck, { size: 16 })),
                    React.createElement("p", { className: "text-sm font-semibold text-slate-800" }, "Zusammengefasst"),
                    React.createElement("p", { className: "text-xs mt-1 text-slate-400 font-medium" }, bothReleased ? "Bereit fürs Meeting" : "Beide Bögen erst freigeben"))))));
    }
    return (React.createElement("div", { className: "max-w-3xl space-y-5" },
        React.createElement("div", { className: "flex items-center justify-between flex-wrap gap-2" },
            React.createElement(SectionLabel, null, "Development Plan"),
            isTrainer && (React.createElement("button", { onClick: onCreateCycle, className: btnPrimaryClass + " text-sm px-3.5 py-2" },
                React.createElement(IconPlus, { size: 14 }),
                " Neuer Development-Plan"))),
        sorted.length === 0 ? (React.createElement("div", { className: `${cardClass} flex flex-col items-center justify-center gap-2 py-14 text-center` },
            React.createElement(IconClipboard, { size: 28, className: "text-stone-300" }),
            React.createElement("p", { className: "text-sm text-slate-400" }, "Noch kein Development Plan angelegt."))) : (React.createElement("div", { className: "space-y-2.5" }, sorted.map((c) => {
            const pRel = c.player?.released;
            const tRel = c.trainer?.released;
            return (React.createElement("button", { key: c.id, onClick: () => setOpenCycleId(c.id), className: "w-full flex items-center justify-between bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] p-4 text-left hover:shadow-md transition" },
                React.createElement("span", { className: "flex items-center gap-2.5 text-sm font-semibold text-slate-800" },
                    React.createElement(IconCalendar, { size: 14, className: "text-slate-400" }),
                    fmtDate(c.date)),
                React.createElement("span", { className: "flex items-center gap-1.5 text-xs" },
                    React.createElement("span", { className: `px-2 py-0.5 rounded-full font-medium ${pRel ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-slate-500"}` },
                        "Spieler ",
                        pRel ? "✓" : "…"),
                    React.createElement("span", { className: `px-2 py-0.5 rounded-full font-medium ${tRel ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-slate-500"}` },
                        "Trainer ",
                        tRel ? "✓" : "…"))));
        })))));
}
function TeamNoteForm({ teams, players, defaultTeamId, onSubmit, onClose }) {
    const [teamId, setTeamId] = useState(defaultTeamId || "");
    const [date, setDate] = useState(today());
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [file, setFile] = useState(null);
    const [sharedWithAll, setSharedWithAll] = useState(false);
    const [sharedWithPlayerIds, setSharedWithPlayerIds] = useState([]);
    const [pickPlayerId, setPickPlayerId] = useState("");
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const teamPlayers = players.filter((p) => p.teamId === teamId);
    const pickablePlayers = teamPlayers.filter((p) => !sharedWithPlayerIds.includes(p.id));
    function addPlayer() {
        if (!pickPlayerId)
            return;
        setSharedWithPlayerIds((prev) => [...prev, pickPlayerId]);
        setPickPlayerId("");
    }
    function removePlayer(id) {
        setSharedWithPlayerIds((prev) => prev.filter((x) => x !== id));
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!teamId) {
            setError("Bitte ein Team auswählen.");
            return;
        }
        if (!title.trim()) {
            setError("Bitte einen Titel angeben.");
            return;
        }
        const entry = { teamId, date, title: title.trim(), text: text.trim(), sharedWithAll, sharedWithPlayerIds };
        if (file) {
            setUploading(true);
            try {
                const result = await uploadToCloudinary(file);
                entry.attachmentUrl = result.url;
                entry.attachmentName = file.name;
            }
            catch (err) {
                setUploading(false);
                setError("Datei-Upload fehlgeschlagen. Bitte nochmal versuchen (oder ohne Anhang speichern).");
                return;
            }
            setUploading(false);
        }
        onSubmit(entry);
        onClose();
    }
    return (React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" },
        React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Team" },
                React.createElement("select", { className: inputClass, value: teamId, onChange: (e) => { setTeamId(e.target.value); setSharedWithPlayerIds([]); setError(""); } },
                    React.createElement("option", { value: "" }, "\u2013 ausw\u00E4hlen \u2013"),
                    teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name)))),
            React.createElement(Field, { label: "Datum" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) }))),
        React.createElement(Field, { label: "Titel" },
            React.createElement("input", { className: inputClass, value: title, onChange: (e) => { setTitle(e.target.value); setError(""); }, placeholder: "z. B. Hallenzeiten Herbst" })),
        React.createElement(Field, { label: "Text (optional)" },
            React.createElement("textarea", { className: inputClass, rows: 3, value: text, onChange: (e) => setText(e.target.value), placeholder: "Kurzer Hinweistext, falls hilfreich" })),
        React.createElement(Field, { label: "PDF oder Datei anh\u00E4ngen (optional)" },
            React.createElement("input", { type: "file", accept: "application/pdf,image/*", onChange: (e) => setFile(e.target.files[0] || null), className: "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }),
            file && React.createElement("p", { className: "text-xs text-slate-500 mt-1" },
                "Ausgew\u00E4hlt: ",
                file.name)),
        React.createElement("div", { className: "bg-stone-50 rounded-xl p-3 space-y-3" },
            React.createElement("label", { className: "flex items-center gap-2 text-sm font-medium text-slate-700" },
                React.createElement("input", { type: "checkbox", className: "rounded", checked: sharedWithAll, onChange: (e) => setSharedWithAll(e.target.checked) }),
                "F\u00FCr alle Spieler/Eltern dieses Teams sichtbar"),
            React.createElement("div", null,
                React.createElement("p", { className: "text-xs font-semibold text-slate-500 mb-1.5" }, "Sichtbar f\u00FCr Spieler (einzeln ausw\u00E4hlen)"),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("select", { className: inputClass, value: pickPlayerId, onChange: (e) => setPickPlayerId(e.target.value), disabled: !teamId },
                        React.createElement("option", { value: "" }, teamId ? "– Spieler wählen –" : "Erst Team wählen"),
                        pickablePlayers.map((p) => React.createElement("option", { key: p.id, value: p.id }, p.name))),
                    React.createElement("button", { type: "button", onClick: addPlayer, className: "shrink-0 bg-stone-200 hover:bg-stone-300 text-slate-700 rounded-lg px-3 text-sm font-medium" }, "Hinzuf\u00FCgen")),
                sharedWithPlayerIds.length > 0 && (React.createElement("div", { className: "flex flex-wrap gap-1.5 mt-2" }, sharedWithPlayerIds.map((id) => {
                    const p = teamPlayers.find((tp) => tp.id === id);
                    return (React.createElement("span", { key: id, className: "flex items-center gap-1 text-xs bg-white border border-stone-200 rounded-full pl-2.5 pr-1 py-1" },
                        p?.name || "?",
                        React.createElement("button", { type: "button", onClick: () => removePlayer(id), className: "text-slate-400 hover:text-red-500" },
                            React.createElement(IconX, { size: 12 }))));
                }))))),
        error && React.createElement("p", { className: "text-xs text-red-600" }, error),
        React.createElement("button", { type: "submit", disabled: uploading, className: "w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60" }, uploading ? "Wird hochgeladen…" : "Team-Notiz speichern")));
}
function ScreenshotImportModal({ teams, allPlayers, onConfirm, onClose }) {
    const [stage, setStage] = useState("setup");
    const [targetKind, setTargetKind] = useState("team");
    const [targetTeam, setTargetTeam] = useState("");
    const [targetPlayerId, setTargetPlayerId] = useState("");
    const [numDays, setNumDays] = useState(7);
    const [weekConfirmed, setWeekConfirmed] = useState(null);
    const [customWeek, setCustomWeek] = useState("");
    const [customYear, setCustomYear] = useState(String(new Date().getFullYear()));
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [parseError, setParseError] = useState("");
    const [rows, setRows] = useState([]);
    const [included, setIncluded] = useState({});
    const [typeById, setTypeById] = useState({});
    const [optionalById, setOptionalById] = useState({});
    const [bulkType, setBulkType] = useState("tt");
    const playerOptionLabel = (p) => `${p.name}${p.teamId ? " (" + (teams.find((t) => t.id === p.teamId)?.name || "") + ")" : ""}`;
    const defaultMonday = currentWeekMonday();
    const effectiveMonday = weekConfirmed === false && customWeek ? mondayOfIsoWeek(Number(customYear) || defaultMonday.getFullYear(), Number(customWeek)) : defaultMonday;
    async function handleFile(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setParseError("");
        const imgUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            setStage("processing");
            setProgress({ done: 0, total: 0 });
            try {
                const events = await extractEventsFromCalendarScreenshot(img, effectiveMonday, numDays, (done, total) => setProgress({ done, total }));
                URL.revokeObjectURL(imgUrl);
                if (events.length === 0) {
                    setParseError("Es konnten keine Termine im Bild erkannt werden - weder Kästchen/Tabellenraster noch eine Textliste mit Datum/Wochentag und Uhrzeit je Zeile. Bitte einen anderen Ausschnitt versuchen (unbeschnitten, gut lesbar) oder die Termine manuell anlegen.");
                    setStage("setup");
                    return;
                }
                const inc = {}, ty = {}, opt = {};
                events.forEach((ev) => { inc[ev.id] = true; ty[ev.id] = guessCategoryFromTitle(ev.title); opt[ev.id] = false; });
                setRows(events);
                setIncluded(inc);
                setTypeById(ty);
                setOptionalById(opt);
                setStage("review");
            }
            catch (err) {
                setParseError("Bilderkennung fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
                setStage("setup");
            }
        };
        img.onerror = () => setParseError("Bild konnte nicht geladen werden.");
        img.src = imgUrl;
    }
    function toggleIncluded(id) {
        setIncluded((prev) => ({ ...prev, [id]: !prev[id] }));
    }
    function updateRow(id, changes) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    }
    function applyBulkType() {
        setTypeById((prev) => {
            const next = { ...prev };
            rows.forEach((r) => { if (included[r.id])
                next[r.id] = bulkType; });
            return next;
        });
    }
    function handleConfirm() {
        const events = rows.filter((r) => included[r.id]).map((r) => ({
            title: optionalById[r.id] ? `${r.title} (optional)` : r.title, date: r.date, time: r.time, endTime: r.endTime || "", location: "",
            teamId: targetKind === "team" && targetTeam && targetTeam !== "individuell" ? targetTeam : null,
            includedPlayerIds: targetKind === "player" && targetPlayerId ? [targetPlayerId] : [],
            type: typeById[r.id] || "tt",
        }));
        onConfirm(events);
        onClose();
    }
    const includedCount = Object.values(included).filter(Boolean).length;
    const targetChosen = targetKind === "team" ? targetTeam !== "" : targetKind === "player" ? targetPlayerId !== "" : true;
    const weekOk = weekConfirmed === true || (weekConfirmed === false && customWeek !== "");
    const canUpload = targetChosen && weekOk;
    if (stage === "setup") {
        const intro = React.createElement("p", { className: "text-xs text-slate-500" }, "Screenshot einer Wochenansicht hochladen - egal ob farbige Kästchen (z. B. Google Calendar, auch im Dark Mode), eine Tabelle mit Rasterlinien (Excel/Sheets-Export) oder eine reine Textliste (z. B. Listenansicht, Trainingsplan als Fließtext). Die App erkennt Titel und Uhrzeit automatisch (auch 12h-Format wie \"6:00 PM\") und zeigt danach alles zur Kontrolle an. Die Erkennung ist nicht perfekt – bitte vor dem Speichern prüfen.");
        const targetKindButtons = React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { type: "button", onClick: () => setTargetKind("team"), className: `flex-1 rounded-lg py-2 text-xs font-semibold border transition ${targetKind === "team" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-stone-300 hover:border-slate-400"}` }, "Team"),
            React.createElement("button", { type: "button", onClick: () => setTargetKind("player"), className: `flex-1 rounded-lg py-2 text-xs font-semibold border transition ${targetKind === "player" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-stone-300 hover:border-slate-400"}` }, "Einzelner Spieler"),
            React.createElement("button", { type: "button", onClick: () => setTargetKind("individuell"), className: `flex-1 rounded-lg py-2 text-xs font-semibold border transition ${targetKind === "individuell" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-stone-300 hover:border-slate-400"}` }, "Niemand zugeordnet"));
        const teamSelectField = targetKind === "team" ? React.createElement(Field, { label: "Team" },
            React.createElement("select", { className: inputClass, value: targetTeam, onChange: (e) => setTargetTeam(e.target.value) },
                React.createElement("option", { value: "" }, "– Bitte Team wählen –"),
                teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name)))) : null;
        const playerSelectField = targetKind === "player" ? React.createElement(Field, { label: "Spieler" },
            React.createElement("select", { className: inputClass, value: targetPlayerId, onChange: (e) => setTargetPlayerId(e.target.value) },
                React.createElement("option", { value: "" }, "– Bitte Spieler wählen –"),
                (allPlayers || []).map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))) : null;
        const targetField = React.createElement(Field, { label: "Für wen ist dieser individuelle Trainingsplan?" }, targetKindButtons, teamSelectField, playerSelectField);
        const weekQuestionText = React.createElement("p", { className: "text-sm text-slate-700" }, `Ist das die Woche vom ${formatWeekRange(defaultMonday)} (aktuelle Woche)?`);
        const weekYesNo = React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { type: "button", onClick: () => setWeekConfirmed(true), className: `flex-1 rounded-lg py-2 text-sm font-semibold border transition ${weekConfirmed === true ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-stone-300 hover:border-slate-400"}` }, "Ja"),
            React.createElement("button", { type: "button", onClick: () => setWeekConfirmed(false), className: `flex-1 rounded-lg py-2 text-sm font-semibold border transition ${weekConfirmed === false ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-stone-300 hover:border-slate-400"}` }, "Nein, andere Woche"));
        const customWeekFields = weekConfirmed === false ? React.createElement("div", { className: "grid grid-cols-2 gap-3" },
            React.createElement(Field, { label: "Kalenderwoche (KW)" },
                React.createElement("input", { type: "number", min: "1", max: "53", className: inputClass, value: customWeek, onChange: (e) => setCustomWeek(e.target.value) })),
            React.createElement(Field, { label: "Jahr" },
                React.createElement("input", { type: "number", className: inputClass, value: customYear, onChange: (e) => setCustomYear(e.target.value) }))) : null;
        const resolvedWeekNote = weekOk ? React.createElement("p", { className: "text-xs text-slate-400" }, `Verwendetes Datum: Woche vom ${formatWeekRange(effectiveMonday)}`) : null;
        const weekSection = React.createElement("div", { className: "space-y-2 bg-stone-50 rounded-lg p-3" }, weekQuestionText, weekYesNo, customWeekFields, resolvedWeekNote);
        const daysField = React.createElement(Field, { label: "Wie viele Tage zeigt der Screenshot?" },
            React.createElement("select", { className: inputClass, value: numDays, onChange: (e) => setNumDays(Number(e.target.value)) }, [1, 2, 3, 4, 5, 6, 7].map((n) => React.createElement("option", { key: n, value: n }, n))));
        const uploadLabel = React.createElement("label", { className: `flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 transition ${canUpload ? "border-stone-300 cursor-pointer hover:border-[#C43E0E] hover:bg-red-50/30" : "border-stone-200 opacity-50 cursor-not-allowed"}` },
            React.createElement(IconUpload, { size: 24, className: "text-slate-400" }),
            React.createElement("span", { className: "text-sm text-slate-600 font-medium" }, canUpload ? "Screenshot auswählen" : "Erst Ziel und Woche oben angeben"),
            React.createElement("input", { type: "file", accept: "image/*", className: "hidden", disabled: !canUpload, onChange: handleFile }));
        const errorNote = parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError);
        return React.createElement("div", { className: "space-y-4" }, intro, targetField, weekSection, daysField, uploadLabel, errorNote);
    }
    if (stage === "processing") {
        const progressText = progress.total > 0 ? `Kästchen ${progress.done} / ${progress.total} wird gelesen…` : "Kästchen werden erkannt…";
        return React.createElement("div", { className: "flex flex-col items-center justify-center gap-3 py-14" },
            React.createElement(IconLoader, { size: 28, className: "text-slate-400" }),
            React.createElement("p", { className: "text-sm text-slate-600" }, progressText),
            React.createElement("p", { className: "text-xs text-slate-400" }, "Das kann je nach Anzahl der Termine einen Moment dauern."));
    }
    const typeOptionEls = Object.entries(EVENT_TYPE_STYLES).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.label));
    const bulkControls = React.createElement("div", { className: "flex items-center gap-2 flex-wrap bg-stone-50 rounded-lg p-3" },
        React.createElement("span", { className: "text-xs font-semibold text-slate-500" }, "Für ausgewählte Zeilen:"),
        React.createElement("select", { className: "text-xs rounded border border-stone-300 px-2 py-1.5", value: bulkType, onChange: (e) => setBulkType(e.target.value) }, typeOptionEls),
        React.createElement("button", { type: "button", onClick: applyBulkType, className: "text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" }, "Typ setzen"));
    const tableRows = rows.map((r) => {
        const checkboxCell = React.createElement("td", { className: "px-2 py-1.5" },
            React.createElement("input", { type: "checkbox", checked: !!included[r.id], onChange: () => toggleIncluded(r.id) }));
        const titleCell = React.createElement("td", { className: "px-2.5 py-1.5" },
            React.createElement("input", { className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: r.title, onChange: (e) => updateRow(r.id, { title: e.target.value }) }));
        const dateCell = React.createElement("td", { className: "px-2.5 py-1.5" },
            React.createElement("input", { type: "date", className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: r.date, onChange: (e) => updateRow(r.id, { date: e.target.value }) }));
        const timeCell = React.createElement("td", { className: "px-2.5 py-1.5" },
            React.createElement("input", { type: "time", className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: r.time, onChange: (e) => updateRow(r.id, { time: e.target.value }) }));
        const endTimeCell = React.createElement("td", { className: "px-2.5 py-1.5" },
            React.createElement("input", { type: "time", className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: r.endTime || "", onChange: (e) => updateRow(r.id, { endTime: e.target.value }) }));
        const typeCell = React.createElement("td", { className: "px-2.5 py-1.5" },
            React.createElement("select", { className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: typeById[r.id] || "tt", onChange: (e) => setTypeById((prev) => ({ ...prev, [r.id]: e.target.value })) }, typeOptionEls));
        const optionalCell = React.createElement("td", { className: "px-2 py-1.5 text-center" },
            React.createElement("input", { type: "checkbox", checked: !!optionalById[r.id], title: "Als optional markieren", onChange: () => setOptionalById((prev) => ({ ...prev, [r.id]: !prev[r.id] })) }));
        return React.createElement("tr", { key: r.id, className: `border-t border-stone-100 ${included[r.id] ? "" : "opacity-40"}` }, checkboxCell, titleCell, dateCell, timeCell, endTimeCell, typeCell, optionalCell);
    });
    const tableHead = React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
        React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
            React.createElement("th", { className: "px-2 py-2" }),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Titel"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Datum"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Von"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Bis"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Typ"),
            React.createElement("th", { className: "text-center px-2 py-2" }, "Opt.")));
    const table = React.createElement("div", { className: "max-h-[45vh] overflow-y-auto overflow-x-auto border border-stone-200 rounded-lg" },
        React.createElement("table", { className: "w-full min-w-[640px] text-xs" }, tableHead, React.createElement("tbody", null, tableRows)));
    const hint = React.createElement("p", { className: "text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, "Titel, Datum und Uhrzeit sind editierbar – bitte kurz gegenprüfen, die automatische Erkennung kann sich vertun.");
    const targetName = targetKind === "team" ? (teams.find((t) => t.id === targetTeam)?.name || "–") : targetKind === "player" ? ((allPlayers || []).find((p) => p.id === targetPlayerId)?.name || "–") : "Niemand zugeordnet";
    const targetNote = React.createElement("p", { className: "text-xs text-slate-400" },
        "Ziel dieses Imports: ",
        React.createElement("span", { className: "font-semibold text-slate-600" }, targetName));
    const actionButtons = React.createElement("div", { className: "flex gap-2" },
        React.createElement("button", { onClick: () => setStage("setup"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Anderer Screenshot"),
        React.createElement("button", { onClick: handleConfirm, disabled: includedCount === 0, className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" }, includedCount, " Termine importieren"));
    return React.createElement("div", { className: "space-y-4" }, hint, targetNote, bulkControls, table, actionButtons);
}
function IcsImportModal({ teams, onConfirm, onClose }) {
    const [stage, setStage] = useState("upload");
    const [parseError, setParseError] = useState("");
    const [truncated, setTruncated] = useState(false);
    const [rows, setRows] = useState([]);
    const [included, setIncluded] = useState({});
    const [teamById, setTeamById] = useState({});
    const [typeById, setTypeById] = useState({});
    const [bulkTeam, setBulkTeam] = useState("");
    const [bulkType, setBulkType] = useState("tt");
    const [fileName, setFileName] = useState("");
    const [targetTeam, setTargetTeam] = useState("");
    function handleFile(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const { events, error, truncated: trunc } = parseIcsFile(ev.target.result);
            if (error) {
                setParseError(error);
                return;
            }
            const inc = {}, tm = {}, ty = {};
            events.forEach((ev2) => { inc[ev2.id] = true; tm[ev2.id] = targetTeam; ty[ev2.id] = guessCategoryFromTitle(ev2.title); });
            setRows(events);
            setIncluded(inc);
            setTeamById(tm);
            setTypeById(ty);
            setTruncated(!!trunc);
            setParseError("");
            setStage("review");
        };
        reader.onerror = () => setParseError("Datei konnte nicht gelesen werden.");
        reader.readAsText(file);
    }
    function applyBulkTeam() {
        if (!bulkTeam)
            return;
        setTeamById((prev) => {
            const next = { ...prev };
            rows.forEach((r) => { if (included[r.id])
                next[r.id] = bulkTeam; });
            return next;
        });
    }
    function applyBulkType() {
        setTypeById((prev) => {
            const next = { ...prev };
            rows.forEach((r) => { if (included[r.id])
                next[r.id] = bulkType; });
            return next;
        });
    }
    function toggleIncluded(id) {
        setIncluded((prev) => ({ ...prev, [id]: !prev[id] }));
    }
    function handleConfirm() {
        const events = rows.filter((r) => included[r.id]).map((r) => ({
            title: r.title, date: r.date, time: r.time, location: r.location,
            teamId: teamById[r.id] && teamById[r.id] !== "individuell" ? teamById[r.id] : null, type: typeById[r.id] || "tt",
        }));
        onConfirm(events);
        onClose();
    }
    const includedCount = Object.values(included).filter(Boolean).length;
    if (stage === "upload") {
        const teamChosen = targetTeam !== "";
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, "Exportiere deinen Kalender aus Google Calendar (Einstellungen → \"Kalender exportieren\") und wähle die heruntergeladene .ics-Datei hier aus. Alle gefundenen Termine (inkl. wöchentlicher Wiederholungen) werden danach zur Kontrolle angezeigt, bevor irgendwas gespeichert wird."),
            React.createElement(Field, { label: "Dieser Import ist für Team" },
                React.createElement("select", { className: inputClass, value: targetTeam, onChange: (e) => setTargetTeam(e.target.value) },
                    React.createElement("option", { value: "" }, "– Bitte Team wählen –"),
                    teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name)),
                    React.createElement("option", { value: "individuell" }, "Individuell (kein Team)"))),
            React.createElement("label", { className: `flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 transition ${teamChosen ? "border-stone-300 cursor-pointer hover:border-[#C43E0E] hover:bg-red-50/30" : "border-stone-200 opacity-50 cursor-not-allowed"}` },
                React.createElement(IconUpload, { size: 24, className: "text-slate-400" }),
                React.createElement("span", { className: "text-sm text-slate-600 font-medium" }, teamChosen ? ".ics-Datei auswählen" : "Erst Team oben wählen"),
                React.createElement("input", { type: "file", accept: ".ics,text/calendar", className: "hidden", disabled: !teamChosen, onChange: handleFile })),
            fileName && !parseError && React.createElement("p", { className: "text-xs text-slate-400" },
                "Zuletzt gewählt: ",
                fileName),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError)));
    }
    const typeOptionEls = Object.entries(EVENT_TYPE_STYLES).map(([k, v]) => React.createElement("option", { key: k, value: k }, v.label));
    const teamOptionEls = teams.map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name));
    const bulkControls = React.createElement("div", { className: "flex items-center gap-2 flex-wrap bg-stone-50 rounded-lg p-3" },
        React.createElement("span", { className: "text-xs font-semibold text-slate-500" }, "Für ausgewählte Zeilen:"),
        React.createElement("select", { className: "text-xs rounded border border-stone-300 px-2 py-1.5", value: bulkTeam, onChange: (e) => setBulkTeam(e.target.value) },
            React.createElement("option", { value: "" }, "– Team wählen –"),
            teamOptionEls),
        React.createElement("button", { type: "button", onClick: applyBulkTeam, className: "text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" }, "Team setzen"),
        React.createElement("select", { className: "text-xs rounded border border-stone-300 px-2 py-1.5", value: bulkType, onChange: (e) => setBulkType(e.target.value) }, typeOptionEls),
        React.createElement("button", { type: "button", onClick: applyBulkType, className: "text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-800" }, "Typ setzen"));
    const tableHead = React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
        React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
            React.createElement("th", { className: "px-2 py-2" }),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Titel"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Datum"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Zeit"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Team"),
            React.createElement("th", { className: "text-left px-2.5 py-2" }, "Typ")));
    const tableRows = rows.map((r) => {
        const checkboxCell = React.createElement("td", { className: "px-2 py-1.5" },
            React.createElement("input", { type: "checkbox", checked: !!included[r.id], onChange: () => toggleIncluded(r.id) }));
        const titleCell = React.createElement("td", { className: "px-2.5 py-1.5 font-medium text-slate-700" }, r.title);
        const dateCell = React.createElement("td", { className: "px-2.5 py-1.5 text-slate-500 whitespace-nowrap" }, fmtDate(r.date));
        const timeCell = React.createElement("td", { className: "px-2.5 py-1.5 text-slate-500 whitespace-nowrap" }, r.time || "Ganztägig");
        const teamSelect = React.createElement("select", { className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: teamById[r.id] || "individuell", onChange: (e) => setTeamById((prev) => ({ ...prev, [r.id]: e.target.value })) },
            React.createElement("option", { value: "individuell" }, "– Individuell –"),
            teamOptionEls);
        const teamCell = React.createElement("td", { className: "px-2.5 py-1.5" }, teamSelect);
        const typeSelect = React.createElement("select", { className: "w-full rounded border border-stone-300 px-1.5 py-1 text-xs", value: typeById[r.id] || "tt", onChange: (e) => setTypeById((prev) => ({ ...prev, [r.id]: e.target.value })) }, typeOptionEls);
        const typeCell = React.createElement("td", { className: "px-2.5 py-1.5" }, typeSelect);
        return React.createElement("tr", { key: r.id, className: `border-t border-stone-100 ${included[r.id] ? "" : "opacity-40"}` }, checkboxCell, titleCell, dateCell, timeCell, teamCell, typeCell);
    });
    const tableBody = React.createElement("tbody", null, tableRows);
    const table = React.createElement("div", { className: "max-h-[45vh] overflow-y-auto overflow-x-auto border border-stone-200 rounded-lg" },
        React.createElement("table", { className: "w-full min-w-[560px] text-xs" }, tableHead, tableBody));
    const actionButtons = React.createElement("div", { className: "flex gap-2" },
        React.createElement("button", { onClick: () => setStage("upload"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Andere Datei"),
        React.createElement("button", { onClick: handleConfirm, disabled: includedCount === 0, className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" }, includedCount, " Termine importieren"));
    const truncatedNotice = truncated && React.createElement("p", { className: "text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, "Es wurden mehr als 400 Termine gefunden – nur die ersten 400 wurden geladen.");
    return React.createElement("div", { className: "space-y-4" }, truncatedNotice, bulkControls, table, actionButtons);
}
function AttendanceImportModal({ players, teams, onConfirm, onClose }) {
    const [stage, setStage] = useState("upload");
    const [parseError, setParseError] = useState("");
    const [rows, setRows] = useState([]);
    const [matches, setMatches] = useState([]);
    const [date, setDate] = useState(today());
    const [fileName, setFileName] = useState("");
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    const playerOptionLabel = (p) => `${p.name}${p.teamId ? " (" + teamName(p.teamId) + ")" : ""}`;
    function handleFile(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const { rows: parsed, error } = parseAttendanceCsv(ev.target.result);
            if (error) {
                setParseError(error);
                return;
            }
            if (parsed.length === 0) {
                setParseError("Keine verwertbaren Zeilen in der Datei gefunden.");
                return;
            }
            setRows(parsed);
            setMatches(parsed.map((row) => {
                const norm = normalizeName(row.name);
                const hit = players.find((p) => normalizeName(p.name) === norm);
                return hit ? hit.id : "";
            }));
            setParseError("");
            setStage("review");
        };
        reader.onerror = () => setParseError("Datei konnte nicht gelesen werden.");
        reader.readAsText(file, "windows-1252");
    }
    function setMatchAt(i, playerId) {
        setMatches((m) => m.map((v, idx) => (idx === i ? playerId : v)));
    }
    function handleConfirm() {
        const entries = rows
            .map((row, i) => ({ row, playerId: matches[i] }))
            .filter((x) => x.playerId)
            .map((x) => ({
            playerId: x.playerId,
            anwesend: x.row.anwesend,
            abwesend: x.row.abwesend,
            entschuldigt: x.row.entschuldigt,
            einheitenGesamt: x.row.einheitenGesamt,
        }));
        onConfirm(entries, date);
        onClose();
    }
    const matchedCount = matches.filter(Boolean).length;
    if (stage === "upload") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, "CSV-Export aus eurer Anwesenheits-\u00DCbersicht ausw\u00E4hlen. Titel-/Fu\u00DFzeilen werden automatisch \u00FCbersprungen, ihr m\u00FCsst nichts vorbereiten."),
            React.createElement("label", { className: "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-lg py-8 cursor-pointer hover:border-[#C43E0E] hover:bg-red-50/30 transition" },
                React.createElement(IconUpload, { size: 24, className: "text-slate-400" }),
                React.createElement("span", { className: "text-sm text-slate-600 font-medium" }, "CSV-Datei ausw\u00E4hlen"),
                React.createElement("input", { type: "file", accept: ".csv,text/csv", className: "hidden", onChange: handleFile })),
            fileName && !parseError && React.createElement("p", { className: "text-xs text-slate-400" },
                "Zuletzt gew\u00E4hlt: ",
                fileName),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError)));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("div", { className: "flex items-center justify-between gap-3 flex-wrap" },
            React.createElement(Field, { label: "Datum dieses Schnappschusses" },
                React.createElement("input", { type: "date", className: inputClass, value: date, onChange: (e) => setDate(e.target.value) })),
            React.createElement("p", { className: "text-xs text-slate-500" },
                matchedCount,
                " von ",
                rows.length,
                " Zeilen zugeordnet")),
        React.createElement("div", { className: "max-h-[45vh] overflow-y-auto overflow-x-auto border border-stone-200 rounded-lg" },
            React.createElement("table", { className: "w-full text-xs" },
                React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
                    React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
                        React.createElement("th", { className: "text-left px-2.5 py-2" }, "Aus Datei"),
                        React.createElement("th", { className: "text-right px-2.5 py-2" }, "Einh."),
                        React.createElement("th", { className: "text-left px-2.5 py-2 w-1/2" }, "Zugeordneter Spieler"))),
                React.createElement("tbody", null, rows.map((row, i) => (React.createElement("tr", { key: i, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("div", { className: "font-medium text-slate-700" }, row.name),
                        row.team && React.createElement("div", { className: "text-slate-400" }, row.team)),
                    React.createElement("td", { className: "px-2.5 py-1.5 text-right text-slate-500" },
                        row.anwesend,
                        "/",
                        row.einheitenGesamt),
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("select", { className: `w-full rounded border px-1.5 py-1 text-xs ${matches[i] ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`, value: matches[i], onChange: (e) => setMatchAt(i, e.target.value) },
                            React.createElement("option", { value: "" }, "\u2013 \u00DCberspringen \u2013"),
                            orderedPlayers.map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))))))))),
        React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { onClick: () => setStage("upload"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Andere Datei"),
            React.createElement("button", { onClick: handleConfirm, disabled: matchedCount === 0, className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" },
                matchedCount,
                " Eintr\u00E4ge importieren"))));
}
// Statistik-Import am Spielplan: gespielte DBB-Spiele der passenden Teams zur
// Auswahl (neueste zuerst), Datum/Gegner/Team kommen dann aus dem Spiel. Nur
// wenn ein Spiel nicht im DBB-Spielplan steht, Datum und Gegner von Hand.
function playedDbbGames(teams, dbbData) {
    const todayIso = today();
    return sortTeams(teams).flatMap((t) => ((dbbData || {})[t.id]?.matches || [])
        .filter((m) => m.date && !m.cancelled && (m.result || m.date <= todayIso))
        .map((m) => ({ team: t, m })))
        .sort((a, b) => b.m.date.localeCompare(a.m.date));
}
function statsExistForGame(players, teamId, m) {
    return playersOfTeam(players, teamId).some((p) => (p.stats || []).some((st) => st.dbbMatchId ? st.dbbMatchId === m.matchId : st.date === m.date));
}
function dbbGameLabel(m) {
    const opp = m.isHome ? m.guest : m.home;
    const sc = dbbScore(m);
    return [shortDateLabel(m.date), `${m.isHome ? "vs" : "@"} ${opp?.name || "?"}`, sc ? `${sc.us}:${sc.them}` : null].filter(Boolean).join(" · ");
}
function GameSelectFields({ teams, dbbData, players, game, onChange }) {
    const games = playedDbbGames(teams, dbbData);
    const manual = games.length === 0 || !!game.manual;
    const setManual = (on) => onChange({ ...game, matchId: on ? null : game.matchId, manual: on });
    const byTeam = sortTeams(teams).map((t) => ({ team: t, list: games.filter((g) => g.team.id === t.id) })).filter((x) => x.list.length > 0);
    function pick(value) {
        if (value === "__manual") {
            setManual(true);
            return;
        }
        const hit = games.find((g) => String(g.m.matchId) === value);
        if (hit)
            onChange({ teamId: hit.team.id, matchId: hit.m.matchId, date: hit.m.date, gegner: (hit.m.isHome ? hit.m.guest : hit.m.home)?.name || "" });
        else
            onChange({ ...game, matchId: null });
    }
    if (manual) {
        return React.createElement("div", { className: "space-y-2" },
            React.createElement("div", { className: "flex items-center gap-3 flex-wrap" },
                React.createElement(Field, { label: "Datum des Spiels" },
                    React.createElement("input", { type: "date", className: inputClass, value: game.date || "", onChange: (e) => onChange({ ...game, date: e.target.value }) })),
                React.createElement(Field, { label: "Gegner (optional)" },
                    React.createElement("input", { className: inputClass, value: game.gegner || "", onChange: (e) => onChange({ ...game, gegner: e.target.value }), placeholder: "z. B. TSV Nord" }))),
            games.length > 0 && React.createElement("button", { type: "button", onClick: () => setManual(false), className: "text-xs font-semibold text-[#C43E0E] hover:text-[#FF6A2B]" }, "← Spiel aus dem Spielplan wählen"));
    }
    const selected = games.find((g) => g.m.matchId === game.matchId);
    const selectedHasStats = selected && statsExistForGame(players, selected.team.id, selected.m);
    return React.createElement(Field, { label: "Spiel aus dem Spielplan" },
        React.createElement("select", { className: inputClass, value: game.matchId ? String(game.matchId) : "", onChange: (e) => pick(e.target.value) },
            React.createElement("option", { value: "" }, "– Spiel wählen –"),
            byTeam.map(({ team, list }) => React.createElement("optgroup", { key: team.id, label: team.name }, list.map(({ m }) => React.createElement("option", { key: m.matchId, value: String(m.matchId) }, dbbGameLabel(m) + (statsExistForGame(players, team.id, m) ? "  ✓ Stats da" : ""))))),
            React.createElement("option", { value: "__manual" }, "Spiel nicht im Spielplan – Datum von Hand")),
        selected
            ? React.createElement("p", { className: `text-xs mt-1 ${selectedHasStats ? "text-amber-600" : "text-slate-400"}` }, selectedHasStats
                ? "Für dieses Spiel gibt es schon Stats - neue Werte werden in die bestehenden Einträge übernommen."
                : [selected.team.name, selected.m.liganame].filter(Boolean).join(" · "))
            : React.createElement("p", { className: "text-xs text-amber-600 mt-1" }, "Bitte zuerst das Spiel auswählen."));
}
// Ist im Import ein Spiel gewaehlt (oder bewusst von Hand eingetragen)?
function gameChosen(game, teams, dbbData) {
    return !!game.matchId || playedDbbGames(teams, dbbData).length === 0 || !!game.manual;
}
// Spieler fuer die Zuordnungs-Auswahl: Team des Spiels zuerst
function playersForGame(players, teamId) {
    if (!teamId)
        return players;
    const own = playersOfTeam(players, teamId);
    return [...own, ...players.filter((p) => !own.includes(p))];
}
function BoxscoreImportModal({ players, teams, dbbData, onConfirm, onClose, preset }) {
    const [stage, setStage] = useState("paste");
    const [text, setText] = useState("");
    const [parseError, setParseError] = useState("");
    const [filePlayers, setFilePlayers] = useState([]);
    const [matches, setMatches] = useState([]);
    const statTeams = teams.filter((t) => !DBB_SCORES_ALTERSKLASSEN.includes(t.altersklasse));
    const [game, setGame] = useState({ teamId: preset?.teamId || null, matchId: preset?.matchId || null, date: preset?.date || today(), gegner: preset?.gegner || "" });
    const date = game.date, gegner = game.gegner || "";
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    const playerOptionLabel = (p) => `${p.name}${p.number !== "" && p.number !== undefined ? " #" + p.number : ""}${p.teamId ? " (" + teamName(p.teamId) + ")" : ""}`;
    const orderedPlayers = playersForGame(players, game.teamId);
    function handleParse() {
        const { players: fp, error } = parseBoxscoreText(text);
        if (error) {
            setParseError(error);
            return;
        }
        setFilePlayers(fp);
        const pool = game.teamId ? playersOfTeam(players, game.teamId) : players;
        setMatches(fp.map((row) => {
            const byNumber = pool.filter((p) => Number(p.number) === row.number);
            if (byNumber.length === 1)
                return byNumber[0].id;
            const norm = normalizeName(row.name);
            const byName = players.find((p) => normalizeName(p.name) === norm);
            return byName ? byName.id : "";
        }));
        setParseError("");
        setStage("review");
    }
    function setMatchAt(i, playerId) {
        setMatches((m) => m.map((v, idx) => (idx === i ? playerId : v)));
    }
    function handleConfirm() {
        const entries = filePlayers
            .map((row, i) => ({ row, playerId: matches[i] }))
            .filter((x) => x.playerId)
            .map((x) => ({ playerId: x.playerId, stats: x.row }));
        onConfirm(entries, date, gegner.trim(), { matchId: game.matchId || null, teamId: game.teamId || null });
        onClose();
    }
    const matchedCount = matches.filter(Boolean).length;
    if (stage === "paste") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement(GameSelectFields, { teams: statTeams, dbbData, players, game, onChange: setGame }),
            React.createElement("p", { className: "text-xs text-slate-500" }, "Die Boxscore-Tabelle von der Statistik-Seite (z. B. NBBL) markieren, kopieren und hier einf\u00FCgen. \u00DCberschriften/Team-Zeile k\u00F6nnen mit drin sein, die App findet die richtige Stelle selbst."),
            React.createElement("textarea", { className: inputClass + " font-mono text-xs", rows: 10, value: text, onChange: (e) => { setText(e.target.value); setParseError(""); }, placeholder: "Hier den kopierten Boxscore-Text einf\u00FCgen\u2026" }),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError),
            React.createElement("button", { onClick: handleParse, disabled: !text.trim() || !gameChosen(game, statTeams, dbbData), className: "w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" }, "Text auswerten")));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement(GameSelectFields, { teams: statTeams, dbbData, players, game, onChange: setGame }),
        React.createElement("p", { className: "text-xs text-slate-500" },
            filePlayers.length,
            " Spielerzeilen erkannt. Werte flie\u00DFen in einen bestehenden Statistik-Eintrag vom selben Datum ein, oder es wird ein neuer angelegt. \"Fouls\", \"Rebounds Offensiv/Defensiv\" und \"Effizienz\" werden bei Bedarf automatisch als neue Felder angelegt."),
        React.createElement("div", { className: "max-h-[40vh] overflow-y-auto border border-stone-200 rounded-lg" },
            React.createElement("table", { className: "w-full text-xs" },
                React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
                    React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
                        React.createElement("th", { className: "text-left px-2.5 py-2" }, "Aus Text"),
                        React.createElement("th", { className: "text-right px-2.5 py-2" }, "Pkt"),
                        React.createElement("th", { className: "text-left px-2.5 py-2 w-1/2" }, "Zugeordneter Spieler"))),
                React.createElement("tbody", null, filePlayers.map((row, i) => (React.createElement("tr", { key: i, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("div", { className: "font-medium text-slate-700" },
                            "#",
                            row.number,
                            " ",
                            row.name)),
                    React.createElement("td", { className: "px-2.5 py-1.5 text-right text-slate-500" }, row.punkte ?? "–"),
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("select", { className: `w-full rounded border px-1.5 py-1 text-xs ${matches[i] ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`, value: matches[i], onChange: (e) => setMatchAt(i, e.target.value) },
                            React.createElement("option", { value: "" }, "\u2013 \u00DCberspringen \u2013"),
                            orderedPlayers.map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))))))))),
        React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { onClick: () => setStage("paste"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Anderer Text"),
            React.createElement("button", { onClick: handleConfirm, disabled: matchedCount === 0 || !date || !gameChosen(game, statTeams, dbbData), className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" },
                matchedCount,
                " Spieler importieren"))));
}
function AdvancedStatsImportModal({ players, teams, dbbData, onConfirm, onClose }) {
    const [stage, setStage] = useState("upload");
    const [parseError, setParseError] = useState("");
    const [rows, setRows] = useState([]);
    const [matches, setMatches] = useState([]);
    const statTeams = teams.filter((t) => !DBB_SCORES_ALTERSKLASSEN.includes(t.altersklasse));
    const [game, setGame] = useState({ teamId: null, matchId: null, date: today(), gegner: "" });
    const date = game.date, gegner = game.gegner || "";
    const orderedPlayers = playersForGame(players, game.teamId);
    const [fileName, setFileName] = useState("");
    const teamName = (id) => teams.find((t) => t.id === id)?.name || "";
    const playerOptionLabel = (p) => `${p.name}${p.number !== "" && p.number !== undefined ? " #" + p.number : ""}${p.teamId ? " (" + teamName(p.teamId) + ")" : ""}`;
    function handleFile(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const { rows: parsed, error } = parseAdvancedStatsCsv(ev.target.result);
            if (error) {
                setParseError(error);
                return;
            }
            setRows(parsed);
            setMatches(parsed.map((row) => {
                const norm = normalizeName(row.name);
                const hit = players.find((p) => normalizeName(p.name) === norm);
                return hit ? hit.id : "";
            }));
            setParseError("");
            setStage("review");
        };
        reader.onerror = () => setParseError("Datei konnte nicht gelesen werden.");
        reader.readAsText(file, "utf-8");
    }
    function setMatchAt(i, playerId) {
        setMatches((m) => m.map((v, idx) => (idx === i ? playerId : v)));
    }
    function handleConfirm() {
        const entries = rows
            .map((row, i) => ({ row, playerId: matches[i] }))
            .filter((x) => x.playerId)
            .map((x) => ({ playerId: x.playerId, values: x.row.values }));
        onConfirm(entries, date, gegner.trim(), { matchId: game.matchId || null, teamId: game.teamId || null });
        onClose();
    }
    const matchedCount = matches.filter(Boolean).length;
    if (stage === "upload") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, "CSV-Export aus eurem Advanced-Stats-Rechner nach einem Spiel ausw\u00E4hlen. Grundlegende Werte (Punkte, Rebounds usw.) werden ignoriert, da die schon anderswo erfasst sind \u2013 importiert werden nur die echten Advanced-Kennzahlen (ORtg, TS%, USG% usw.)."),
            React.createElement("label", { className: "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-lg py-8 cursor-pointer hover:border-[#C43E0E] hover:bg-red-50/30 transition" },
                React.createElement(IconUpload, { size: 24, className: "text-slate-400" }),
                React.createElement("span", { className: "text-sm text-slate-600 font-medium" }, "CSV-Datei ausw\u00E4hlen"),
                React.createElement("input", { type: "file", accept: ".csv,text/csv", className: "hidden", onChange: handleFile })),
            fileName && !parseError && React.createElement("p", { className: "text-xs text-slate-400" },
                "Zuletzt gew\u00E4hlt: ",
                fileName),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError)));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement(GameSelectFields, { teams: statTeams, dbbData, players, game, onChange: setGame }),
        React.createElement("p", { className: "text-xs text-slate-500" },
            rows.length,
            " Spielerzeilen erkannt, ohne Trikotnummer wird nur nach Name abgeglichen \u2013 bitte unklare Zuordnungen pr\u00FCfen. Neue Kennzahlen werden automatisch als Felder unter \"Advanced\" angelegt."),
        React.createElement("div", { className: "max-h-[40vh] overflow-y-auto border border-stone-200 rounded-lg" },
            React.createElement("table", { className: "w-full text-xs" },
                React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
                    React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
                        React.createElement("th", { className: "text-left px-2.5 py-2" }, "Aus Datei"),
                        React.createElement("th", { className: "text-left px-2.5 py-2 w-1/2" }, "Zugeordneter Spieler"))),
                React.createElement("tbody", null, rows.map((row, i) => (React.createElement("tr", { key: i, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("div", { className: "font-medium text-slate-700" }, row.name)),
                    React.createElement("td", { className: "px-2.5 py-1.5" },
                        React.createElement("select", { className: `w-full rounded border px-1.5 py-1 text-xs ${matches[i] ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`, value: matches[i], onChange: (e) => setMatchAt(i, e.target.value) },
                            React.createElement("option", { value: "" }, "\u2013 \u00DCberspringen \u2013"),
                            players.map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))))))))),
        React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { onClick: () => setStage("upload"), className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Andere Datei"),
            React.createElement("button", { onClick: handleConfirm, disabled: matchedCount === 0 || !date || !gameChosen(game, statTeams, dbbData), className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" },
                matchedCount,
                " Spieler importieren"))));
}
function parseDbbMinutes(raw) {
    const m = (raw || "").match(/(\d{1,3})\s*[:.]\s*(\d{2})/);
    if (m)
        return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10) / 60) * 10) / 10;
    const n = parseFloat((raw || "").replace(",", "."));
    return isNaN(n) ? null : n;
}
function parseDbbInt(raw) {
    const m = (raw || "").match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
}
function parseDbbFraction(raw) {
    const m = (raw || "").match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { made: parseInt(m[1], 10), att: parseInt(m[2], 10) } : { made: null, att: null };
}
function DbbScoresImportModal({ teams, allPlayers, dbbData, onConfirm, onClose, preset }) {
    const [stage, setStage] = useState("setup");
    const [game, setGame] = useState({ teamId: (preset?.teamId && teams.some((t) => t.id === preset.teamId) ? preset.teamId : null) || sortTeams(teams)[0]?.id || "", matchId: preset?.matchId || null, date: preset?.date || today(), gegner: preset?.gegner || "" });
    const teamId = game.teamId, date = game.date, gegner = game.gegner || "";
    const setTeamId = (id) => setGame((g) => ({ ...g, teamId: id, matchId: null }));
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [parseError, setParseError] = useState("");
    const [shot1Rows, setShot1Rows] = useState([]);
    const [rows, setRows] = useState([]);
    const [matches, setMatches] = useState([]);
    const teamPlayers = playersOfTeam(allPlayers, teamId);
    const playerOptionLabel = (p) => `${p.name}${p.number !== "" && p.number !== undefined ? " #" + p.number : ""}`;
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
            img.src = url;
        });
    }
    async function handleShot1(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setParseError("");
        setStage("processing1");
        try {
            const img = await loadImage(file);
            const { rows: r, error } = await extractDbbScoresScreenshot(img, ["M", "Pkt", "FW", "FW%"], (done, total) => setProgress({ done, total }));
            if (error) {
                setParseError(error);
                setStage("setup");
                return;
            }
            setShot1Rows(r);
            setStage("upload2");
        }
        catch (err) {
            setParseError("Bilderkennung fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
            setStage("setup");
        }
    }
    async function handleShot2(e) {
        const file = e.target.files[0];
        if (!file)
            return;
        setParseError("");
        setStage("processing2");
        try {
            const img = await loadImage(file);
            const { rows: r2, error } = await extractDbbScoresScreenshot(img, ["2Pkt", "3Pkt", "PF", "+/-"], (done, total) => setProgress({ done, total }));
            if (error) {
                setParseError(error);
                setStage("upload2");
                return;
            }
            const merged = shot1Rows.map((r1) => {
                const norm = normalizeName(r1.name);
                const match = r2.find((x) => normalizeName(x.name) === norm);
                return { name: r1.name, ...r1.values, ...(match ? match.values : { "2Pkt": "", "3Pkt": "", PF: "", "+/-": "" }) };
            });
            setRows(merged);
            setMatches(merged.map((row) => {
                const norm = normalizeName(row.name);
                const hit = teamPlayers.find((p) => normalizeName(p.name) === norm);
                return hit ? hit.id : "";
            }));
            setStage("review");
        }
        catch (err) {
            setParseError("Bilderkennung fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
            setStage("upload2");
        }
    }
    function updateCell(i, key, value) {
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    }
    function setMatchAt(i, playerId) {
        setMatches((m) => m.map((v, idx) => (idx === i ? playerId : v)));
    }
    function handleConfirm() {
        const entries = rows
            .map((row, i) => {
                const ft = parseDbbFraction(row.FW);
                return {
                    playerId: matches[i],
                    stats: {
                        minuten: parseDbbMinutes(row.M),
                        punkte: parseDbbInt(row.Pkt),
                        ft_m: ft.made, ft_a: ft.att,
                        zweiPkt: parseDbbInt(row["2Pkt"]),
                        dreiPkt: parseDbbInt(row["3Pkt"]),
                        fouls: parseDbbInt(row.PF),
                        plusMinus: parseDbbInt(row["+/-"]),
                    },
                };
            })
            .filter((x) => x.playerId);
        onConfirm(entries, date, gegner.trim(), { matchId: game.matchId || null, teamId });
        onClose();
    }
    const matchedCount = matches.filter(Boolean).length;
    if (stage === "setup" || stage === "processing1") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, "Für U12/U14/U16/U18 gibt es keine ausführlichen Statistiken, sondern nur die Werte aus der DBB-Scores-App. Da die App selbst keine Gesamtansicht anbietet, braucht es zwei Screenshots pro Spiel: einmal die Spalten Minuten/Punkte/Feldwürfe/FW%, einmal 2Pkt/3Pkt/Fouls/Plus-Minus."),
            React.createElement(Field, { label: "Team" },
                React.createElement("select", { className: inputClass, value: teamId, onChange: (e) => setTeamId(e.target.value) },
                    sortTeams(teams).map((t) => React.createElement("option", { key: t.id, value: t.id }, t.name)))),
            React.createElement(GameSelectFields, { key: teamId, teams: teams.filter((t) => t.id === teamId), dbbData, players: allPlayers, game, onChange: (g) => setGame({ ...g, teamId }) }),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError),
            stage === "processing1"
                ? React.createElement("div", { className: "text-center py-6 text-sm text-slate-500" },
                    React.createElement(IconLoader, { className: "animate-spin mx-auto mb-2 text-[#C43E0E]", size: 22 }),
                    progress.total ? `Zeile ${progress.done} von ${progress.total} wird gelesen…` : "Bild wird geladen…")
                : React.createElement(Field, { label: "Screenshot 1: Minuten / Punkte / Feldwürfe / FW%" },
                    React.createElement("input", { type: "file", accept: "image/*", onChange: handleShot1, disabled: !teamId || !date || !gameChosen(game, teams.filter((t) => t.id === teamId), dbbData), className: "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }))));
    }
    if (stage === "upload2" || stage === "processing2") {
        return (React.createElement("div", { className: "space-y-4" },
            React.createElement("p", { className: "text-xs text-slate-500" }, shot1Rows.length, " Spielerzeilen aus Screenshot 1 erkannt. Jetzt den zweiten Screenshot (2Pkt / 3Pkt / Fouls / Plus-Minus, gleiches Spiel) hochladen."),
            parseError && React.createElement("p", { className: "text-xs text-red-600" }, parseError),
            stage === "processing2"
                ? React.createElement("div", { className: "text-center py-6 text-sm text-slate-500" },
                    React.createElement(IconLoader, { className: "animate-spin mx-auto mb-2 text-[#C43E0E]", size: 22 }),
                    progress.total ? `Zeile ${progress.done} von ${progress.total} wird gelesen…` : "Bild wird geladen…")
                : React.createElement(Field, { label: "Screenshot 2: 2Pkt / 3Pkt / Fouls / Plus-Minus" },
                    React.createElement("input", { type: "file", accept: "image/*", onChange: handleShot2, className: "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-stone-200" }))));
    }
    return (React.createElement("div", { className: "space-y-4" },
        React.createElement("p", { className: "text-xs text-slate-500" }, rows.length, " Spielerzeilen erkannt. Werte vor dem Speichern prüfen (Bilderkennung ist nie 100% fehlerfrei) - Zellen sind direkt bearbeitbar. Punkte fließen in die normale Statistik, Freiwürfe in \"Wurfquoten\"; 2Pkt/3Pkt/Fouls/Plus-Minus werden als neue Felder unter \"DBB Scores\" angelegt."),
        React.createElement("div", { className: "max-h-[45vh] overflow-auto border border-stone-200 rounded-lg" },
            React.createElement("table", { className: "w-full text-xs" },
                React.createElement("thead", { className: "sticky top-0 bg-stone-100" },
                    React.createElement("tr", { className: "text-slate-500 uppercase tracking-wide" },
                        ["Spieler", "M", "Pkt", "FW", "2Pkt", "3Pkt", "PF", "+/-", "Zugeordnet"].map((h) => React.createElement("th", { key: h, className: "text-left px-2 py-2 whitespace-nowrap" }, h)))),
                React.createElement("tbody", null, rows.map((row, i) => (React.createElement("tr", { key: i, className: "border-t border-stone-100" },
                    React.createElement("td", { className: "px-2 py-1 font-medium text-slate-700 whitespace-nowrap" }, row.name),
                    ["M", "Pkt", "FW", "2Pkt", "3Pkt", "PF", "+/-"].map((key) => React.createElement("td", { key: key, className: "px-1 py-1" },
                        React.createElement("input", { className: "w-14 rounded border border-stone-200 px-1 py-0.5 text-xs", value: row[key] ?? "", onChange: (e) => updateCell(i, key, e.target.value) }))),
                    React.createElement("td", { className: "px-2 py-1" },
                        React.createElement("select", { className: `rounded border px-1.5 py-1 text-xs ${matches[i] ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`, value: matches[i], onChange: (e) => setMatchAt(i, e.target.value) },
                            React.createElement("option", { value: "" }, "– Überspringen –"),
                            teamPlayers.map((p) => React.createElement("option", { key: p.id, value: p.id }, playerOptionLabel(p))))))))))),
        React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", { onClick: onClose, className: "flex-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg py-2.5 text-sm font-semibold transition" }, "Abbrechen"),
            React.createElement("button", { onClick: handleConfirm, disabled: matchedCount === 0, className: "flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-semibold transition" },
                matchedCount, " Spieler importieren"))));
}
