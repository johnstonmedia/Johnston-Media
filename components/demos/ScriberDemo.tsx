"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import DemoFrame from "./DemoFrame";
import styles from "./demos.module.css";

/**
 * An emulation of Scriber's own writer, matching the real product.
 *
 * The behaviour model is Scriber's: the writer holds a bounded number of
 * spoken units in working memory, drains them at a fixed pen speed, and when
 * the student outruns that capacity the tail is genuinely lost and the writer
 * asks for it again. Presets, capacities, pen speeds and the load thresholds
 * below are the real ones (src/scribe/workingMemory.ts in the Scriber repo),
 * so the demo can't flatter the product by being gentler than it is.
 *
 * It is deliberately styled as Scriber rather than as Johnston Media — light,
 * blue, serif — because a case study should show the thing that was built.
 */

/** One spoken unit: a word, or a command that becomes a mark. */
interface Unit {
  say: string;
  /** What lands on the page. Commands render as punctuation or nothing. */
  write: string;
  /** Punctuation joins the previous word rather than taking a space. */
  tight?: boolean;
  /** A spoken command rather than a word — shown in the mono voice. */
  command?: boolean;
  /** Capitalises the next word (Scriber's "capital" command). */
  capitalises?: boolean;
}

/**
 * The dictated passage.
 *
 * Taken from Scriber's own landing-page demo, so what a visitor reads here is
 * what they'd read there — an English response, dictated with the punctuation
 * spoken aloud the way the exam requires.
 */
const SCRIPT: Unit[] = [
  { say: "capital", write: "", command: true, capitalises: true },
  { say: "the", write: "the" },
  { say: "composer", write: "composer" },
  { say: "represents", write: "represents" },
  { say: "discovery", write: "discovery" },
  { say: "comma", write: ",", tight: true, command: true },
  { say: "not", write: "not" },
  { say: "as", write: "as" },
  { say: "a", write: "a" },
  { say: "single", write: "single" },
  { say: "moment", write: "moment" },
  { say: "but", write: "but" },
  { say: "as", write: "as" },
  { say: "a", write: "a" },
  { say: "sequence", write: "sequence" },
  { say: "of", write: "of" },
  { say: "unsettling", write: "unsettling" },
  { say: "realisations", write: "realisations" },
  { say: "that", write: "that" },
  { say: "build", write: "build" },
  { say: "across", write: "across" },
  { say: "the", write: "the" },
  { say: "whole", write: "whole" },
  { say: "text", write: "text" },
  { say: "and", write: "and" },
  { say: "refuse", write: "refuse" },
  { say: "to", write: "to" },
  { say: "resolve", write: "resolve" },
  { say: "neatly", write: "neatly" },
  { say: "full stop", write: ".", tight: true, command: true },
];

/**
 * Scriber's three writer presets, with its real numbers.
 * capacity = units held in working memory; pace = units written per second.
 */
const PRESETS = [
  {
    id: "patient",
    label: "Patient writer",
    hint: "Holds a lot, rarely interrupts. Good for your first sessions.",
    capacity: 28,
    pacePerSecond: 3.4,
  },
  {
    id: "realistic",
    label: "Realistic writer",
    hint: "Behaves like a person taking your words down by hand.",
    capacity: 18,
    pacePerSecond: 2.6,
  },
  {
    id: "demanding",
    label: "Demanding writer",
    hint: "Short memory and a slower pen. Forces you to pace yourself.",
    capacity: 12,
    pacePerSecond: 2.0,
  },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

/** How fast the student talks. Comfortable speech is ~2.2 units/second. */
const PACES = [
  { id: "measured", label: "Measured", perSecond: 1.8 },
  { id: "natural", label: "Natural", perSecond: 2.4 },
  { id: "rushed", label: "Rushed", perSecond: 4.6 },
] as const;

type PaceId = (typeof PACES)[number]["id"];

const TICK = 100;

/** Scriber's own load thresholds. */
function loadTone(value: number): "calm" | "busy" | "critical" {
  if (value >= 0.8) return "critical";
  if (value >= 0.55) return "busy";
  return "calm";
}

type Caption = "idle" | "talking" | "repeat" | "done";

interface Sim {
  /** Units heard but not yet written — the writer's working memory. */
  pending: Unit[];
  written: Unit[];
  spokenIndex: number;
  studentAcc: number;
  writerAcc: number;
  caption: Caption;
  /** Units dropped because memory overflowed. */
  lost: number;
}

function emptySim(): Sim {
  return {
    pending: [],
    written: [],
    spokenIndex: 0,
    studentAcc: 0,
    writerAcc: 0,
    caption: "idle",
    lost: 0,
  };
}

/** Renders written units the way Scriber's engine does. */
function renderSheet(written: Unit[]): string {
  let out = "";
  let capitaliseNext = false;

  for (const unit of written) {
    if (unit.capitalises) {
      capitaliseNext = true;
      continue;
    }
    if (!unit.write) continue;

    let word = unit.write;
    if (capitaliseNext && /[a-z]/.test(word[0] ?? "")) {
      word = word[0].toUpperCase() + word.slice(1);
      capitaliseNext = false;
    }
    out = !out ? word : unit.tight ? out + word : `${out} ${word}`;
  }
  return out;
}

export default function ScriberDemo() {
  const [preset, setPreset] = useState<PresetId>("realistic");
  const [pace, setPace] = useState<PaceId>("natural");
  const [playing, setPlaying] = useState(false);

  const sim = useRef<Sim>(emptySim());
  const [view, setView] = useState<Sim>(emptySim());

  const settings = PRESETS.find((p) => p.id === preset)!;
  const speech = PACES.find((p) => p.id === pace)!;

  const reset = useCallback(() => {
    setPlaying(false);
    sim.current = emptySim();
    setView(emptySim());
  }, []);

  useEffect(() => {
    if (!playing) return;

    const id = window.setInterval(() => {
      const s = sim.current;

      // The student speaks.
      s.studentAcc += TICK;
      const speakEvery = 1000 / speech.perSecond;
      while (s.studentAcc >= speakEvery && s.spokenIndex < SCRIPT.length) {
        s.studentAcc -= speakEvery;
        s.pending.push(SCRIPT[s.spokenIndex]);
        s.spokenIndex += 1;
        s.caption = "talking";
      }

      // The writer's pen moves at its own fixed speed.
      s.writerAcc += TICK;
      const writeEvery = 1000 / settings.pacePerSecond;
      while (s.writerAcc >= writeEvery && s.pending.length > 0) {
        s.writerAcc -= writeEvery;
        s.written.push(s.pending.shift()!);
      }

      // Past capacity the tail is genuinely lost — the writer asks for it back.
      if (s.pending.length > settings.capacity) {
        const overflow = s.pending.length - settings.capacity;
        s.pending.splice(settings.capacity, overflow);
        s.lost += overflow;
        s.caption = "repeat";
      }

      if (s.spokenIndex >= SCRIPT.length && s.pending.length === 0) {
        s.caption = "done";
        setPlaying(false);
      }

      setView({ ...s, pending: [...s.pending], written: [...s.written] });
    }, TICK);

    return () => window.clearInterval(id);
  }, [playing, speech.perSecond, settings.pacePerSecond, settings.capacity]);

  const level = Math.min(1, view.pending.length / settings.capacity);
  const tone = loadTone(level);
  const sheet = renderSheet(view.written);
  const done = view.caption === "done";

  function toggle() {
    if (done) {
      sim.current = emptySim();
      setView(emptySim());
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  function choose<T>(setter: (v: T) => void, value: T) {
    setter(value);
    if (view.spokenIndex > 0) reset();
  }

  return (
    <DemoFrame
      url="pracscriber.com"
      label="Try it — Scriber"
      footnote={
        <>
          The real engine, running here: the same working-memory model, writer
          presets and load thresholds as the live product at{" "}
          <a href="https://pracscriber.com" target="_blank" rel="noopener noreferrer">
            pracscriber.com
          </a>
          .
        </>
      }
    >
      <div className={styles.scriber}>
        {/* What the product is, in three lines. */}
        <div className={styles.sbAbout}>
          <h4>Scriber</h4>
          <p>
            A practice tool for students approved for a <strong>writer</strong>{" "}
            under NESA exam provisions. They upload a past paper, read it on one
            side and dictate on the other — saying every comma, full stop and
            capital out loud, because a real writer only writes what they hear.
          </p>
          <ul className={styles.sbFacts}>
            <li>
              <span>Strict mode</span>Strips the punctuation and capitals speech
              recognition adds for you — the help you won&rsquo;t get on the day
            </li>
            <li>
              <span>A human writer</span>Bounded memory, a fixed pen speed, and
              spelling questions — not a perfect transcription engine
            </li>
            <li>
              <span>Session report</span>Ends with the habits worth practising
            </li>
          </ul>
        </div>

        {/* The writer's cognitive load. */}
        <div className={styles.sbWidget}>
          <div className={styles.sbLoadBar} data-tone={tone}>
            <div className={styles.sbLoadFill} style={{ width: `${level * 100}%` }} />
          </div>

          <div className={styles.sbContext}>
            <span className={styles.sbContextLabel}>
              Writer&rsquo;s memory — {view.pending.length} of {settings.capacity} held
            </span>
            {Array.from({ length: settings.capacity }).map((_, i) => {
              const unit = view.pending[i];
              return (
                <span
                  key={i}
                  className={styles.sbSlot}
                  data-empty={!unit}
                  data-tone={unit ? tone : undefined}
                  data-command={unit?.command ? "true" : undefined}
                >
                  {unit?.say ?? ""}
                </span>
              );
            })}
          </div>

          <div className={styles.sbSheet} aria-live="polite">
            {sheet || (
              <span className={styles.sbPlaceholder}>
                The writer is listening…
              </span>
            )}
            {playing ? <span className={styles.sbCursor} /> : null}
          </div>

          <div className={styles.sbCaption} role="status">
            {view.caption === "idle" &&
              "Press play — the writer starts listening."}
            {view.caption === "talking" &&
              "Dictating — watch the words land a beat behind."}
            {view.caption === "repeat" &&
              "“Sorry — could you say that again?” The writer just lost the tail end."}
            {view.caption === "done" &&
              "That’s the real engine — the same one every student practises against."}
          </div>
        </div>

        {/* Controls. */}
        <div className={styles.sbControls}>
          <button type="button" className={styles.sbPlay} onClick={toggle}>
            {done ? "Run it again" : playing ? "Pause" : "Play dictation"}
          </button>

          <label className={styles.sbSelect}>
            <span>Writer</span>
            <select
              value={preset}
              onChange={(e) => choose(setPreset, e.target.value as PresetId)}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.sbSelect}>
            <span>Your pace</span>
            <select
              value={pace}
              onChange={(e) => choose(setPace, e.target.value as PaceId)}
            >
              {PACES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {view.lost > 0 ? (
            <span className={styles.sbLost}>
              {view.lost} word{view.lost === 1 ? "" : "s"} lost
            </span>
          ) : null}
        </div>

        <p className={styles.sbHint}>{settings.hint}</p>

        <p className={styles.scriberTip}>
          Put a <strong>Demanding writer</strong> against a{" "}
          <strong>Rushed</strong> pace and words start falling out of their
          memory for real — that gap is the thing students have to learn to
          manage, and it&rsquo;s what practising against a perfect machine never
          teaches.
        </p>
      </div>
    </DemoFrame>
  );
}
