import React, { useReducer, useEffect, useState } from "react";
import {
  getLegalMoves, safePlay, safePass, makeSim,
} from "./engine.js";
import { makeAnalysis } from "./analysis.js";
import { playMatch } from "./match.js";
import { BOTS, getBot } from "./botRegistry.js";
import { suitOf, rankOf, isRed, rankLabel, cardPoints, sortHand, SUIT_SYMBOL } from "./utils.js";

/* ============================================================
   HERTTA — käyttöliittymä. Pelaat paikalla 0; paikat 1–3 ovat
   valittavia botteja. Pelisäännöt tulevat engine.js:stä ja
   tekoälyt bots/-kansiosta.
   ============================================================ */

const PLAYERS = ["Sinä", "Länsi", "Pohjoinen", "Itä"];
const FELT = "linear-gradient(160deg,#155e4d 0%,#0e463a 55%,#082c25 100%)";
const CREAM = "#f6efdd", INK = "#1a1d1f", RED = "#c22f39", GOLD = "#d8b24a";
// Pelaajakohtaiset värit pelattujen korttien seurantaan.
const SEAT_COLORS = ["#4ea1ff", "#e0863a", "#c05de0", "#3ac0a0"]; // Sinä, Länsi, Pohjoinen, Itä
const SEAT_INITIAL = ["S", "L", "P", "I"];

const noVoids = () => [0, 1, 2, 3].map(() => ({ C: false, D: false, S: false, H: false }));
const DIRECTIONS = ["left", "right", "across", "hold"];

function deal() {
  const deck = [];
  for (const s of ["C", "D", "S", "H"]) for (let r = 2; r <= 14; r++) deck.push(s + r);
  for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[deck[i], deck[j]] = [deck[j], deck[i]]; }
  return [0, 1, 2, 3].map((i) => sortHand(deck.slice(i * 13, i * 13 + 13)));
}

function passTarget(dir, i) {
  return dir === "left" ? (i + 1) % 4 : dir === "right" ? (i + 3) % 4 : dir === "across" ? (i + 2) % 4 : i;
}

// Reilu näkymä botille (paljastaa vain oman käden + julkisen tiedon)
function buildView(s, seat) {
  const leadSuit = s.currentTrick.length ? suitOf(s.currentTrick[0].card) : null;
  const legalMoves = getLegalMoves(s.hands[seat], s.currentTrick, s.heartsBroken, s.trickCount === 0);
  const currentTrick = s.currentTrick.map((t) => ({ seat: t.player, card: t.card }));
  const view = {
    seat,
    hand: sortHand(s.hands[seat]),
    legalMoves: sortHand(legalMoves),
    trick: currentTrick,
    leader: s.leader,
    leadSuit,
    heartsBroken: s.heartsBroken,
    trickNumber: s.trickCount,
    playedCards: [...s.playedCards],
    scores: [...s.totalScores],
    handPoints: [...s.takenPoints],
    voids: s.voids,
    util: { suitOf, rankOf, cardPoints }, // liitetyt botit voivat käyttää ilman importteja
  };
  view.sim = makeSim({
    seat, hand: view.hand, playedCards: view.playedCards, currentTrick,
    leader: s.leader, heartsBroken: s.heartsBroken, trickNumber: s.trickCount,
    handPoints: view.handPoints, scores: view.scores, voids: s.voids,
  });
  view.analysis = makeAnalysis(view);
  return view;
}
function buildPassView(s, seat) {
  return {
    seat,
    hand: sortHand(s.hands[seat]),
    direction: s.passDirection,
    scores: [...s.totalScores],
    util: { suitOf, rankOf, cardPoints },
  };
}

// Kääntää liitetyn koodin botiksi selaimessa (ei importteja sallittu).
async function loadBotFromCode(code) {
  let src = (code || "").trim();
  if (!src) throw new Error("Liitä botin koodi.");
  if (/^\s*import\s/m.test(src)) {
    throw new Error("Liitetty botti ei saa käyttää import-lauseita — käytä view.util-apufunktioita.");
  }
  if (!/export\s+default/.test(src)) src = "export default (" + src + ");";
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    const bot = mod.default;
    if (!bot || typeof bot.playCard !== "function" || typeof bot.passCards !== "function")
      throw new Error("Botilla pitää olla passCards- ja playCard-funktiot.");
    return bot;
  } catch (e) {
    throw new Error(e.message || "Koodia ei voitu ladata.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const initialState = () => ({
  phase: "menu", hands: [[], [], [], []], handNumber: 0, passDirection: "left",
  humanPass: [], currentTrick: [], currentPlayer: 0, leader: 0, heartsBroken: false,
  trickCount: 0, takenPoints: [0, 0, 0, 0], totalScores: [0, 0, 0, 0],
  playedCards: [], playLog: [], voids: noVoids(), lastTrickWinner: null, message: "",
});

function startHand(state, handNumber) {
  const hands = deal();
  const direction = DIRECTIONS[(handNumber - 1) % 4];
  const base = {
    ...state, hands, handNumber, passDirection: direction, humanPass: [],
    currentTrick: [], heartsBroken: false, trickCount: 0, takenPoints: [0, 0, 0, 0],
    playedCards: [], playLog: [], voids: noVoids(), lastTrickWinner: null, _handScores: undefined,
  };
  if (direction === "hold") {
    const leader = hands.findIndex((h) => h.includes("C2"));
    return { ...base, leader, currentPlayer: leader, phase: "playing", message: "Ei vaihtoa. Risti 2 aloittaa." };
  }
  return { ...base, phase: "passing", message: "" };
}

function reducer(state, action) {
  switch (action.type) {
    case "NEW_GAME":
      return startHand({ ...initialState(), totalScores: [0, 0, 0, 0] }, 1);
    case "TOGGLE_PASS": {
      const c = action.card;
      let sel = state.humanPass;
      if (sel.includes(c)) sel = sel.filter((x) => x !== c);
      else if (sel.length < 3) sel = [...sel, c];
      return { ...state, humanPass: sel };
    }
    case "CONFIRM_PASS": {
      const dir = state.passDirection;
      const picks = [state.humanPass, action.aiPicks[1], action.aiPicks[2], action.aiPicks[3]];
      const newHands = state.hands.map((h, i) => h.filter((c) => !picks[i].includes(c)));
      for (let i = 0; i < 4; i++) newHands[passTarget(dir, i)] = newHands[passTarget(dir, i)].concat(picks[i]);
      const sorted = newHands.map(sortHand);
      const leader = sorted.findIndex((h) => h.includes("C2"));
      return { ...state, hands: sorted, humanPass: [], phase: "playing", leader, currentPlayer: leader, currentTrick: [], trickCount: 0, message: "Risti 2 aloittaa." };
    }
    case "PLAY_CARD": {
      const { player, card } = action;
      const led = state.currentTrick.length > 0 ? suitOf(state.currentTrick[0].card) : null;
      let voids = state.voids;
      if (led && suitOf(card) !== led) voids = state.voids.map((v, i) => (i === player ? { ...v, [led]: true } : v));
      const hands = state.hands.map((h, i) => (i === player ? h.filter((c) => c !== card) : h));
      const currentTrick = [...state.currentTrick, { player, card }];
      const heartsBroken = state.heartsBroken || suitOf(card) === "H" || card === "S12";
      return { ...state, hands, currentTrick, heartsBroken, voids, playedCards: [...state.playedCards, card], playLog: [...state.playLog, { player, card }], currentPlayer: currentTrick.length === 4 ? state.currentPlayer : (player + 1) % 4, message: "" };
    }
    case "RESOLVE_TRICK": {
      const led = suitOf(state.currentTrick[0].card);
      let w = state.currentTrick[0];
      for (const t of state.currentTrick) if (suitOf(t.card) === led && rankOf(t.card) > rankOf(w.card)) w = t;
      const pts = state.currentTrick.reduce((s, t) => s + cardPoints(t.card), 0);
      const takenPoints = [...state.takenPoints]; takenPoints[w.player] += pts;
      const trickCount = state.trickCount + 1;
      const handOver = state.hands.every((h) => h.length === 0);
      if (!handOver)
        return { ...state, currentTrick: [], leader: w.player, currentPlayer: w.player, trickCount, takenPoints, lastTrickWinner: w.player, message: `${PLAYERS[w.player]} voitti tikin${pts ? ` (+${pts})` : ""}.` };
      let handScores = [...takenPoints];
      const moon = handScores.findIndex((p) => p === 26);
      let msg = "";
      if (moon !== -1) { handScores = handScores.map((_, i) => (i === moon ? 0 : 26)); msg = `${PLAYERS[moon]} ampui kuun! Muille 26 pistettä.`; }
      const totalScores = state.totalScores.map((t, i) => t + handScores[i]);
      const end = totalScores.some((t) => t >= 100);
      return { ...state, currentTrick: [], trickCount, takenPoints, totalScores, lastTrickWinner: w.player, phase: end ? "gameEnd" : "handEnd", message: msg, _handScores: handScores };
    }
    case "NEXT_HAND":
      return startHand(state, state.handNumber + 1);
    default:
      return state;
  }
}

const TRICK_POS = {
  0: { left: "50%", bottom: 4, transform: "translateX(-50%)" },
  1: { left: 4, top: "50%", transform: "translateY(-50%)" },
  2: { left: "50%", top: 4, transform: "translateX(-50%)" },
  3: { right: 4, top: "50%", transform: "translateY(-50%)" },
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [showRules, setShowRules] = useState(false);
  const [botIds, setBotIds] = useState([null, "pro", "pro", "pro"]);
  const [customBots, setCustomBots] = useState({}); // seat -> bot-olio
  const [customErr, setCustomErr] = useState({});   // seat -> virheteksti
  const { phase, hands, currentTrick, currentPlayer, heartsBroken, trickCount, takenPoints, totalScores, message, humanPass, passDirection, playLog } = state;

  // Palauttaa paikan botin: joko rekisteristä tai liitetyn oman botin.
  const botForSeat = (seat) =>
    botIds[seat] === "custom" ? (customBots[seat] || getBot("pro")) : getBot(botIds[seat]);

  const onLoadCustom = async (seat, code) => {
    try {
      const bot = await loadBotFromCode(code);
      setCustomBots((p) => ({ ...p, [seat]: bot }));
      setCustomErr((p) => ({ ...p, [seat]: "" }));
    } catch (e) {
      setCustomBots((p) => ({ ...p, [seat]: undefined }));
      setCustomErr((p) => ({ ...p, [seat]: String(e.message || e) }));
    }
  };

  useEffect(() => {
    if (phase !== "playing") return;
    let t;
    if (currentTrick.length === 4) t = setTimeout(() => dispatch({ type: "RESOLVE_TRICK" }), 1050);
    else if (currentPlayer !== 0) {
      t = setTimeout(async () => {
        const card = await safePlay(botForSeat(currentPlayer), buildView(state, currentPlayer));
        dispatch({ type: "PLAY_CARD", player: currentPlayer, card });
      }, 600);
    }
    return () => clearTimeout(t);
  }, [phase, currentPlayer, currentTrick.length, trickCount, state, botIds, customBots]);

  const humanLegal = phase === "playing" && currentPlayer === 0 && currentTrick.length < 4
    ? getLegalMoves(hands[0], currentTrick, heartsBroken, trickCount === 0) : [];

  const confirmPass = async () => {
    const aiPicks = await Promise.all([null, 1, 2, 3].map((seat) =>
      seat === null ? null : safePass(botForSeat(seat), buildPassView(state, seat))));
    dispatch({ type: "CONFIRM_PASS", aiPicks });
  };

  const passDirLabel = { left: "vasemmalle \u2192", right: "\u2190 oikealle", across: "vastapäätä \u2195", hold: "ei vaihtoa" }[passDirection];
  const passTargetName = PLAYERS[passTarget(passDirection, 0)] || "";
  const winnerIdx = phase === "gameEnd" ? totalScores.indexOf(Math.min(...totalScores)) : null;
  const botName = (seat) =>
    botIds[seat] === "custom" ? (customBots[seat]?.name || "Oma (ei ladattu)") : (getBot(botIds[seat]) || {}).name || "";

  return (
    <div style={{ minHeight: "100vh", background: FELT, padding: "16px 12px 28px", fontFamily: "system-ui, sans-serif", color: CREAM, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ color: RED, fontSize: 30 }}>{"\u2665"}</span>
        <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 30, letterSpacing: 1, fontWeight: 700 }}>HERTTA</h1>
        <span style={{ color: RED, fontSize: 30 }}>{"\u2665"}</span>
      </div>

      {phase === "menu" ? (
        <MenuScreen botIds={botIds} setBotIds={setBotIds} customBots={customBots} customErr={customErr} onLoadCustom={onLoadCustom} onStart={() => dispatch({ type: "NEW_GAME" })} onRules={() => setShowRules(true)} />
      ) : (
        <div style={{ width: "100%", maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <ScoreBoard totals={totalScores} taken={takenPoints} current={phase === "playing" ? currentPlayer : -1} botName={botName} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Jako {state.handNumber} · Vaihto: {passDirLabel}</div>
              <div style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: heartsBroken ? "rgba(194,47,57,.28)" : "rgba(0,0,0,.25)", border: `1px solid ${heartsBroken ? RED : "rgba(255,255,255,.25)"}` }}>
                {heartsBroken ? "\u2665 Hertta murrettu" : "\u2665 Hertta ehjä"}
              </div>
              <button onClick={() => setShowRules(true)} style={ghostBtn}>Säännöt</button>
            </div>
          </div>

          <div style={{ position: "relative", borderRadius: 18, minHeight: 300, background: "radial-gradient(ellipse at center,#1c7059 0%,#0f4638 70%)", border: "6px solid #6b4a2a", boxShadow: "inset 0 0 60px rgba(0,0,0,.5)", padding: 10, marginBottom: 12 }}>
            <OpponentRow name={PLAYERS[2]} sub={botName(2)} count={hands[2].length} active={currentPlayer === 2 && phase === "playing"} />
            <SideOpponent name={PLAYERS[1]} sub={botName(1)} count={hands[1].length} active={currentPlayer === 1 && phase === "playing"} side="left" />
            <SideOpponent name={PLAYERS[3]} sub={botName(3)} count={hands[3].length} active={currentPlayer === 3 && phase === "playing"} side="right" />
            <div style={{ position: "relative", height: 200, margin: "8px auto", maxWidth: 360 }}>
              {currentTrick.map((t) => (
                <div key={t.player} style={{ position: "absolute", ...TRICK_POS[t.player] }}><Card card={t.card} small /></div>
              ))}
              {currentTrick.length === 0 && phase === "playing" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: 0.5, fontSize: 13 }}>
                  {currentPlayer === 0 ? "Sinun vuorosi" : `${PLAYERS[currentPlayer]} pelaa…`}
                </div>
              )}
            </div>
          </div>

          <div style={{ minHeight: 22, textAlign: "center", fontSize: 14, marginBottom: 6, color: GOLD }}>
            {phase === "passing" ? `Valitse 3 korttia (${passTargetName}). Valittu: ${humanPass.length}/3` : message}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", background: "rgba(0,0,0,.18)", padding: "12px 8px", borderRadius: 12 }}>
            {hands[0].map((c) => {
              const inPass = phase === "passing";
              const legalPlay = phase === "playing" && currentPlayer === 0 && humanLegal.includes(c);
              const clickable = inPass || legalPlay;
              return (
                <Card key={c} card={c} selected={inPass && humanPass.includes(c)} glow={legalPlay}
                  faded={phase === "playing" && currentPlayer === 0 && !legalPlay}
                  onClick={clickable ? () => dispatch(inPass ? { type: "TOGGLE_PASS", card: c } : { type: "PLAY_CARD", player: 0, card: c }) : undefined} />
              );
            })}
          </div>

          {phase === "passing" && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button onClick={confirmPass} disabled={humanPass.length !== 3} style={{ ...primaryBtn, opacity: humanPass.length === 3 ? 1 : 0.45 }}>Vaihda kortit →</button>
            </div>
          )}

          {(phase === "playing" || phase === "handEnd") && (
            <PlayedCards playLog={playLog} botName={botName} />
          )}
        </div>
      )}

      {(phase === "handEnd" || phase === "gameEnd") && (
        <Modal>
          <h2 style={{ margin: "0 0 10px", fontFamily: "Georgia,serif", color: GOLD }}>{phase === "gameEnd" ? "Peli päättyi!" : `Jako ${state.handNumber} päättyi`}</h2>
          {message && <p style={{ marginTop: 0, fontSize: 14, color: RED }}>{message}</p>}
          <div style={{ margin: "8px 0 16px" }}>
            {PLAYERS.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 2px", fontWeight: phase === "gameEnd" && i === winnerIdx ? 700 : 400, color: phase === "gameEnd" && i === winnerIdx ? GOLD : CREAM, borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                <span>{phase === "gameEnd" && i === winnerIdx ? "🏆 " : ""}{p}{i > 0 ? ` (${botName(i)})` : ""}</span>
                <span>+{state._handScores ? state._handScores[i] : takenPoints[i]} → {totalScores[i]}</span>
              </div>
            ))}
          </div>
          {phase === "gameEnd" && (
            <p style={{ textAlign: "center", fontSize: 15, margin: "0 0 14px" }}>
              {winnerIdx === 0 ? "Sinä voitit — pienin pistemäärä!" : `${PLAYERS[winnerIdx]} voitti.`}
            </p>
          )}
          <div style={{ textAlign: "center" }}>
            <button onClick={() => dispatch(phase === "gameEnd" ? { type: "NEW_GAME" } : { type: "NEXT_HAND" })} style={primaryBtn}>{phase === "gameEnd" ? "Uusi peli" : "Seuraava jako →"}</button>
          </div>
        </Modal>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Card({ card, small, faded, selected, onClick, glow, back }) {
  const w = small ? 40 : 62, h = small ? 56 : 88;
  if (back) return <div style={{ width: w, height: h, borderRadius: 7, background: "repeating-linear-gradient(45deg,#7a2230 0 6px,#8f2a3a 6px 12px)", border: "2px solid #f6efdd", boxShadow: "0 2px 6px rgba(0,0,0,.4)", flexShrink: 0 }} />;
  const col = isRed(card) ? RED : INK;
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{ width: w, height: h, borderRadius: 8, position: "relative", background: CREAM, color: col, border: selected ? `2px solid ${GOLD}` : "2px solid #cbbfa0", boxShadow: selected ? `0 0 0 2px ${GOLD}, 0 8px 16px rgba(0,0,0,.45)` : glow ? "0 -4px 14px rgba(216,178,74,.55),0 4px 10px rgba(0,0,0,.4)" : "0 3px 7px rgba(0,0,0,.4)", opacity: faded ? 0.4 : 1, cursor: onClick ? "pointer" : "default", transform: selected ? "translateY(-14px)" : "none", transition: "transform .12s, box-shadow .12s, opacity .12s", fontFamily: "Georgia, serif", flexShrink: 0, padding: 0 }}>
      <span style={{ position: "absolute", top: 4, left: 6, fontSize: small ? 12 : 16, fontWeight: 700, lineHeight: 1 }}>{rankLabel(rankOf(card))}</span>
      <span style={{ position: "absolute", top: small ? 15 : 19, left: 6, fontSize: small ? 12 : 15 }}>{SUIT_SYMBOL[suitOf(card)]}</span>
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: small ? 20 : 30 }}>{SUIT_SYMBOL[suitOf(card)]}</span>
    </button>
  );
}

// Pelattujen korttien seuranta: sama tieto joka boteilla on (playedCards + kuka
// pelasi) tuotuna näkyviin ihmispelaajalle — tasoittaa peliä botteja vastaan.
function PlayedCards({ playLog, botName }) {
  const [open, setOpen] = useState(true);
  const bySuit = { C: {}, D: {}, S: {}, H: {} };
  for (const { player, card } of playLog) bySuit[suitOf(card)][rankOf(card)] = player;
  const suits = [["C", "#f6efdd"], ["D", RED], ["S", "#f6efdd"], ["H", RED]];
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  return (
    <div style={{ background: "rgba(0,0,0,.22)", borderRadius: 12, padding: "8px 10px", marginTop: 12, border: "1px solid rgba(216,178,74,.28)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>Pelatut kortit {playLog.length ? `(${playLog.length}/52)` : ""}</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{open ? "piilota ▲" : "näytä ▼"}</span>
      </div>
      {open && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "6px 0 8px", fontSize: 10.5 }}>
            {[0, 1, 2, 3].map((s) => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.9 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: SEAT_COLORS[s], display: "inline-block" }} />
                {botName ? botName(s) : SEAT_INITIAL[s]}
              </span>
            ))}
          </div>
          {suits.map(([s, col]) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
              <span style={{ color: col, width: 16, fontSize: 15, textAlign: "center" }}>{SUIT_SYMBOL[s]}</span>
              {ranks.map((r) => {
                const who = bySuit[s][r];
                const played = who !== undefined;
                return (
                  <span key={r} title={played ? `${SEAT_INITIAL[who]} pelasi` : "pelaamatta"}
                    style={{
                      minWidth: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10.5, borderRadius: 4, fontWeight: played ? 700 : 400,
                      background: played ? SEAT_COLORS[who] : "rgba(255,255,255,.05)",
                      color: played ? "#0b1a15" : "rgba(246,239,221,.35)",
                      border: `1px solid ${played ? SEAT_COLORS[who] : "rgba(255,255,255,.08)"}`,
                    }}>
                    {rankLabel(r)}
                  </span>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ScoreBoard({ totals, taken, current, botName }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "2px 14px", background: "rgba(0,0,0,.28)", padding: "10px 14px", borderRadius: 12, color: CREAM, fontSize: 13, minWidth: 210, border: "1px solid rgba(216,178,74,.35)" }}>
      {["Pelaaja", "Jako", "Yht."].map((h, k) => <div key={k} style={{ fontWeight: 700, color: GOLD, borderBottom: "1px solid rgba(216,178,74,.3)", paddingBottom: 3, textAlign: k ? "right" : "left" }}>{h}</div>)}
      {PLAYERS.map((p, i) => (
        <React.Fragment key={i}>
          <div style={{ fontWeight: current === i ? 700 : 400, color: current === i ? GOLD : CREAM }}>{current === i ? "\u25B6 " : ""}{p}{i > 0 ? ` · ${botName(i)}` : ""}</div>
          <div style={{ textAlign: "right" }}>{taken[i]}</div>
          <div style={{ textAlign: "right", fontWeight: 700 }}>{totals[i]}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

function OpponentRow({ name, sub, count, active }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <PlayerTag name={name} sub={sub} active={active} />
      <div style={{ display: "flex", gap: 2 }}>{Array.from({ length: Math.min(count, 13) }).map((_, i) => <div key={i} style={{ marginLeft: i ? -26 : 0 }}><Card back small /></div>)}</div>
    </div>
  );
}
function SideOpponent({ name, sub, count, active, side }) {
  return (
    <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <PlayerTag name={name} sub={sub} active={active} />
      <div style={{ fontSize: 12, opacity: 0.8 }}>{count} korttia</div>
    </div>
  );
}
function PlayerTag({ name, sub, active }) {
  return (
    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: active ? GOLD : "rgba(0,0,0,.3)", color: active ? INK : CREAM, fontWeight: active ? 700 : 500, border: "1px solid rgba(255,255,255,.2)", textAlign: "center" }}>
      {name}{sub ? <span style={{ opacity: 0.7 }}> · {sub}</span> : ""}
    </span>
  );
}

function MenuScreen({ botIds, setBotIds, customBots, customErr, onLoadCustom, onStart, onRules }) {
  const options = [...BOTS, { id: "custom", name: "Oma botti (liitä koodi)" }];
  const [showBench, setShowBench] = useState(false);
  return (
    <div style={{ textAlign: "center", maxWidth: 460, marginTop: 20 }}>
      <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.92 }}>Kerää mahdollisimman <b>vähän</b> pisteitä. Hertta 1 p, patarouva ♠Q 13 p. Peli 100 pisteeseen, pienin voittaa.</p>
      <div style={{ background: "rgba(0,0,0,.25)", borderRadius: 12, padding: 14, margin: "14px 0", border: "1px solid rgba(216,178,74,.35)" }}>
        <div style={{ fontSize: 13, color: GOLD, marginBottom: 10, fontWeight: 700 }}>Vastustajien tekoälyt</div>
        {[1, 2, 3].map((seat) => (
          <div key={seat} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>{PLAYERS[seat]}</span>
              <select value={botIds[seat]} onChange={(e) => { const b = [...botIds]; b[seat] = e.target.value; setBotIds(b); }}
                style={{ background: "#0e463a", color: CREAM, border: `1px solid ${GOLD}`, borderRadius: 8, padding: "5px 8px", fontSize: 13 }}>
                {options.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {botIds[seat] === "custom" && (
              <CustomBotBox seat={seat} loaded={customBots[seat]} err={customErr[seat]} onLoad={onLoadCustom} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={onStart} style={primaryBtn}>Aloita peli</button>
        <button onClick={onRules} style={ghostBtn}>Säännöt</button>
        <button onClick={() => setShowBench((v) => !v)} style={ghostBtn}>{showBench ? "Piilota testi" : "Bottitesti"}</button>
      </div>
      {showBench && <BenchmarkPanel />}
    </div>
  );
}

function BenchmarkPanel() {
  const [sel, setSel] = useState(["pro", "shooter", "basic", "random"]);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState({ wins: [0, 0, 0, 0], pts: [0, 0, 0, 0], done: 0 });
  const [done, setDone] = useState(false);
  const cancelRef = React.useRef(false);
  const slow = sel.some((id) => id === "pimc");
  const [N, setN] = useState(200);

  const run = async () => {
    setRunning(true); setDone(false); cancelRef.current = false;
    const bots = sel.map(getBot);
    const wins = [0, 0, 0, 0], pts = [0, 0, 0, 0];
    let played = 0;
    // Päivitä näkymä sitä tiheämmin mitä hitaampi ajo (PIMC ≈ sekunteja/peli).
    const batch = slow ? 1 : 5;
    while (played < N && !cancelRef.current) {
      const end = Math.min(played + batch, N);
      for (; played < end; played++) {
        const r = await playMatch(bots);
        wins[r.winner]++;
        r.scores.forEach((s, i) => (pts[i] += s));
      }
      setLive({ wins: [...wins], pts: [...pts], done: played });
      await new Promise((res) => setTimeout(res, 0)); // pidä käyttöliittymä responsiivisena
    }
    setRunning(false);
    setDone(!cancelRef.current);
  };
  const stop = () => { cancelRef.current = true; };

  const total = Math.max(1, live.done);
  const maxWins = Math.max(1, ...live.wins);
  const progress = Math.round((100 * live.done) / N);
  const leader = live.done ? live.wins.indexOf(Math.max(...live.wins)) : -1;
  const estSec = slow ? Math.round(N * 1.2) : Math.max(1, Math.round(N / 60));

  return (
    <div style={{ background: "rgba(0,0,0,.3)", borderRadius: 12, padding: 14, marginTop: 12, border: "1px solid rgba(216,178,74,.35)", textAlign: "left" }}>
      <style>{"@keyframes hbShimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}@keyframes hbPulse{0%,100%{opacity:.5}50%{opacity:1}}"}</style>
      <div style={{ fontSize: 13, color: GOLD, marginBottom: 4, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
        <span>Bottitesti — kuka voittaa?</span>
        {running && <span style={{ animation: "hbPulse 1s infinite" }}>● live</span>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Pelejä:</span>
        {[20, 50, 100, 200, 500].map((n) => (
          <button key={n} disabled={running} onClick={() => { setN(n); setDone(false); setLive({ wins: [0, 0, 0, 0], pts: [0, 0, 0, 0], done: 0 }); }}
            style={{ background: N === n ? GOLD : "transparent", color: N === n ? INK : CREAM, border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: running ? "default" : "pointer", fontWeight: N === n ? 700 : 400 }}>
            {n}
          </button>
        ))}
        {slow && <span style={{ color: GOLD }}>· PIMC on hidas (~{estSec}s tällä määrällä)</span>}
      </div>

      {[0, 1, 2, 3].map((i) => {
        const w = live.wins[i];
        const pct = live.done ? (100 * w) / total : 0;
        const avg = live.done ? (live.pts[i] / total).toFixed(1) : "–";
        const isLeader = i === leader && live.done > 0;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: SEAT_COLORS[i], display: "inline-block" }} />
                <select value={sel[i]} disabled={running} onChange={(e) => { const s = [...sel]; s[i] = e.target.value; setSel(s); setDone(false); setLive({ wins: [0, 0, 0, 0], pts: [0, 0, 0, 0], done: 0 }); }}
                  style={{ background: "#0e463a", color: CREAM, border: `1px solid ${isLeader ? GOLD : "rgba(216,178,74,.5)"}`, borderRadius: 8, padding: "3px 7px", fontSize: 12.5 }}>
                  {BOTS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <span style={{ fontSize: 12.5, minWidth: 92, textAlign: "right", color: isLeader ? GOLD : CREAM, fontWeight: isLeader ? 700 : 400 }}>
                {w} voittoa · {pct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 14, background: "rgba(255,255,255,.06)", borderRadius: 7, overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", width: `${(100 * w) / maxWins}%`,
                background: running
                  ? `linear-gradient(90deg, ${SEAT_COLORS[i]}, ${SEAT_COLORS[i]}bb, ${SEAT_COLORS[i]})`
                  : SEAT_COLORS[i],
                backgroundSize: "200px 100%",
                animation: running ? "hbShimmer 1.2s linear infinite" : "none",
                borderRadius: 7, transition: "width .35s ease-out",
                display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6,
              }}>
                <span style={{ fontSize: 10, color: "#0b1a15", fontWeight: 700 }}>ka {avg}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Edistymispalkki */}
      <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, overflow: "hidden", margin: "10px 0 8px" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: GOLD, borderRadius: 3, transition: "width .3s" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!running ? (
          <button onClick={run} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 14 }}>
            {done ? "Aja uudelleen" : "Aja testi"}
          </button>
        ) : (
          <button onClick={stop} style={{ ...ghostBtn, padding: "8px 16px", fontSize: 14 }}>Keskeytä</button>
        )}
        <span style={{ fontSize: 11, opacity: 0.7 }}>{running ? `${progress}%` : "Pienin ka.-pistemäärä = paras."}</span>
      </div>
    </div>
  );
}

function CustomBotBox({ seat, loaded, err, onLoad }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); await onLoad(seat, code); setBusy(false); };
  return (
    <div style={{ marginTop: 8, textAlign: "left" }}>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={"Liitä botin koodi tähän. Muoto:\nexport default {\n  name: \"Kaverin botti\",\n  passCards(view) { return view.hand.slice(0,3); },\n  playCard(view)  { return view.legalMoves[0]; }\n}"}
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", background: "#0b332a", color: CREAM, border: "1px solid rgba(216,178,74,.4)", borderRadius: 8, padding: 8, fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button onClick={load} disabled={busy} style={{ ...ghostBtn, padding: "6px 14px", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Ladataan…" : "Lataa botti"}
        </button>
        {loaded && !err && <span style={{ fontSize: 12, color: "#7fdca0" }}>✓ Ladattu: {loaded.name || "(nimetön)"}</span>}
        {err && <span style={{ fontSize: 12, color: RED }}>{err}</span>}
      </div>
    </div>
  );
}

function Modal({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 16, zIndex: 20 }}>
      <div style={{ background: "#123f34", border: `1px solid ${GOLD}`, borderRadius: 16, padding: 22, maxWidth: 380, width: "100%", color: CREAM, boxShadow: "0 20px 50px rgba(0,0,0,.5)" }}>{children}</div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <Modal>
      <h2 style={{ margin: "0 0 10px", fontFamily: "Georgia,serif", color: GOLD }}>Säännöt</h2>
      <ul style={{ fontSize: 13.5, lineHeight: 1.55, paddingLeft: 18, margin: 0 }}>
        <li>13 korttia/pelaaja. Ensin vaihdetaan 3 korttia (vasen, oikea, vastapäätä, ei vaihtoa).</li>
        <li>Risti 2 aloittaa. On pakko tunnustaa maata.</li>
        <li>Herttaa ei saa aloittaa ennen kuin se on murrettu (paitsi jos vain herttoja).</li>
        <li>Ensimmäiseen tikkiin ei pistekortteja.</li>
        <li>Pisteet: hertta 1, patarouva 13. Kuun ampuminen: kaikki 26 → itselle 0, muille 26.</li>
        <li>Peli 100 pisteeseen; pienin voittaa.</li>
      </ul>
      <div style={{ textAlign: "center", marginTop: 16 }}><button onClick={onClose} style={primaryBtn}>Selvä</button></div>
    </Modal>
  );
}

const primaryBtn = { background: GOLD, color: INK, border: "none", borderRadius: 24, padding: "10px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,.35)" };
const ghostBtn = { background: "rgba(0,0,0,.25)", color: CREAM, border: "1px solid rgba(216,178,74,.5)", borderRadius: 24, padding: "7px 16px", fontSize: 13, cursor: "pointer" };
