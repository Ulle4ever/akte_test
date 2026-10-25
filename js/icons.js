// icons.js - React-Hooks-Kurzformen und alle SVG-Icons der App.
// Teil der Spieler-Akte: wird von index.html als klassisches Script in fester
// Reihenfolge geladen; alle Dateien teilen sich denselben globalen Gueltigkeitsbereich.
"use strict";
const { useState, useEffect, useRef } = React;
function Icon({ children, size = 16, className = "" }) {
    return (React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: className }, children));
}
const IconPlus = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }));
const IconMenu = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "3", y1: "6", x2: "21", y2: "6" }),
    React.createElement("line", { x1: "3", y1: "12", x2: "21", y2: "12" }),
    React.createElement("line", { x1: "3", y1: "18", x2: "21", y2: "18" }));
const IconSearch = (p) => React.createElement(Icon, { ...p },
    React.createElement("circle", { cx: "11", cy: "11", r: "7" }),
    React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }));
const IconTrash = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "3 6 5 6 21 6" }),
    React.createElement("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }),
    React.createElement("path", { d: "M10 11v6" }),
    React.createElement("path", { d: "M14 11v6" }),
    React.createElement("path", { d: "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" }));
const IconEdit = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M12 20h9" }),
    React.createElement("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }));
const IconX = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }));
const IconLock = (p) => React.createElement(Icon, { ...p },
    React.createElement("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }),
    React.createElement("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" }));
const IconBell = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" }),
    React.createElement("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" }));
const IconBellOff = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M8.7 3.3A6 6 0 0 1 18 8c0 4.2 1 6.7 1.9 8.1" }),
    React.createElement("path", { d: "M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h13" }),
    React.createElement("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" }),
    React.createElement("line", { x1: "2", y1: "2", x2: "22", y2: "22" }));
const IconKey = (p) => React.createElement(Icon, { ...p },
    React.createElement("circle", { cx: "8", cy: "15", r: "4" }),
    React.createElement("path", { d: "M10.5 12.5 20 3" }),
    React.createElement("path", { d: "M17 6l2 2" }),
    React.createElement("path", { d: "M14 9l2 2" }));
const IconInfo = (p) => React.createElement(Icon, { ...p },
    React.createElement("circle", { cx: "12", cy: "12", r: "9" }),
    React.createElement("line", { x1: "12", y1: "11", x2: "12", y2: "16" }),
    React.createElement("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" }));
const IconAlert = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M12 3 2 20h20L12 3Z" }),
    React.createElement("line", { x1: "12", y1: "9", x2: "12", y2: "14" }),
    React.createElement("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" }));
const IconTrophy = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M8 21h8" }),
    React.createElement("path", { d: "M12 17v4" }),
    React.createElement("path", { d: "M7 4h10v5a5 5 0 0 1-10 0V4Z" }),
    React.createElement("path", { d: "M7 5H4a3 3 0 0 0 3 6" }),
    React.createElement("path", { d: "M17 5h3a3 3 0 0 1-3 6" }));
const IconUndo = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M9 14 4 9l5-5" }),
    React.createElement("path", { d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H11" }));
const IconHeart = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }));
const IconHome = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }),
    React.createElement("path", { d: "M9 22V12h6v10" }));
const IconDownload = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    React.createElement("path", { d: "M7 10l5 5 5-5" }),
    React.createElement("path", { d: "M12 15V3" }));
const IconUsers = (p) => React.createElement(Icon, { ...p },
    React.createElement("circle", { cx: "9", cy: "8", r: "3.5" }),
    React.createElement("path", { d: "M3.5 20a5.5 5.5 0 0 1 11 0" }),
    React.createElement("circle", { cx: "17", cy: "9", r: "3" }),
    React.createElement("path", { d: "M15 20a4.5 4.5 0 0 1 6-4.2" }));
const IconActivity = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "3 12 8 12 10 6 14 18 16 12 21 12" }));
const IconClipboard = (p) => React.createElement(Icon, { ...p },
    React.createElement("rect", { x: "6", y: "4", width: "12", height: "17", rx: "2" }),
    React.createElement("path", { d: "M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" }),
    React.createElement("line", { x1: "9", y1: "10", x2: "15", y2: "10" }),
    React.createElement("line", { x1: "9", y1: "14", x2: "15", y2: "14" }),
    React.createElement("line", { x1: "9", y1: "18", x2: "13", y2: "18" }));
const IconVideo = (p) => React.createElement(Icon, { ...p },
    React.createElement("rect", { x: "3", y: "6", width: "12", height: "12", rx: "2" }),
    React.createElement("path", { d: "M15 10l6-3v10l-6-3" }));
const IconNote = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" }),
    React.createElement("path", { d: "M16 4v4h4" }));
const IconMessage = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }));
const IconExternal = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M14 4h6v6" }),
    React.createElement("path", { d: "M20 4 10 14" }),
    React.createElement("path", { d: "M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" }));
const IconTrendUp = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "3 17 9 11 13 15 21 6" }),
    React.createElement("polyline", { points: "15 6 21 6 21 12" }));
const IconTrendDown = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "3 7 9 13 13 9 21 18" }),
    React.createElement("polyline", { points: "21 12 21 18 15 18" }));
const IconLoader = (p) => React.createElement(Icon, { ...p, className: "animate-spin " + (p.className || "") },
    React.createElement("path", { d: "M12 3a9 9 0 1 0 9 9" }));
const IconSettings = (p) => React.createElement(Icon, { ...p },
    React.createElement("circle", { cx: "12", cy: "12", r: "3" }),
    React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" }));
const IconArrowUp = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "12", y1: "19", x2: "12", y2: "5" }),
    React.createElement("polyline", { points: "5 12 12 5 19 12" }));
const IconArrowDown = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    React.createElement("polyline", { points: "19 12 12 19 5 12" }));
const IconChevronDown = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "6 9 12 15 18 9" }));
const IconArrowLeft = (p) => React.createElement(Icon, { ...p },
    React.createElement("line", { x1: "19", y1: "12", x2: "5", y2: "12" }),
    React.createElement("polyline", { points: "12 19 5 12 12 5" }));
const IconCheck = (p) => React.createElement(Icon, { ...p },
    React.createElement("polyline", { points: "20 6 9 17 4 12" }));
const IconFile = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
    React.createElement("polyline", { points: "14 2 14 8 20 8" }));
const IconPaperclip = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.64 18.36a2 2 0 0 1-2.83-2.83l8.49-8.48" }));
const IconCalendar = (p) => React.createElement(Icon, { ...p },
    React.createElement("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }),
    React.createElement("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
    React.createElement("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
    React.createElement("line", { x1: "3", y1: "10", x2: "21", y2: "10" }),
    React.createElement("path", { d: "m9 16 2 2 4-4" }));
const IconUpload = (p) => React.createElement(Icon, { ...p },
    React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    React.createElement("polyline", { points: "17 8 12 3 7 8" }),
    React.createElement("line", { x1: "12", y1: "3", x2: "12", y2: "15" }));
