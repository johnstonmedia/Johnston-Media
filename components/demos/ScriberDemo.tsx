"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import DemoFrame from "./DemoFrame";
import styles from "./demos.module.css";

/**
 * One dictated token.
 *
 * `say` is what the student speaks out loud, `write` is what lands on the
 * page — which is the whole point of spoken punctuation: you have to say
 * "comma" to get a comma.
 */
interface Token {
  say: string;
  write: string;
  /** The writer stops and asks how this one is spelled. */
  spell?: boolean;
  /** Punctuation joins the previous word instead of taking a space. */
  tight?: boolean;
}

const SCRIPT: Token[] = [
  { say: "Photosynthesis", write: "Photosynthesis", spell: true },
  { say: "occurs", write: "occurs" },
  { say: "in", write: "in" },
  { say: "the", write: "the" },
  { say: "chloroplasts", write: "chloroplasts", spell: true },
  { say: "comma", write: ",", tight: true },
  { say: "where", write: "where" },
  { say: "chlorophyll", write: "chlorophyll" },
  { say: "absorbs", write: "absorbs" },
  { say: "light", write: "light" },
  { say: "energy", write: "energy" },
  { say: "full stop", write: ".", tight: true },
  { say: "This", write: "This" },
  { say: "energy", write: "energy" },
  { say: "splits", write: "splits" },
  { say: "water", write: "water" },
  { say: "molecules", write: "molecules" },
  { say: "comma", write: ",", tight: true },
  { say: "releasing", write: "releasing" },
  { say: "oxygen", write: "oxygen" },
  { say: "as", write: "as" },
  { say: "a", write: "a" },
  { say: "by-product", write: "by-product" },
  { say: "full stop", write: ".", tight: true },
];

const PACES = [
  { id: "measured", label: "Measured", ms: 640, blurb: "The pace they can hold" },
  { id: "natural", label: "Natural", ms: 430, blurb: "How you'd normally talk" },
  { id: "rushed", label: "Rushed", ms: 190, blurb: "Running out of time" },
] as const;

type PaceId = (typeof PACES)[number]["id"];

/** How fast the writer's hand moves. Fixed — a person can't speed up. */
const WRITER_MS = 430;
/** Words they can hold in their head before they lose the thread. */
const BUFFER_LIMIT = 6;
/** How long a spelling question takes. */
const SPELL_MS = 1500;
/** How long they need after asking you to slow down. */
const RECOVER_TO = 2;

const TICK = 50;

type Interruption =
  | { kind: "spell"; word: string }
  | { kind: "slow" }
  | null;

/**
 * A playable model of Scriber's writer.
 *
 * The demo exists to make one point that a paragraph of copy can't: the writer
 * is a person, not a transcription engine. Push the pace up and they fall
 * behind, then stop you — which is exactly what happens in the exam room, and
 * exactly what practising against a perfect machine never teaches.
 */
/** The whole simulation, kept out of React state so a tick is never lost. */
interface Sim {
  spoken: number;
  written: number;
  studentAcc: number;
  writerAcc: number;
  /** Milliseconds left on a spelling question. */
  hold: number;
  /** The writer has asked the student to wait. */
  recovering: boolean;
  interruption: Interruption;
}

function emptySim(): Sim {
  return {
    spoken: 0,
    written: 0,
    studentAcc: 0,
    writerAcc: 0,
    hold: 0,
    recovering: false,
    interruption: null,
  };
}

export default function ScriberDemo() {
  const [pace, setPace] = useState<PaceId>("natural");
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  const sim = useRef<Sim>(emptySim());
  // One snapshot per tick — the simulation drives React, never the reverse.
  const [view, setView] = useState({
    spoken: 0,
    written: 0,
    interruption: null as Interruption,
  });

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    sim.current = emptySim();
    setView({ spoken: 0, written: 0, interruption: null });
  }, []);

  const paceMs = PACES.find((p) => p.id === pace)!.ms;

  useEffect(() => {
    if (!playing) return;

    const id = window.setInterval(() => {
      const s = sim.current;

      if (s.hold > 0) {
        // A spelling question freezes both of them until it's answered.
        s.hold -= TICK;
        if (s.hold <= 0) {
          s.hold = 0;
          s.interruption = null;
          s.written += 1;
          s.writerAcc = 0;
        }
      } else {
        const backlog = s.spoken - s.written;

        // Caught up enough to stop asking the student to wait.
        if (s.recovering && backlog <= RECOVER_TO) {
          s.recovering = false;
          s.interruption = null;
        }

        // The writer's hand moves at its own fixed speed.
        s.writerAcc += TICK;
        if (s.writerAcc >= WRITER_MS && backlog > 0) {
          s.writerAcc = 0;
          const next = SCRIPT[s.written];
          if (next?.spell) {
            // They don't know this word — everything stops while they ask.
            s.hold = SPELL_MS;
            s.interruption = { kind: "spell", word: next.write };
          } else {
            s.written += 1;
          }
        }

        // The student speaks unless they've been asked to wait.
        if (!s.recovering) {
          s.studentAcc += TICK;
          if (s.studentAcc >= paceMs && s.spoken < SCRIPT.length) {
            s.studentAcc = 0;
            s.spoken += 1;
          }
        }

        // Too far behind to hold it all — the writer stops the student.
        if (s.spoken - s.written >= BUFFER_LIMIT && !s.recovering) {
          s.recovering = true;
          s.interruption = { kind: "slow" };
        }
      }

      setView({
        spoken: s.spoken,
        written: s.written,
        interruption: s.interruption,
      });

      if (s.written >= SCRIPT.length) setPlaying(false);
    }, TICK);

    return () => window.clearInterval(id);
  }, [playing, paceMs]);

  const { spoken, written, interruption } = view;
  const backlog = spoken - written;
  const done = written >= SCRIPT.length;

  function toggle() {
    if (done) {
      sim.current = emptySim();
      setView({ spoken: 0, written: 0, interruption: null });
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  function choosePace(next: PaceId) {
    setPace(next);
    if (spoken > 0) reset();
  }

  /** Everything written so far, punctuation attached properly. */
  const page = SCRIPT.slice(0, written).reduce((text, token) => {
    if (!text) return token.write;
    return token.tight ? text + token.write : `${text} ${token.write}`;
  }, "");

  const load = Math.min(backlog / BUFFER_LIMIT, 1);

  return (
    <DemoFrame
      url="pracscriber.com"
      label="Try it — Scriber"
      footnote={
        <>
          A working model of the real thing, running right here on the page.
          The full version is at{" "}
          <a href="https://pracscriber.com" target="_blank" rel="noopener noreferrer">
            pracscriber.com
          </a>
          .
        </>
      }
    >
      <div className={styles.scriber}>
        <div className={styles.scriberPanes}>
          {/* The paper the student is reading from. */}
          <div className={styles.paper}>
            <span className={styles.paneLabel}>Question paper</span>
            <p className={styles.qNum}>Question 4 &nbsp;·&nbsp; 6 marks</p>
            <p className={styles.qText}>
              Describe the process of photosynthesis, including where it takes
              place and the products formed.
            </p>
            <div className={styles.qRule} />
            <p className={styles.qHint}>
              You have to say every comma and full stop out loud — the writer
              only writes what they hear.
            </p>
          </div>

          {/* What the writer has actually got down. */}
          <div className={styles.writerPane}>
            <span className={styles.paneLabel}>
              Your writer
              <span
                className={`${styles.pulse} ${playing ? styles.pulseOn : ""}`}
                aria-hidden="true"
              />
            </span>

            <p className={styles.written} aria-live="polite">
              {page}
              {playing && !interruption ? (
                <span className={styles.caret} aria-hidden="true" />
              ) : null}
              {!page ? (
                <span className={styles.placeholder}>
                  Press play and start dictating…
                </span>
              ) : null}
            </p>

            {interruption ? (
              <div
                className={`${styles.interject} ${
                  interruption.kind === "slow" ? styles.interjectWarn : ""
                }`}
                role="status"
              >
                {interruption.kind === "spell"
                  ? `“Sorry — how do you spell ${interruption.word}?”`
                  : "“You're going too fast for me — can you slow down?”"}
              </div>
            ) : null}
          </div>
        </div>

        {/* What's being said, and how far behind the writer is. */}
        <div className={styles.dictation}>
          <span className={styles.paneLabel}>You&rsquo;re saying</span>
          <div className={styles.stream}>
            {SCRIPT.map((token, i) => (
              <span
                key={`${token.say}-${i}`}
                className={`${styles.token} ${
                  i < written
                    ? styles.tokenWritten
                    : i < spoken
                      ? styles.tokenPending
                      : ""
                } ${token.write.length === 1 && token.tight ? styles.tokenPunct : ""}`}
              >
                {token.say}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className="jm-btn-primary jm-btn-sm"
            onClick={toggle}
          >
            {done ? "Run it again" : playing ? "Pause" : "Play dictation"}
          </button>

          <div
            className={styles.paceGroup}
            role="group"
            aria-label="Dictation pace"
          >
            {PACES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.paceBtn} ${
                  pace === option.id ? styles.paceOn : ""
                }`}
                onClick={() => choosePace(option.id)}
                aria-pressed={pace === option.id}
                title={option.blurb}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.meter}>
            <span className={styles.meterLabel}>
              {backlog === 0
                ? "Writer is keeping up"
                : `Writer is ${backlog} word${backlog === 1 ? "" : "s"} behind`}
            </span>
            <span className={styles.meterTrack}>
              <span
                className={`${styles.meterFill} ${
                  load > 0.7 ? styles.meterHot : ""
                }`}
                style={{
                  width: `${load * 100}%`,
                  transition: reduced ? "none" : undefined,
                }}
              />
            </span>
          </div>
        </div>

        <p className={styles.scriberTip}>
          Set the pace to <strong>Rushed</strong> and watch what happens — the
          writer falls behind, then stops you. That gap is the thing students
          actually have to learn to manage.
        </p>
      </div>
    </DemoFrame>
  );
}
