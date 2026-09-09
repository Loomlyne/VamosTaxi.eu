"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "@/components/core";
import "./PlaceCombo.css";

export type PlaceRetrieve = {
  kind: "retrieve";
  mapbox_id: string;
  session_token: string;
  text: string;
};

export type PlaceComboHit = {
  mapbox_id: string;
  name: string;
  address: string;
};

export type PlaceComboProps = {
  label: string;
  value: string;
  placeholder: string;
  icon: IconName;
  clearLabel: string;
  testField: string;
  locale?: "en" | "de" | "fr" | "ar";
  onChange: (value: string) => void;
  onClear: () => void;
  onPlace?: (place: PlaceRetrieve | null) => void;
};

function geoIcon(name: string, address: string): IconName {
  if (/airport|flughafen|a[eéè]roport/i.test(`${name} ${address}`)) return "plane-landing";
  return "map-pin";
}

function apiText(name: string, address: string): string {
  const full = address && !name.includes(address) ? `${name}, ${address}` : name;
  return full.slice(0, 200);
}

export function PlaceCombo({
  label,
  value,
  placeholder,
  icon,
  clearLabel,
  testField,
  locale = "en",
  onChange,
  onClear,
  onPlace,
}: PlaceComboProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [session] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<PlaceComboHit[]>([]);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function search(q: string) {
    abort.current?.abort();
    const n = ++seq.current;
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    abort.current = ac;
    const url =
      `/api/geo/suggest?q=${encodeURIComponent(q.trim())}` +
      `&session_token=${encodeURIComponent(session)}` +
      `&locale=${encodeURIComponent(locale)}`;
    void fetch(url, { signal: ac.signal, credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return { suggestions: [] as PlaceComboHit[] };
        return (await res.json()) as { suggestions?: PlaceComboHit[] };
      })
      .then((json) => {
        if (n !== seq.current) return;
        const next = (json.suggestions ?? []).filter((h) => h?.mapbox_id && h?.name);
        setHits(next);
        setActive(next.length ? 0 : -1);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (n !== seq.current) return;
        setHits([]);
      });
  }

  function typeValue(next: string) {
    onChange(next);
    onPlace?.(null);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(next), 160);
  }

  function pick(hit: PlaceComboHit) {
    const text = apiText(hit.name, hit.address);
    if (text.length < 2) return;
    onChange(hit.name);
    onPlace?.({
      kind: "retrieve",
      mapbox_id: hit.mapbox_id.slice(0, 256),
      session_token: session.slice(0, 128),
      text,
    });
    setHits([]);
    setOpen(false);
    setActive(-1);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || !hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0 && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    }
  }

  return (
    <div className="vt-placecombo" ref={rootRef} data-sugroot="1">
      <span className="vt-bc-lbl">{label}</span>
      <div data-vtcombo="1" data-on={value.trim() ? "1" : "0"}>
        <span data-combo-tile="1" aria-hidden="true">
          <Icon name={icon} size={16} color="currentColor" />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          data-test-field={testField}
          onChange={(e) => typeValue(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (value.trim().length >= 3) search(value);
          }}
          onKeyDown={onKey}
        />
        {value ? (
          <button
            data-combo-x="1"
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={() => {
              onClear();
              onPlace?.(null);
              setHits([]);
              setOpen(false);
            }}
          >
            <Icon name="x" size={16} color="currentColor" />
          </button>
        ) : null}
      </div>
      {open && hits.length > 0 ? (
        <ul className="vt-placecombo__list" id={listId} role="listbox">
          {hits.map((hit, i) => (
            <li key={hit.mapbox_id} role="presentation">
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="vt-placecombo__hit"
                data-on={i === active ? "1" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
              >
                <Icon name={geoIcon(hit.name, hit.address)} size={16} color="currentColor" />
                <span className="vt-placecombo__copy">
                  <strong>{hit.name}</strong>
                  {hit.address ? <span>{hit.address}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
