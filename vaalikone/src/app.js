"use strict";
/* Vaalikone — käyttöliittymä. Ydinlogiikka: src/engine.js (window.Vaalikone).
   Näkymät reititetään URL-fragmentista:
     (tyhjä)   -> muokkain (tee oma vaalikone)
     #k=KOODI  -> vastaaja (kyllä/ei + paino + ohitus, tulokset)
     #e=KOODI  -> ehdokas (vastaa ja lähetä koodi tekijälle)          */
(() => {
  const V = window.Vaalikone;
  const app = document.getElementById("app");
  const DRAFT_KEY = "vaalikone.draft.v1";

  /* ---------------- DOM-apurit (ei innerHTML:ää käyttäjän tekstille) ------ */

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else if (k === "html") node.innerHTML = v; // vain omille ikoneille
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  const ICONS = {
    yes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M15 8l4 4-4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M9 6l-6 6 6 6"/></svg>',
  };
  const icon = (name) => el("span", { class: "ic", html: ICONS[name], "aria-hidden": "true" });

  let toastTimer = null;
  function toast(msg, bad) {
    let t = document.getElementById("toast");
    if (!t) { t = el("div", { id: "toast" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ""; }, 2600);
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Kopioitu leikepöydälle.");
    } catch (_e) {
      const ta = el("textarea", { class: "visually-hidden" });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(okMsg || "Kopioitu leikepöydälle."); }
      catch (_e2) { toast("Kopiointi ei onnistunut — valitse ja kopioi itse.", true); }
      ta.remove();
    }
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 2 + "px";
  }

  const ansLabel = (a) => (a === V.YES ? "Kyllä" : a === V.NO ? "Ei" : "–");
  const fmtW = (w) => String(w).replace(".", ",");
  const CUSTOM_WEIGHTS = [0.5, 4, 5, 6, 7, 8, 9, 10];

  /* ---------------- Muokkaimen luonnos ---------------- */

  function defaultDraft() {
    return { title: "", desc: "", questions: [""], candidates: [] };
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (d && Array.isArray(d.questions) && Array.isArray(d.candidates)) {
        d.candidates.forEach((c) => {
          if (!Array.isArray(c.answers)) c.answers = [];
        });
        return d;
      }
    } catch (_e) { /* rikkinäinen luonnos -> aloitetaan puhtaalta */ }
    return defaultDraft();
  }

  function saveDraft(d) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (_e) { /* täynnä */ }
  }

  /* ---------------- Yhteiset rakennuspalat ---------------- */

  function header(sub, homeLink) {
    return el("header", { class: "mast" },
      el("p", { class: "kicker", text: "selainpelit.fi" }),
      el("h1", null, "Vaali", el("span", { class: "dot", text: "kone" })),
      el("div", { class: "rule" }),
      sub ? el("p", { class: "lede", text: sub }) : null,
      homeLink
        ? el("p", { class: "backrow" },
            el("a", { class: "textlink", href: "/", text: "‹ selainpelit.fi" }),
            " · ",
            el("a", { class: "textlink", href: location.pathname, text: "Tee oma vaalikone" }))
        : null,
    );
  }

  function card(title, hint, ...children) {
    return el("section", { class: "card" },
      title ? el("h2", { text: title }) : null,
      hint ? el("p", { class: "hint", text: hint }) : null,
      ...children,
    );
  }

  /* ==================== MUOKKAIN ==================== */

  let draft = null;
  let shareToken = 0;
  let scheduleShare = () => {};

  function renderEditor() {
    if (!draft) draft = loadDraft();
    const d = draft;
    app.replaceChildren();

    app.appendChild(header("Tee oma vaalikone: kirjoita kyllä/ei-väitteet, lisää ehdokkaat ja jaa linkki. Kaikki kulkee linkissä — mitään ei tallenneta palvelimelle.", false));
    const back = el("p", { class: "backrow" }, el("a", { class: "textlink", href: "/", text: "‹ Takaisin etusivulle" }));
    app.appendChild(back);

    /* --- Perustiedot --- */
    const titleIn = el("input", {
      class: "field", type: "text", value: d.title, maxlength: String(V.LIMITS.title),
      placeholder: "Esim. Kylävaalikone 2026",
      oninput: (e) => { d.title = e.target.value; saveDraft(d); scheduleShare(); },
    });
    const descIn = el("textarea", {
      class: "field", rows: "2", maxlength: String(V.LIMITS.desc),
      placeholder: "Lyhyt kuvaus vastaajalle (valinnainen).",
      oninput: (e) => { d.desc = e.target.value; saveDraft(d); autoGrow(e.target); scheduleShare(); },
    });
    descIn.value = d.desc;
    app.appendChild(card("1 · Perustiedot", null,
      el("label", { class: "flabel", text: "Vaalikoneen nimi" }), titleIn,
      el("label", { class: "flabel", text: "Kuvaus" }), descIn,
    ));

    /* --- Kysymykset --- */
    const qList = el("div", { class: "qlist" });
    d.questions.forEach((q, i) => {
      const ta = el("textarea", {
        class: "field qtext", rows: "1", maxlength: String(V.LIMITS.questionText),
        placeholder: "Kirjoita väite, johon vastataan kyllä tai ei…",
        oninput: (e) => { d.questions[i] = e.target.value; saveDraft(d); autoGrow(e.target); scheduleShare(); },
      });
      ta.value = q;
      const row = el("div", { class: "qrow" },
        el("span", { class: "qnum", text: String(i + 1) }),
        ta,
        el("div", { class: "qbtns" },
          el("button", { class: "mini", title: "Siirrä ylös", disabled: i === 0 ? "" : null, onclick: () => {
            [d.questions[i - 1], d.questions[i]] = [d.questions[i], d.questions[i - 1]];
            d.candidates.forEach((c) => { [c.answers[i - 1], c.answers[i]] = [c.answers[i], c.answers[i - 1]]; });
            saveDraft(d); renderEditor();
          } }, icon("up")),
          el("button", { class: "mini", title: "Siirrä alas", disabled: i === d.questions.length - 1 ? "" : null, onclick: () => {
            [d.questions[i + 1], d.questions[i]] = [d.questions[i], d.questions[i + 1]];
            d.candidates.forEach((c) => { [c.answers[i + 1], c.answers[i]] = [c.answers[i], c.answers[i + 1]]; });
            saveDraft(d); renderEditor();
          } }, icon("down")),
          el("button", { class: "mini danger", title: "Poista kysymys", onclick: () => {
            d.questions.splice(i, 1);
            d.candidates.forEach((c) => c.answers.splice(i, 1));
            if (d.questions.length === 0) d.questions.push("");
            saveDraft(d); renderEditor();
          } }, icon("trash")),
        ),
      );
      qList.appendChild(row);
    });
    const addQ = el("button", {
      class: "btn ghost", onclick: () => {
        if (d.questions.length >= V.LIMITS.questions) { toast("Enimmäismäärä on " + V.LIMITS.questions + " kysymystä.", true); return; }
        d.questions.push(""); saveDraft(d); renderEditor();
        const tas = app.querySelectorAll(".qtext");
        if (tas.length) tas[tas.length - 1].focus();
      },
    }, "+ Lisää kysymys");
    app.appendChild(card("2 · Kysymykset",
      "Kirjoita väitteitä, joihin vastataan kyllä tai ei — esim. ”Kuntaveroa pitää laskea.”",
      qList, addQ));

    /* --- Ehdokkaat --- */
    const cList = el("div", { class: "clist" });
    d.candidates.forEach((c, ci) => cList.appendChild(candidateCard(d, c, ci)));

    const importIn = el("input", { class: "field mono", type: "text", placeholder: "Liitä ehdokkaan vastauskoodi (VE…)" });
    const importBtn = el("button", { class: "btn ghost", onclick: async () => {
      const qCount = d.questions.filter((q) => q.trim()).length;
      try {
        const r = await V.decodeReply(importIn.value, d.questions.length);
        const existing = d.candidates.find((x) => x.name.trim().toLowerCase() === r.name.toLowerCase());
        if (existing) { existing.answers = r.answers; toast("Päivitetty: " + r.name); }
        else {
          d.candidates.push({ name: r.name, party: "", answers: r.answers, open: true });
          toast("Lisätty: " + r.name);
        }
        saveDraft(d); renderEditor();
      } catch (e) {
        toast(e.message + (qCount !== d.questions.length ? " (Huom. tyhjät kysymykset lasketaan mukaan.)" : ""), true);
      }
    } }, "Tuo vastauskoodi");

    app.appendChild(card("3 · Ehdokkaat",
      "Merkitse ehdokkaiden kannat itse — tai lähetä heille ehdokaslinkki ja tuo saamasi vastauskoodi tästä.",
      cList,
      el("button", { class: "btn ghost", onclick: () => {
        if (d.candidates.length >= V.LIMITS.candidates) { toast("Enimmäismäärä on " + V.LIMITS.candidates + " ehdokasta.", true); return; }
        d.candidates.push({ name: "", party: "", answers: d.questions.map(() => V.SKIP), open: true });
        saveDraft(d); renderEditor();
      } }, "+ Lisää ehdokas"),
      el("div", { class: "importrow" }, importIn, importBtn),
    ));

    /* --- Jaa --- */
    const shareBox = el("div", { id: "sharebox" }, el("p", { class: "hint", text: "…" }));
    app.appendChild(card("4 · Jaa vaalikone",
      "Vastaajalinkki on valmis vaalikone. Ehdokaslinkissä on vain kysymykset — ehdokas vastaa ja lähettää sinulle koodin.",
      shareBox,
      el("div", { class: "editor-foot" },
        el("details", null,
          el("summary", { text: "Avaa olemassa oleva vaalikone muokattavaksi" }),
          (() => {
            const inp = el("input", { class: "field mono", type: "text", placeholder: "Liitä vastaajalinkki tai VK-koodi" });
            return el("div", { class: "importrow" }, inp,
              el("button", { class: "btn ghost", onclick: async () => {
                try {
                  const raw = inp.value.trim();
                  const m = /(VK[12]\.[A-Za-z0-9_-]+)/.exec(raw);
                  if (!m) throw new Error("Tekstistä ei löytynyt vaalikonekoodia.");
                  const c = await V.decodeCompass(m[1]);
                  draft = {
                    title: c.title, desc: c.desc, questions: c.questions.slice(),
                    candidates: c.candidates.map((x) => ({ name: x.name, party: x.party, answers: x.answers.slice() })),
                  };
                  saveDraft(draft); renderEditor(); toast("Vaalikone avattu muokattavaksi.");
                } catch (e) { toast(e.message, true); }
              } }, "Avaa"));
          })(),
        ),
        el("button", { class: "btn ghost danger", onclick: () => {
          if (!confirm("Tyhjennetäänkö koko luonnos?")) return;
          draft = defaultDraft(); saveDraft(draft); renderEditor();
        } }, "Tyhjennä luonnos"),
      ),
    ));

    app.appendChild(footer());
    app.querySelectorAll("textarea.field").forEach(autoGrow);

    /* Jakolinkkien päivitys (async) */
    scheduleShare = () => updateShare(++shareToken);
    scheduleShare();
    async function updateShare(token) {
      const cleaned = {
        title: d.title, desc: d.desc,
        questions: d.questions.map((q) => q.trim()).filter(Boolean),
        candidates: d.candidates
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name, party: c.party, answers: d.questions.map((q, i) => (q.trim() ? (c.answers[i] || V.SKIP) : null)).filter((a) => a !== null) })),
      };
      const errs = V.validateCompass(cleaned);
      const box = document.getElementById("sharebox");
      if (!box || token !== shareToken) return;
      if (errs.length) {
        box.replaceChildren(
          el("p", { class: "hint", text: "Linkit ilmestyvät tähän, kun vaalikone on valmis:" }),
          el("ul", { class: "errlist" }, errs.map((e) => el("li", { text: e }))),
        );
        return;
      }
      try {
        const base = location.origin + location.pathname;
        const voterLink = base + "#k=" + (await V.encodeCompass(cleaned));
        const candLink = base + "#e=" + (await V.encodeCompass(cleaned, { includeCandidates: false }));
        if (token !== shareToken) return;
        box.replaceChildren(
          shareRow("Vastaajalinkki", "Jaa tämä äänestäjille.", voterLink, true),
          shareRow("Ehdokaslinkki", "Lähetä tämä ehdokkaille.", candLink, false),
        );
      } catch (e) {
        box.replaceChildren(el("p", { class: "hint", text: e.message }));
      }
    }

    function shareRow(name, hint, link, preview) {
      const inp = el("input", { class: "field mono", type: "text", readonly: "", value: link, onclick: (e) => e.target.select() });
      return el("div", { class: "sharerow" },
        el("div", { class: "sharehead" },
          el("b", { text: name }), el("span", { class: "hint", text: " " + hint }),
          el("span", { class: "linklen", text: Math.round(link.length / 100) / 10 + " k merkkiä" })),
        el("div", { class: "importrow" },
          inp,
          el("button", { class: "btn brass", onclick: () => copyText(link, name + " kopioitu.") }, icon("copy"), "Kopioi"),
          preview ? el("a", { class: "btn ghost", href: link, target: "_blank", rel: "noopener", text: "Esikatsele" }) : null,
        ),
      );
    }
  }

  function candidateCard(d, c, ci) {
    const answered = c.answers.filter((a) => a === V.YES || a === V.NO).length;
    const det = el("details", { class: "cand" });
    if (c.open) det.setAttribute("open", "");
    det.addEventListener("toggle", () => { c.open = det.open; saveDraft(d); });

    const sumName = el("b", { text: c.name.trim() || "Nimetön ehdokas" });
    const sumParty = el("span", { class: "party", text: c.party.trim() });
    det.appendChild(el("summary", null,
      sumName, sumParty,
      el("span", { class: "cstat", text: answered + "/" + d.questions.length + " kantaa" }),
    ));

    const nameIn = el("input", {
      class: "field", type: "text", value: c.name, maxlength: String(V.LIMITS.name), placeholder: "Nimi",
      oninput: (e) => {
        c.name = e.target.value;
        sumName.textContent = c.name.trim() || "Nimetön ehdokas";
        saveDraft(d); scheduleShare();
      },
    });
    const partyIn = el("input", {
      class: "field", type: "text", value: c.party, maxlength: String(V.LIMITS.party), placeholder: "Puolue / ryhmä (valinnainen)",
      oninput: (e) => {
        c.party = e.target.value;
        sumParty.textContent = c.party.trim();
        saveDraft(d); scheduleShare();
      },
    });

    const rows = el("div", { class: "canswers" });
    d.questions.forEach((q, qi) => {
      const seg = el("div", { class: "seg" },
        [[V.YES, "Kyllä"], [V.NO, "Ei"], [V.SKIP, "–"]].map(([val, label]) =>
          el("button", {
            class: "segbtn" + (c.answers[qi] === val || (!c.answers[qi] && val === V.SKIP) ? " on " + val : ""),
            onclick: (e) => {
              c.answers[qi] = val; saveDraft(d);
              seg.querySelectorAll(".segbtn").forEach((b) => { b.className = "segbtn"; });
              e.currentTarget.className = "segbtn on " + val;
              det.querySelector(".cstat").textContent =
                c.answers.filter((a) => a === V.YES || a === V.NO).length + "/" + d.questions.length + " kantaa";
              scheduleShare();
            },
          }, label)),
      );
      rows.appendChild(el("div", { class: "carow" },
        el("span", { class: "qnum", text: String(qi + 1) }),
        el("span", { class: "caq", text: q.trim() || "(tyhjä kysymys)" }),
        seg,
      ));
    });

    det.appendChild(el("div", { class: "cbody" },
      el("div", { class: "crowinputs" }, nameIn, partyIn),
      rows,
      el("button", { class: "btn ghost danger", onclick: () => {
        if (!confirm("Poistetaanko " + (c.name.trim() || "ehdokas") + "?")) return;
        d.candidates.splice(ci, 1); saveDraft(d); renderEditor();
      } }, "Poista ehdokas"),
    ));
    return det;
  }

  /* ==================== VASTAAJA & EHDOKAS ==================== */

  function renderIntro(compass, mode) {
    app.replaceChildren();
    app.appendChild(header(null, true));
    const isVoter = mode === "voter";
    app.appendChild(card(null, null,
      el("p", { class: "kicker small", text: isVoter ? "Vaalikone" : "Ehdokkaan vastauslomake" }),
      el("h2", { class: "ctitle", text: compass.title }),
      compass.desc ? el("p", { class: "cdesc", text: compass.desc }) : null,
      el("p", { class: "meta", text: compass.questions.length + " kysymystä" + (isVoter ? " · " + compass.candidates.length + " ehdokasta" : "") }),
      el("p", { class: "hint", text: isVoter
        ? "Vastaa kyllä tai ei. Voit ohittaa merkityksettömän kysymyksen ja painottaa itsellesi tärkeitä."
        : "Vastaa kyllä tai ei — tai ohita, jos et ota kantaa. Lopuksi saat koodin, jonka lähetät vaalikoneen tekijälle." }),
      el("div", { class: "introbtns" },
        el("button", { class: "btn brass big", onclick: () => renderQuestion(compass, mode, V.createSession(compass.questions.length)) },
          isVoter ? "Aloita" : "Aloita vastaaminen"),
      ),
    ));
    app.appendChild(footer());
  }

  function renderQuestion(compass, mode, session) {
    if (session.done()) {
      return mode === "voter" ? renderResults(compass, session) : renderReplyCode(compass, session);
    }
    const isVoter = mode === "voter";
    const i = session.pos;
    const prev = session.current();
    let weight = prev && prev.w ? prev.w : V.DEFAULT_WEIGHT;

    app.replaceChildren();
    app.appendChild(header(null, true));

    const pct = Math.round((i / session.count) * 100);
    const progress = el("div", { class: "progress", role: "progressbar", "aria-valuenow": String(i), "aria-valuemax": String(session.count) },
      el("div", { class: "progressfill", style: "width:" + pct + "%" }));

    const answer = (a, w) => { session.answer(a, w); renderQuestion(compass, mode, session); };

    let weightChips = null;
    if (isVoter) {
      const wsel = el("select", { class: "chip wsel", "aria-label": "Muu painoarvo" },
        el("option", { value: "", text: "Muu…" }),
        CUSTOM_WEIGHTS.map((v) => el("option", { value: String(v), text: fmtW(v) + "×" })));
      weightChips = el("div", { class: "weights" },
        el("span", { class: "wlabel", text: "Painoarvo:" }),
        V.WEIGHTS.map((w) =>
          el("button", {
            class: "chip", "data-w": String(w),
            onclick: () => { weight = w; setActiveWeight(); },
          }, w === 1 ? "Normaali 1×" : w === 2 ? "Tärkeä 2×" : "Erittäin tärkeä 3×")),
        wsel);
      wsel.addEventListener("change", () => {
        const v = parseFloat(wsel.value);
        if (v > 0) weight = V.sanitizeWeight(v);
        setActiveWeight();
      });
      const setActiveWeight = () => {
        weightChips.querySelectorAll(".chip[data-w]").forEach((b) =>
          b.classList.toggle("on", Number(b.getAttribute("data-w")) === weight));
        const custom = !V.WEIGHTS.includes(weight);
        wsel.classList.toggle("on", custom);
        wsel.value = custom ? String(weight) : "";
      };
      setActiveWeight();
    }

    app.appendChild(el("section", { class: "card qcard" },
      el("div", { class: "qtop" },
        el("span", { class: "qcount", text: "Kysymys " + (i + 1) + " / " + session.count }),
        el("span", { class: "qtitle", text: compass.title }),
      ),
      progress,
      el("h2", { class: "claim", text: compass.questions[i] }),
      weightChips,
      el("div", { class: "answerbtns" },
        el("button", { class: "btn yes big", onclick: () => answer(V.YES, weight) }, icon("yes"), "Kyllä"),
        el("button", { class: "btn no big", onclick: () => answer(V.NO, weight) }, icon("no"), "Ei"),
      ),
      el("div", { class: "underbtns" },
        el("button", { class: "btn ghost", onclick: () => answer(V.SKIP, 0) }, icon("skip"),
          isVoter ? "Ohita — ei merkitystä minulle" : "Ohita — en ota kantaa"),
        prev ? el("button", { class: "btn ghost", onclick: () => answer(prev.a, prev.a === V.SKIP ? 0 : prev.w) },
          "Pidä ennallaan (" + ansLabel(prev.a) + ")") : null,
      ),
      el("div", { class: "navrow" },
        i > 0 || prev
          ? el("button", { class: "textbtn", onclick: () => { session.back(); renderQuestion(compass, mode, session); } }, icon("back"), " Edellinen")
          : el("span"),
        prev ? el("span", { class: "hint", text: "Aiempi vastauksesi: " + ansLabel(prev.a) }) : el("span"),
      ),
    ));
    app.appendChild(footer());
  }

  /* --- Vastaajan tulokset --- */

  function renderResults(compass, session) {
    const results = V.matchAll(compass, session.answers);
    const answered = session.answers.filter((x) => x && x.a !== V.SKIP).length;

    app.replaceChildren();
    app.appendChild(header(null, true));

    const list = el("div", { class: "results" });
    results.forEach((r, rank) => {
      const det = el("details", { class: "result" + (rank === 0 && r.pct != null ? " top" : "") });
      det.appendChild(el("summary", null,
        el("span", { class: "rank", text: String(rank + 1) + "." }),
        el("span", { class: "rname" },
          el("b", { text: r.name }),
          r.party ? el("span", { class: "party", text: r.party }) : null),
        el("span", { class: "rbarwrap" },
          el("span", { class: "rbar", style: "width:" + (r.pct || 0) + "%" })),
        el("span", { class: "rpct", text: r.pct == null ? "–" : r.pct + " %" }),
      ));
      const rows = el("div", { class: "breakdown" });
      if (r.pct == null) {
        rows.appendChild(el("p", { class: "hint", text: "Ei yhteisiä vastattuja kysymyksiä — osuvuutta ei voi laskea." }));
      } else {
        rows.appendChild(el("p", { class: "hint", text: "Samaa mieltä " + r.agree + " · eri mieltä " + r.disagree + " · vertailussa " + r.compared + " kysymystä painotettuina." }));
      }
      r.detail.forEach((dd, qi) => {
        rows.appendChild(el("div", { class: "brow " + dd.state },
          el("span", { class: "qnum", text: String(qi + 1) }),
          el("span", { class: "bq", text: compass.questions[qi] }),
          el("span", { class: "bans" },
            el("span", { class: "pill me " + dd.voter, text: "Sinä: " + ansLabel(dd.voter) + (dd.state !== "voterSkip" && dd.w !== 1 ? " " + fmtW(dd.w) + "×" : "") }),
            el("span", { class: "pill " + dd.cand, text: ansLabel(dd.cand) }),
          ),
        ));
      });
      det.appendChild(rows);
      list.appendChild(det);
    });

    app.appendChild(el("section", { class: "card" },
      el("p", { class: "kicker small", text: compass.title }),
      el("h2", { class: "ctitle", text: "Tuloksesi" }),
      el("p", { class: "meta", text: "Vastasit " + answered + " / " + session.count + " kysymykseen. Osuvuus painottaa tärkeiksi merkitsemiäsi kysymyksiä." }),
      list,
      el("div", { class: "introbtns" },
        el("button", { class: "btn ghost", onclick: () => { session.jump(0); renderQuestion(compass, "voter", session); } }, "Muuta vastauksia"),
        el("button", { class: "btn ghost", onclick: () => renderIntro(compass, "voter") }, "Aloita alusta"),
        el("a", { class: "btn ghost", href: location.pathname, text: "Tee oma vaalikone" }),
      ),
    ));
    app.appendChild(footer());
  }

  /* --- Ehdokkaan vastauskoodi --- */

  function renderReplyCode(compass, session) {
    app.replaceChildren();
    app.appendChild(header(null, true));

    const answers = session.answers.map((x) => (x ? x.a : V.SKIP));
    const taken = answers.filter((a) => a !== V.SKIP).length;
    const nameIn = el("input", { class: "field", type: "text", maxlength: String(V.LIMITS.name), placeholder: "Etunimi Sukunimi" });
    const out = el("textarea", { class: "field mono", rows: "3", readonly: "", onclick: (e) => e.target.select() });
    const copyBtn = el("button", { class: "btn brass", disabled: "", onclick: () => copyText(out.value, "Vastauskoodi kopioitu.") }, icon("copy"), "Kopioi koodi");

    let genToken = 0;
    nameIn.addEventListener("input", async () => {
      const token = ++genToken;
      const name = nameIn.value.trim();
      if (!name) { out.value = ""; copyBtn.setAttribute("disabled", ""); return; }
      try {
        const codeStr = await V.encodeReply(name, answers);
        if (token !== genToken) return;
        out.value = codeStr;
        copyBtn.removeAttribute("disabled");
        autoGrow(out);
      } catch (e) { toast(e.message, true); }
    });

    app.appendChild(el("section", { class: "card" },
      el("p", { class: "kicker small", text: compass.title }),
      el("h2", { class: "ctitle", text: "Valmista!" }),
      el("p", { class: "meta", text: "Otit kantaa " + taken + " / " + session.count + " kysymykseen." }),
      el("p", { class: "hint", text: "Kirjoita nimesi, kopioi koodi ja lähetä se vaalikoneen tekijälle (esim. viestillä tai sähköpostilla). Tekijä liittää koodin muokkaimeen, jolloin vastauksesi tulevat mukaan vaalikoneeseen." }),
      el("label", { class: "flabel", text: "Nimesi" }), nameIn,
      el("label", { class: "flabel", text: "Vastauskoodisi" }), out,
      el("div", { class: "introbtns" },
        copyBtn,
        el("button", { class: "btn ghost", onclick: () => { session.jump(0); renderQuestion(compass, "candidate", session); } }, "Muuta vastauksia"),
      ),
    ));
    app.appendChild(footer());
  }

  /* ==================== Reititys ==================== */

  function footer() {
    return el("footer", { class: "foot" },
      el("span", null, "Vaalikone · ", el("a", { class: "textlink", href: "/", text: "selainpelit.fi" })),
      el("span", { class: "hint", text: "Ei tilejä, ei seurantaa — vaalikone kulkee kokonaan linkissä." }),
    );
  }

  function renderError(message) {
    app.replaceChildren();
    app.appendChild(header(null, true));
    app.appendChild(card("Hups", null,
      el("p", { class: "cdesc", text: message }),
      el("div", { class: "introbtns" },
        el("a", { class: "btn brass", href: location.pathname, text: "Tee oma vaalikone" })),
    ));
    app.appendChild(footer());
  }

  async function route() {
    const h = location.hash || "";
    const m = /^#([ke])=(.+)$/.exec(h);
    if (!m) { renderEditor(); return; }
    try {
      const compass = await V.decodeCompass(decodeURIComponent(m[2]));
      if (m[1] === "k") {
        if (compass.candidates.length === 0) throw new Error("Tässä linkissä ei ole ehdokkaita — pyydä tekijältä uusi vastaajalinkki.");
        renderIntro(compass, "voter");
      } else {
        renderIntro(compass, "candidate");
      }
    } catch (e) {
      renderError(e.message || "Linkkiä ei voitu avata.");
    }
  }

  window.addEventListener("hashchange", route);
  route();

  // Selain-smoke-testien käyttöön (AGENTS.md: UI ilman DOM:ia + sama API selaimessa)
  window.VaalikoneUI = { route, renderEditor, get draft() { return draft; }, set draft(d) { draft = d; } };
})();
