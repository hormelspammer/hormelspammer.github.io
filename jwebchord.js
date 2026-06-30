"use strict";

// ── Configuration (mirrors jwebchord.properties) ──────────────────────────
var cfg = {
    h1_size:         "32",
    h2_size:         "16",
    lyric_size:      "14",
    tab_size:        "14",
    chord_size:      "14",
    chord_weight:    "normal",
    chord_color:     "green",
    chorus_weight:   "bold",
    comment_weight:  "normal",
    comment_bgcolor: "#ffbbaa",
    font_style:      "2"   // 0=Arial  1=Courier New  2=Times New Roman
};

// ── Transpose state ────────────────────────────────────────────────────────
// Index 0 = "+6 Half Steps" … index 6 = "+0 Half Steps" … index 12 = "-6 Half Steps"
var transposeIndex = 6;

var transposeLevels = [
    "+6 Half Steps", "+5 Half Steps", "+4 Half Steps", "+3 Half Steps",
    "+2 Half Steps", "+1 Half Steps", "+0 Half Steps",
    "-1 Half Steps", "-2 Half Steps", "-3 Half Steps",
    "-4 Half Steps", "-5 Half Steps", "-6 Half Steps"
];

// ── UI state ───────────────────────────────────────────────────────────────
var showChords = true;
var twoColumns = false;
var lastHtmlSB = "";   // last rendered HTML (for export)

// ── Per-line chord/lyric accumulators ─────────────────────────────────────
var chordArray = [];
var lyricArray = [];
var mode = 0;   // 0=verse  1=chorus  2=tab

var lyricMode = ["lyrics", "lyrics_chorus", "lyrics_tab", "lyrics_chorus_tab"];
var chordMode = ["chords", "chords_chorus", "chords_tab", "chords_chorus_tab"];

// ─────────────────────────────────────────────────────────────────────────────
// MENU
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-item")) {
        document.querySelectorAll(".menu-dropdown").forEach(function (d) { d.classList.remove("visible"); });
        document.querySelectorAll(".menu-title").forEach(function (t) { t.classList.remove("open"); });
    }
});

function toggleMenu(id) {
    var dd = document.getElementById(id);
    var isVisible = dd.classList.contains("visible");
    document.querySelectorAll(".menu-dropdown").forEach(function (d) { d.classList.remove("visible"); });
    document.querySelectorAll(".menu-title").forEach(function (t) { t.classList.remove("open"); });
    if (!isVisible) {
        dd.classList.add("visible");
        dd.previousElementSibling.classList.add("open");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function openModal(id) {
    document.querySelectorAll(".menu-dropdown").forEach(function (d) { d.classList.remove("visible"); });
    document.getElementById(id).classList.add("visible");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("visible");
}

document.querySelectorAll(".modal-overlay").forEach(function (ov) {
    ov.addEventListener("click", function (e) {
        if (e.target === ov) ov.classList.remove("visible");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPOSE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function openTransposeModal() {
    var list = document.getElementById("transpose-list");
    list.innerHTML = "";
    transposeLevels.forEach(function (lbl, i) {
        var li = document.createElement("li");
        li.textContent = lbl;
        if (i === transposeIndex) li.classList.add("selected");
        li.addEventListener("click", function () {
            list.querySelectorAll("li").forEach(function (x) { x.classList.remove("selected"); });
            li.classList.add("selected");
            transposeIndex = i;
        });
        list.appendChild(li);
    });
    openModal("modal-transpose");
}

function applyTranspose() {
    updateTransposeDisplay();
    closeModal("modal-transpose");
    setStatus("Transpose set to " + transposeLevels[transposeIndex] + ". Convert Song to apply.");
}

function shiftTranspose(delta) {
    transposeIndex = Math.max(0, Math.min(12, transposeIndex - delta));
    updateTransposeDisplay();
    setStatus("Transpose set to " + transposeLevels[transposeIndex] + ". Convert Song to apply.");
}

function resetTranspose() {
    transposeIndex = 6;
    updateTransposeDisplay();
    setStatus("Transpose reset.");
}

function updateTransposeDisplay() {
    document.getElementById("transpose-display").textContent = transposeLevels[transposeIndex];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPOSE CHORD
// ─────────────────────────────────────────────────────────────────────────────

// 12 chromatic notes, two spellings.  A=0 … G#/Ab=11.
var transChordSharp = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
var transChordFlat  = ["A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab"];

/** Returns the signed semitone count for the current selection (e.g. -3, 0, +5). */
function getTransposeSelection() {
    var label = transposeLevels[transposeIndex];
    var sign  = label.charAt(0) === "-" ? -1 : 1;
    var steps = parseInt(label.substring(1, 2), 10);
    return sign * steps;
}

/**
 * Extract the root note (1 or 2 chars) from the start of a chord string.
 * Only the literal characters '#' or 'b' in position 1 are treated as
 * accidentals — this prevents "Bm", "Bdim" etc. being misread.
 */
function extractRoot(chord) {
    if (chord.length >= 2 && (chord[1] === "#" || chord[1] === "b")) {
        return chord.substring(0, 2);
    }
    return chord.substring(0, 1);
}

/** Transpose a single root note by `steps` semitones, preserving accidental style. */
function transposeRoot(root, steps) {
    var useFlats = (root.length === 2 && root[1] === "b");
    var arr = useFlats ? transChordFlat : transChordSharp;

    var pos = -1;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === root) { pos = i; break; }
    }
    if (pos === -1) {
        var alt = useFlats ? transChordSharp : transChordFlat;
        for (var i = 0; i < alt.length; i++) {
            if (alt[i] === root) { pos = i; break; }
        }
    }
    if (pos === -1) return root;   // unrecognised — leave unchanged

    var newPos = ((pos + steps) % 12 + 12) % 12;
    return arr[newPos];
}

/** Transpose a full chord token (e.g. "Cmaj7", "G/B", "Bb7"). */
function transposeChord(chord) {
    var steps = getTransposeSelection();
    if (steps === 0) return chord;

    var slashIdx = chord.indexOf("/");
    var mainPart = slashIdx === -1 ? chord : chord.substring(0, slashIdx);
    var bassPart = slashIdx === -1 ? ""    : chord.substring(slashIdx + 1);

    var mainRoot   = extractRoot(mainPart);
    var mainSuffix = mainPart.substring(mainRoot.length);
    var result     = transposeRoot(mainRoot, steps) + mainSuffix;

    if (bassPart !== "") {
        var bassRoot   = extractRoot(bassPart);
        var bassSuffix = bassPart.substring(bassRoot.length);
        result += "/" + transposeRoot(bassRoot, steps) + bassSuffix;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE DIRECTIVE
// Handles both original formats:
//   {title:} My Song     — value is text after the last "}"
//   {title: My Song}     — value is text inside the braces after ":"
// ─────────────────────────────────────────────────────────────────────────────
function parseDirective(songLine) {
    if (!songLine.startsWith("{")) return null;

    var lower = songLine.toLowerCase();

    function afterBrace() {
        return songLine.substring(songLine.lastIndexOf("}") + 1).trim();
    }

    function insideColon() {
        var m = songLine.match(/^\{[^:}]+:\s*([^}]*)\}/);
        return m ? m[1].trim() : "";
    }

    function is(cmds) {
        for (var i = 0; i < cmds.length; i++) {
            if (lower.indexOf("{" + cmds[i] + ":}") !== -1) return true;
            if (lower.indexOf("{" + cmds[i] + ":")  !== -1) return true;
            if (lower.indexOf("{" + cmds[i] + "}")  !== -1) return true;
        }
        return false;
    }

    function val(cmds) {
        for (var i = 0; i < cmds.length; i++) {
            if (lower.indexOf("{" + cmds[i] + ":}") !== -1) return afterBrace();
        }
        return insideColon() || afterBrace();
    }

    if (is(["title",   "t"]))           return { cmd: "title",          value: val(["title",   "t"])  };
    if (is(["subtitle","st"]))           return { cmd: "subtitle",       value: val(["subtitle","st"]) };
    if (is(["artist"]))                  return { cmd: "artist",         value: val(["artist"])        };
    if (is(["key"]))                     return { cmd: "key",            value: val(["key"])           };
    if (is(["capo"]))                    return { cmd: "capo",           value: val(["capo"])          };
    if (is(["tempo"]))                   return { cmd: "tempo",          value: val(["tempo"])         };
    if (is(["comment_italic","ci"]))     return { cmd: "comment_italic", value: val(["comment_italic","ci"]) };
    if (is(["comment_box",   "cb"]))     return { cmd: "comment_box",    value: val(["comment_box",   "cb"]) };
    if (is(["comment",       "c"]))      return { cmd: "comment",        value: val(["comment",       "c"])  };
    if (is(["start_of_chorus","soc"]))   return { cmd: "soc" };
    if (is(["end_of_chorus",  "eoc"]))   return { cmd: "eoc" };
    if (is(["start_of_tab",   "sot"]))   return { cmd: "sot" };
    if (is(["end_of_tab",     "eot"]))   return { cmd: "eot" };
    if (is(["new_song",       "ns"]))    return { cmd: "ns"  };

    return { cmd: "unsupported", raw: songLine };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS LINE  — word-by-word parser (mirrors original Java loop)
// ─────────────────────────────────────────────────────────────────────────────
function processLine(songLine, htmlParts) {
    chordArray = [];
    lyricArray = [];
    var chordOnly = [];   // parallel flag: true when the lyric cell has no real text

    var wordSB = "";
    var i = 0;

    while (i < songLine.length) {
        if (songLine.length > 0) {
            while (i < songLine.length && songLine[i].trim() !== "") {
                wordSB += songLine[i];
                i++;
            }
            i++;   // skip the space
        }

        var checkWord = wordSB.trim();
        wordSB = "";

        if (checkWord.length === 0 && songLine.length === 0) {
            lyricArray = []; chordArray = []; chordOnly = [];
        } else if (checkWord.indexOf("[") !== -1) {
            var startChord = checkWord.indexOf("[");
            var endChord   = checkWord.indexOf("]");

            if (getTransposeSelection() !== 0) {
                var origKey = checkWord.substring(startChord + 1, endChord);
                var newKey  = transposeChord(origKey);
                checkWord   = checkWord.substring(0, startChord + 1) + newKey +
                              checkWord.substring(endChord);
                endChord    = checkWord.indexOf("]");
            }

            if (checkWord.startsWith("[")) {
                chordArray.push(checkWord.substring(startChord + 1, endChord));
                var lyricAfter = checkWord.substring(endChord + 1);
                if (lyricAfter.length > 0) {
                    lyricArray.push(lyricAfter + "\u00a0");
                    chordOnly.push(false);
                } else {
                    // Chord-only word — lyric cell needs padding so consecutive
                    // chord columns don't run together.
                    lyricArray.push("\u00a0");
                    chordOnly.push(true);
                }
            } else {
                lyricArray.push(checkWord.substring(0, startChord));
                lyricArray.push(checkWord.substring(endChord + 1) + "\u00a0");
                chordArray.push("\u00a0");
                chordArray.push(checkWord.substring(startChord + 1, endChord));
                chordOnly.push(false);
                chordOnly.push(false);
            }
        } else {
            if (checkWord.length > 0) {
                lyricArray.push(checkWord + "\u00a0");
                chordArray.push("\u00a0");
                chordOnly.push(false);
            }
        }
    }

    if (lyricArray.length === 0) {
        // Blank line — use a div with explicit height so that multiple
        // consecutive blank lines each contribute visible vertical space
        // instead of collapsing as bare <br> elements do in HTML.
        htmlParts.push("<div style='height:1em'></div>\n");
    } else if (chordArray.length === 0 || !showChords) {
        htmlParts.push("<div class='" + lyricMode[mode] + "'>" + esc(songLine) + "</div>\n");
    } else {
        htmlParts.push("<table cellpadding='0' cellspacing='0'>\n<tr>\n");
        for (var j = 0; j < chordArray.length; j++) {
            htmlParts.push("<td class='" + chordMode[mode] + "'>" + esc(chordArray[j]) + "</td>\n");
        }
        htmlParts.push("</tr>\n<tr>\n");
        for (var j = 0; j < lyricArray.length; j++) {
            // Add padding-right on chord-only cells so consecutive chords
            // always have a visible gap between them.
            var tdStyle = chordOnly[j] ? " style='padding-right:0.5em'" : "";
            htmlParts.push("<td class='" + lyricMode[mode] + "'" + tdStyle + ">" + esc(lyricArray[j]) + "</td>\n");
        }
        htmlParts.push("</tr></table>\n");
    }

    chordArray = []; lyricArray = []; chordOnly = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERT SONG
// ─────────────────────────────────────────────────────────────────────────────
function convertSong() {
    var source = document.getElementById("source-editor").value;
    if (!source.trim()) {
        setStatus("No source to convert. Paste ChordPro text or open a file first.");
        return;
    }

    mode = 0;
    var lines     = source.split(/\r?\n/);
    var htmlParts = [];
    var songTitle = "", songSubtitle = "", songArtist = "",
        songKey   = "", songCapo    = "", songTempo   = "";

    // First pass — collect metadata for the header block
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith("{")) continue;
        var dir = parseDirective(lines[i]);
        if (!dir) continue;
        if (dir.cmd === "title")    songTitle    = dir.value;
        if (dir.cmd === "subtitle") songSubtitle = dir.value;
        if (dir.cmd === "artist")   songArtist   = dir.value;
        if (dir.cmd === "key")      songKey      = dir.value;
        if (dir.cmd === "capo")     songCapo     = dir.value;
        if (dir.cmd === "tempo")    songTempo    = dir.value;
    }

    if (songTitle)    htmlParts.push("<h1>" + esc(songTitle) + "</h1>\n");
    if (songSubtitle) htmlParts.push("<h2>" + esc(songSubtitle) + "</h2>\n");
    if (songArtist || songKey || songCapo || songTempo) {
        htmlParts.push("<p style='font-size:12pt; color:#666; margin:4px 0 16px;'>");
        if (songArtist) htmlParts.push("Artist: " + esc(songArtist) + " &nbsp; ");
        if (songKey)    htmlParts.push("Key: "    + esc(songKey)    + " &nbsp; ");
        if (songCapo)   htmlParts.push("Capo: "   + esc(songCapo)   + " &nbsp; ");
        if (songTempo)  htmlParts.push("Tempo: "  + esc(songTempo)  + " bpm");
        htmlParts.push("</p>\n");
    }

    // Second pass — line-by-line conversion
    for (var i = 0; i < lines.length; i++) {
        var songLine = lines[i];

        if (songLine.startsWith("#")) {
            htmlParts.push("<!--" + songLine + "-->\n");
            continue;
        }

        if (songLine.startsWith("{")) {
            var dir = parseDirective(songLine);
            if (!dir) continue;
            switch (dir.cmd) {
                case "title": case "subtitle": case "artist":
                case "key":   case "capo":     case "tempo":
                    break;   // already handled in header pass
                case "soc": mode = 1; break;
                case "eoc": mode = 0; break;
                case "sot": mode = 2; break;
                case "eot": mode = 0; break;
                case "ns":  htmlParts.push("<hr>\n"); break;
                case "comment":
                    htmlParts.push("<p class='comment'>" + esc(dir.value) + "</p>\n"); break;
                case "comment_italic":
                    htmlParts.push("<p class='comment_italic'>" + esc(dir.value) + "</p>\n"); break;
                case "comment_box":
                    htmlParts.push("<p class='comment_box'>" + esc(dir.value) + "</p>\n"); break;
                case "unsupported":
                    htmlParts.push("<!--Unsupported command: " + dir.raw + "-->\n"); break;
            }
            continue;
        }

        processLine(songLine, htmlParts);
    }

    var body = htmlParts.join("");
    if (twoColumns) {
        body = "<div style='columns:2; column-gap:32px'>" + body + "</div>";
    }

    document.getElementById("preview-content").innerHTML = body;
    applyDynamicCSS();

    lastHtmlSB = buildStandaloneHtml(body, songTitle);
    setStatus("Converted: " + (songTitle || "untitled") +
        (getTransposeSelection() !== 0 ? " | Transpose: " + transposeLevels[transposeIndex] : ""));
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE HTML EXPORT  (mirrors Java's printStyleSheet() output)
// ─────────────────────────────────────────────────────────────────────────────
function fontFamily(fontStyle) {
    switch (parseInt(fontStyle)) {
        case 0:  return '"Arial", Arial';
        case 1:  return '"Courier New", Courier';
        default: return '"Times New Roman", "Times New Roman"';
    }
}

function buildStandaloneHtml(bodyHtml, title) {
    var ff = fontFamily(cfg.font_style);
    var sb = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN">\n';
    sb += "<html><head>\n";
    sb += "<style type=\"text/css\"><!--\n";
    sb += "h1 { font-family:\"Arial\", Helvetica; font-size:" + cfg.h1_size + "pt; }\n";
    sb += "h2 { font-family:\"Arial\", Helvetica; font-size:" + cfg.h2_size + "pt; }\n";
    sb += ".lyrics, .lyrics_chorus { font-size:" + cfg.lyric_size + "pt; font-family:" + ff + "; }\n";
    sb += ".lyrics_tab, .lyrics_chorus_tab { font-family:" + ff + "; font-size:" + cfg.tab_size + "pt; }\n";
    sb += ".lyrics_chorus, .lyrics_chorus_tab, .chords_chorus, .chords_chorus_tab { font-weight:" + cfg.chorus_weight + "; font-family:" + ff + "; }\n";
    sb += ".chords, .chords_chorus, .chords_tab, .chords_chorus_tab { font-size:" + cfg.chord_size + "pt; font-weight:" + cfg.chord_weight + "; color:" + cfg.chord_color + "; padding-right:4pt; font-family:" + ff + "; }\n";
    sb += ".comment, .comment_italic, .comment_box { background-color:" + cfg.comment_bgcolor + "; font-weight:" + cfg.comment_weight + ";}\n";
    sb += ".comment_italic { font-style:italic; }\n";
    sb += ".comment_box { border:solid; }\n";
    sb += "--></style>\n";
    sb += "<title>" + esc(title || "") + "</title></head><body>\n";
    sb += bodyHtml;
    sb += "</body></html>";
    return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC CSS  — updates live preview to match current settings
// ─────────────────────────────────────────────────────────────────────────────
function applyDynamicCSS() {
    var ff  = fontFamily(cfg.font_style);
    var css =
        "#preview-content h1 { font-family:\"Arial\",Helvetica; font-size:" + cfg.h1_size + "pt; }\n" +
        "#preview-content h2 { font-family:\"Arial\",Helvetica; font-size:" + cfg.h2_size + "pt; }\n" +
        ".lyrics, .lyrics_chorus { font-size:" + cfg.lyric_size + "pt; font-family:" + ff + "; }\n" +
        ".lyrics_tab, .lyrics_chorus_tab { font-family:" + ff + "; font-size:" + cfg.tab_size + "pt; }\n" +
        ".lyrics_chorus, .lyrics_chorus_tab, .chords_chorus, .chords_chorus_tab { font-weight:" + cfg.chorus_weight + "; font-family:" + ff + "; }\n" +
        ".chords, .chords_chorus, .chords_tab, .chords_chorus_tab { font-size:" + cfg.chord_size + "pt; font-weight:" + cfg.chord_weight + "; color:" + cfg.chord_color + "; padding-right:4pt; font-family:" + ff + "; }\n" +
        ".comment, .comment_italic, .comment_box { background-color:" + cfg.comment_bgcolor + "; font-weight:" + cfg.comment_weight + "; }\n" +
        ".comment_italic { font-style:italic; }\n" +
        ".comment_box { border:solid; }\n";
    document.getElementById("dynamic-css").textContent = css;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
function openSettingsModal() {
    document.getElementById("s-h1-size").value        = cfg.h1_size;
    document.getElementById("s-h2-size").value        = cfg.h2_size;
    document.getElementById("s-lyric-size").value     = cfg.lyric_size;
    document.getElementById("s-tab-size").value       = cfg.tab_size;
    document.getElementById("s-chord-size").value     = cfg.chord_size;
    document.getElementById("s-chord-weight").value   = cfg.chord_weight;
    document.getElementById("s-chorus-weight").value  = cfg.chorus_weight;
    document.getElementById("s-comment-weight").value = cfg.comment_weight;
    document.getElementById("s-chord-color").value    = cfg.chord_color;
    document.getElementById("s-comment-bgcolor").value= cfg.comment_bgcolor;
    document.getElementById("s-font-style").value     = cfg.font_style;
    syncPicker("s-chord-color",     "s-chord-color-picker");
    syncPicker("s-comment-bgcolor", "s-comment-color-picker");
    openModal("modal-settings");
}

function syncPicker(textId, pickerId) {
    try { document.getElementById(pickerId).value = cssColorToHex(document.getElementById(textId).value); }
    catch (e) {}
}

function cssColorToHex(color) {
    var tmp = document.createElement("div");
    tmp.style.color = color;
    document.body.appendChild(tmp);
    var computed = window.getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    var m = computed.match(/\d+/g);
    if (!m) return "#000000";
    return "#" + m.slice(0, 3).map(function (v) { return ("0" + parseInt(v).toString(16)).slice(-2); }).join("");
}

document.getElementById("s-chord-color-picker").addEventListener("input", function () {
    document.getElementById("s-chord-color").value = this.value;
});
document.getElementById("s-comment-color-picker").addEventListener("input", function () {
    document.getElementById("s-comment-bgcolor").value = this.value;
});
document.getElementById("s-chord-color").addEventListener("input", function () {
    syncPicker("s-chord-color", "s-chord-color-picker");
});
document.getElementById("s-comment-bgcolor").addEventListener("input", function () {
    syncPicker("s-comment-bgcolor", "s-comment-color-picker");
});

function saveSettings() {
    cfg.h1_size         = document.getElementById("s-h1-size").value;
    cfg.h2_size         = document.getElementById("s-h2-size").value;
    cfg.lyric_size      = document.getElementById("s-lyric-size").value;
    cfg.tab_size        = document.getElementById("s-tab-size").value;
    cfg.chord_size      = document.getElementById("s-chord-size").value;
    cfg.chord_weight    = document.getElementById("s-chord-weight").value;
    cfg.chorus_weight   = document.getElementById("s-chorus-weight").value;
    cfg.comment_weight  = document.getElementById("s-comment-weight").value;
    cfg.chord_color     = document.getElementById("s-chord-color").value;
    cfg.comment_bgcolor = document.getElementById("s-comment-bgcolor").value;
    cfg.font_style      = document.getElementById("s-font-style").value;
    try { localStorage.setItem("jwebchord_cfg", JSON.stringify(cfg)); } catch (e) {}
    applyDynamicCSS();
    closeModal("modal-settings");
    setStatus("Settings saved.");
}

function loadSettings() {
    try {
        var saved = localStorage.getItem("jwebchord_cfg");
        if (saved) { var s = JSON.parse(saved); for (var k in s) cfg[k] = s[k]; }
    } catch (e) {}
    applyDynamicCSS();
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR MODAL
// ─────────────────────────────────────────────────────────────────────────────
function openEditorModal() {
    document.getElementById("modal-editor-text").value =
        document.getElementById("source-editor").value;
    openModal("modal-editor");
}

function applyEditorText() {
    document.getElementById("source-editor").value =
        document.getElementById("modal-editor-text").value;
    closeModal("modal-editor");
    setStatus("Editor text applied to source.");
}

// ─────────────────────────────────────────────────────────────────────────────
// HELP / ABOUT
// ─────────────────────────────────────────────────────────────────────────────
function openHelpModal()  { openModal("modal-help");  }
function openAboutModal() { openModal("modal-about"); }

// ─────────────────────────────────────────────────────────────────────────────
// TOOLBAR TOGGLES
// ─────────────────────────────────────────────────────────────────────────────
function toggleChords() {
    showChords = !showChords;
    var btn = document.getElementById("chords-btn");
    btn.textContent = showChords ? "Hide Chords" : "Show Chords";
    btn.classList.toggle("active", !showChords);
    setStatus(showChords ? "Chords visible." : "Chords hidden.");
}

function toggleColumns() {
    twoColumns = !twoColumns;
    document.getElementById("cols-btn").classList.toggle("active", twoColumns);
    setStatus(twoColumns ? "Two-column layout." : "Single-column layout.");
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE LOADING
// ─────────────────────────────────────────────────────────────────────────────
function loadFile(evt) {
    var file = evt.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById("source-editor").value = e.target.result;
        setStatus("Loaded: " + file.name + " — click Convert Song to render.");
    };
    reader.readAsText(file);
    evt.target.value = "";   // allow re-selecting the same file
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT HTML
// ─────────────────────────────────────────────────────────────────────────────
function exportHtml() {
    if (!lastHtmlSB) {
        setStatus("Convert a song first before exporting.");
        return;
    }
    var blob = new Blob([lastHtmlSB], { type: "text/html" });
    var url  = URL.createObjectURL(blob);
    document.getElementById("export-link").href = url;
    openModal("modal-export");
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function esc(s) {
    if (!s) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function setStatus(msg) {
    document.getElementById("statusbar").textContent = msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPLITTER — drag to resize the editor pane
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    var splitter   = document.getElementById("splitter");
    var editorPane = document.getElementById("editor-pane");
    var dragging = false, startX = 0, startW = 0;

    splitter.addEventListener("mousedown", function (e) {
        dragging = true; startX = e.clientX; startW = editorPane.offsetWidth;
        document.body.style.cursor     = "col-resize";
        document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", function (e) {
        if (!dragging) return;
        editorPane.style.width = Math.max(180, Math.min(600, startW + (e.clientX - startX))) + "px";
    });
    document.addEventListener("mouseup", function () {
        if (dragging) {
            dragging = false;
            document.body.style.cursor     = "";
            document.body.style.userSelect = "";
        }
    });
}());

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
loadSettings();
updateTransposeDisplay();

document.getElementById("source-editor").value = [
    "{title:} Amazing Grace",
    "{subtitle:} Traditional Hymn",
    "{key:} G",
    "{capo:} 2",
    "",
    "{comment:} Verse 1",
    "[G]Amazing [G7]grace, how [C]sweet the [G]sound",
    "That [G]saved a [Em]wretch like [D7]me",
    "[G]I once was [G7]lost but [C]now am [G]found",
    "Was [G]blind but [D7]now I [G]see",
    "",
    "{start_of_chorus}",
    "[C]Grace, [G]grace, God's [Em]grace",
    "[C]Grace that will [G]pardon and [D7]cleanse within",
    "[C]Grace, [G]grace, God's [Em]grace",
    "[C]Grace that is [G]greater than [D7]all my [G]sin",
    "{end_of_chorus}",
    "",
    "{comment:} Verse 2",
    "[G]'Twas grace that [G7]taught my [C]heart to [G]fear",
    "And [G]grace my [Em]fears re-[D7]lieved",
    "[G]How precious [G7]did that [C]grace ap-[G]pear",
    "The [G]hour I [D7]first be-[G]lieved",
    "",
    "{comment_italic:} Optional verse",
    "[G]When we've been [G7]there ten [C]thousand [G]years",
    "Bright [G]shining as the [Em]sun",
    "[G]We've no less [G7]days to [C]sing God's [G]praise",
    "Than [G]when we'd [D7]first be-[G]gun",
    "",
    "{comment_box:} End of song",
    "# This line is a comment and will be hidden"
].join("\n");

convertSong();
