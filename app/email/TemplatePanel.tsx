"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import { SEED_TEMPLATES } from "@/lib/emailTemplateSeeds";
import {
  atLeast,
  MERGE_FIELDS,
  type EmailAccess,
  type EmailTemplate,
} from "@/lib/emailTypes";

import styles from "./email.module.css";

/**
 * The HTML wrapper every campaign goes inside.
 *
 * Paste a full document here. `{{content}}` is where the campaign body lands,
 * and the other merge fields are substituted per recipient. The preview is
 * sandboxed with scripts disabled — a template is arbitrary HTML, and it has no
 * business running code in the platform's origin.
 */
export default function TemplatePanel({ access }: { access: EmailAccess }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = atLeast(access.level, "draft");

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(getDb(), "emailTemplates"));
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EmailTemplate),
      );
    } catch (err) {
      console.error("[email] templates failed:", err);
      setTemplates([]);
      toast("Could not load templates.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Installs Will's three templates.
   *
   * Keyed by `seedKey` so pressing this twice updates them in place rather
   * than filling the list with copies.
   */
  async function installSeeds() {
    if (busy) return;
    setBusy(true);
    try {
      const db = getDb();
      const now = new Date().toISOString();
      await Promise.all(
        SEED_TEMPLATES.map((seed) =>
          setDoc(
            doc(db, "emailTemplates", `jm-${seed.key}`),
            {
              name: seed.name,
              description: seed.description,
              html: seed.html,
              isDefault: seed.isDefault,
              seedKey: seed.key,
              updatedAt: now,
              updatedBy: access.email,
            },
            { merge: true },
          ),
        ),
      );
      toast(`${SEED_TEMPLATES.length} templates installed.`);
      void load();
    } catch (err) {
      console.error("[email] seed install failed:", err);
      toast("Could not install the templates.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const template: Omit<EmailTemplate, "id"> = {
        name: "New template",
        html: `<!doctype html>
<html><body style="margin:0;background:#f4f4f4;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="padding:32px">
          {{content}}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;font-size:12px;color:#888;text-align:center">
          {{sender_name}} · {{sender_address}}<br>
          <a href="{{unsubscribe_url}}" style="color:#888">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        updatedAt: new Date().toISOString(),
        updatedBy: access.email,
      };
      const ref = await addDoc(collection(getDb(), "emailTemplates"), template);
      setEditing({ id: ref.id, ...template });
      void load();
    } catch {
      toast("Could not create a template.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save(next: EmailTemplate) {
    setBusy(true);
    try {
      const { id, ...rest } = next;
      await updateDoc(doc(getDb(), "emailTemplates", id), {
        ...rest,
        updatedAt: new Date().toISOString(),
        updatedBy: access.email,
      });
      toast("Template saved.");
      void load();
    } catch {
      toast("Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: EmailTemplate) {
    if (!window.confirm(`Delete “${template.name}”?`)) return;
    try {
      await deleteDoc(doc(getDb(), "emailTemplates", template.id));
      setTemplates((prev) => prev?.filter((t) => t.id !== template.id) ?? null);
      if (editing?.id === template.id) setEditing(null);
      toast("Deleted.");
    } catch {
      toast("Could not delete that.", "error");
    }
  }

  if (editing) {
    // Either slot name is honoured by the merge layer, so either satisfies this.
    const missing =
      !editing.html.includes("{{content}}") &&
      !editing.html.includes("{{MESSAGE_BODY}}");

    return (
      <>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>{editing.name}</h1>
            <p className={styles.sub}>
              Paste your HTML email here. Put <code>{"{{content}}"}</code> where
              the campaign body should go.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? "Edit" : "Preview"}
            </button>
            {canEdit ? (
              <button
                type="button"
                className="jm-btn-primary jm-btn-sm"
                onClick={() => save(editing)}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            ) : null}
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={() => {
                setEditing(null);
                setPreview(false);
              }}
            >
              Close
            </button>
          </div>
        </div>

        {missing ? (
          <div className={styles.warn}>
            This template has neither <code>{"{{content}}"}</code> nor{" "}
            <code>{"{{MESSAGE_BODY}}"}</code>, so a campaign body would have
            nowhere to go.
          </div>
        ) : null}

        {preview ? (
          <iframe
            className={styles.preview}
            title="Template preview"
            sandbox=""
            srcDoc={editing.html
              .replace(
                /\{\{\s*(content|MESSAGE_BODY)\s*\}\}/g,
                "<p><em>The campaign body appears here.</em></p>",
              )
              .replace(/\{\{\s*LOGO_URL\s*\}\}/g, "/logo.png")}
          />
        ) : (
          <div className={styles.composer}>
            <div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="t-name">
                  Name
                </label>
                <input
                  id="t-name"
                  className="jm-input"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="t-html">
                  HTML
                </label>
                <textarea
                  id="t-html"
                  className={styles.editor}
                  style={{ minHeight: 460 }}
                  value={editing.html}
                  spellCheck={false}
                  onChange={(e) =>
                    setEditing({ ...editing, html: e.target.value })
                  }
                />
              </div>
              <label
                className="jm-label"
                style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={editing.isDefault ?? false}
                  onChange={(e) =>
                    setEditing({ ...editing, isDefault: e.target.checked })
                  }
                />
                Use this on new campaigns by default
              </label>
            </div>

            <aside className={styles.aside}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Merge fields</h3>
                <div className={styles.tokens}>
                  {MERGE_FIELDS.map((field) => (
                    <button
                      key={field.token}
                      type="button"
                      className={styles.token}
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(field.token)
                          .then(() => toast(`${field.token} copied.`))
                          .catch(() => {})
                      }
                    >
                      <code>{field.token}</code>
                      <span>{field.describes}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Templates</h1>
          <p className={styles.sub}>
            The HTML that wraps every campaign — your header, your footer, your
            unsubscribe line. Write it once.
          </p>
        </div>
        {canEdit ? (
          <div className={styles.actions}>
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={installSeeds}
              disabled={busy}
            >
              Install Johnston Media set
            </button>
            <button
              type="button"
              className="jm-btn-primary jm-btn-sm"
              onClick={create}
              disabled={busy}
            >
              + New template
            </button>
          </div>
        ) : null}
      </div>

      {templates === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : templates.length === 0 ? (
        <div className={styles.empty}>
          <strong>No templates yet</strong>
          Press <strong style={{ display: "inline" }}>Install Johnston Media
          set</strong> to add the general, quote and payment templates — or
          create one and paste your own HTML in.
        </div>
      ) : (
        <div className={styles.list}>
          {templates.map((template) => (
            <article key={template.id} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>{template.name}</h3>
                <p className={styles.rowMeta}>
                  {template.description ? `${template.description} · ` : ""}
                  updated{" "}
                  {new Date(template.updatedAt).toLocaleDateString("en-AU")}
                </p>
              </div>
              <div className={styles.rowActions}>
                {template.isDefault ? (
                  <span className="jm-badge jm-badge--amber">Default</span>
                ) : null}
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => setEditing(template)}
                >
                  Open
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => remove(template)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
