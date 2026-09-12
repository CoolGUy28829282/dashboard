import { useEffect, useState } from "react";
import { fetchSettings, saveSettings } from "../lib/api";
import { PanelTitle } from "./Why";

const EDITABLE = ["sessions", "bias_weights", "rating", "crt", "feeds", "checklist"];

/** Settings editor: every config/*.yaml as editable JSON, saved back through the API. */
export function SettingsPanel({ apiAvailable }: { apiAvailable: boolean }) {
  const [cfg, setCfg] = useState<Record<string, any> | null>(null);
  const [name, setName] = useState("bias_weights");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!apiAvailable) return;
    fetchSettings().then((c) => {
      setCfg(c);
      setText(JSON.stringify(c[name], null, 2));
    }).catch(() => {});
  }, [apiAvailable, name]);
  const save = async () => {
    try {
      const body = JSON.parse(text);
      await saveSettings(name, body);
      setMsg(`Saved ${name}.yaml. Re-run the scan to apply.`);
    } catch (e) {
      setMsg(`Not saved: ${(e as Error).message}`);
    }
  };
  return (
    <section className="panel p-5">
      <PanelTitle title="Settings" right="edits write config/*.yaml" />
      {!apiAvailable && <div className="text-muted text-[14px]">Backend offline: edit config/*.yaml directly.</div>}
      {cfg && (
        <>
          <div className="flex flex-wrap gap-1 mb-2" role="tablist">
            {EDITABLE.map((n) => <button key={n} role="tab" aria-selected={name === n} className="tabbtn" onClick={() => setName(n)}>{n}</button>)}
          </div>
          <textarea className="w-full num min-h-64 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} aria-label={`${name} settings as JSON`} />
          <div className="flex gap-3 items-center mt-2"><button className="btn" onClick={save}>Save</button><span className="text-[13px] text-muted">{msg}</span></div>
        </>
      )}
    </section>
  );
}
