"""Genera la migrazione con gli alimenti generici della tabella Ciqual (ANSES, 2025), con nomi in italiano.

Fonte: ANSES, Table de composition nutritionnelle des aliments Ciqual 2025, https://ciqual.anses.fr
DOI 10.57745/RDMHWY. Licenza Ouverte Etalab 2.0: riuso libero anche commerciale citando la fonte e la data.
La citazione è nella migrazione, in ogni voce (source = 'ciqual', source_ref = codice alimento)
e nell'app (src/lib/foodSources.js).

Si importano solo gli ingredienti di base (verdure, frutta, cereali, carne, pesce, latticini, grassi,
erbe e spezie), non i piatti pronti. I nomi italiani sono in scripts/ciqual_it.txt (codice|nome):
gli alimenti senza traduzione non vengono importati.

Uso:
  # File xlsx (e alim.xml per i nomi inglesi) da https://doi.org/10.57745/RDMHWY
  python3 scripts/ciqual_seed.py CIQUAL.xlsx > supabase/migrations/20261128000800_catalogo_ciqual.sql
"""
import json, os, re, sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))

GROUPS = {  # sottogruppo Ciqual -> categoria in italiano
    "légumes": "Verdure", "pommes de terre et autres tubercules": "Patate e tuberi", "légumineuses": "Legumi",
    "fruits": "Frutta", "fruits à coque et graines oléagineuses": "Frutta secca e semi",
    "pâtes, riz et céréales": "Cereali, pasta e riso", "farines": "Farine e amidi",
    "viandes crues": "Carne", "viandes cuites": "Carne", "poissons crus": "Pesce", "poissons cuits": "Pesce",
    "mollusques et crustacés crus": "Molluschi e crostacei", "mollusques et crustacés cuits": "Molluschi e crostacei",
    "oeufs": "Uova", "laits": "Latte", "produits laitiers frais et alternatives végétales": "Yogurt e latticini freschi",
    "fromages et alternatives végétales": "Formaggi", "crèmes et spécialités à base de crème": "Panna",
    "beurres": "Burro", "huiles et graisses végétales": "Oli e grassi", "autres matières grasses": "Oli e grassi",
    "sucres, miels et assimilés": "Zuccheri e dolcificanti", "herbes": "Erbe aromatiche", "épices": "Spezie",
    "condiments": "Condimenti", "algues": "Alghe",
}

FIELDS = {  # colonna -> indice nel file xlsx Ciqual 2025
    "kcal": 10, "kj": 9, "water_g": 13, "protein_g": 14, "carbs_g": 16, "fat_g": 17, "sugars_g": 18,
    "fiber_g": 26, "polyols_g": 27, "alcohol_g": 29, "sat_fat_g": 31, "salt_g": 49, "sodium_mg": 60,
}
EXTRA = {
    "starch_g": 25, "mufa_g": 32, "pufa_g": 33, "cholesterol_mg": 48, "calcium_mg": 50, "iron_mg": 53,
    "potassium_mg": 58, "vitamin_c_mg": 72,
}


def num(v):
    """Restituisce (valore, nota): '-' è assente, 'traces' è 0, '< 0,5' è 0 con la soglia annotata."""
    if v is None: return None, None
    s = str(v).strip().replace(",", ".")
    if s in ("", "-"): return None, None
    if s == "traces": return 0.0, "tracce"
    if s.startswith("<"): return 0.0, "<" + s[1:].strip()
    try: return float(s), None
    except ValueError: return None, None


def q(v):
    if v is None: return "null"
    if isinstance(v, float): return repr(round(v, 4)).rstrip("0").rstrip(".")
    if isinstance(v, int): return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def state_of(en):
    n = en.lower()
    if "drained" in n: return "drained"
    if re.search(r"\b(cooked|boiled|steamed|roasted|baked|grilled|fried|braised|sautéed|microwaved|stewed|poached|scrambled)\b", n):
        return "cooked"
    if re.search(r"\b(raw|dried|dry)\b", n): return "raw"
    return None


def load_names(path):
    names = {}
    for line in open(path, encoding="utf8"):
        code, _, name = line.rstrip("\n").partition("|")
        if code and name: names[code] = name
    return names


def build(xlsx):
    names = load_names(os.path.join(HERE, "ciqual_it.txt"))
    english = {}  # nomi inglesi da alim.xml della stessa release, se è accanto al file xlsx
    alim = os.path.join(os.path.dirname(xlsx), "alim.xml")
    if os.path.exists(alim):
        t = open(alim, encoding="utf8", errors="replace").read()
        for block in re.findall(r"<ALIM>(.*?)</ALIM>", t, re.S):
            c = re.search(r"<alim_code>\s*(\d+)\s*</alim_code>", block)
            e = re.search(r"<alim_nom_eng>\s*(.*?)\s*</alim_nom_eng>", block, re.S)
            if c and e: english[c.group(1)] = re.sub(r"\s+", " ", e.group(1)).replace("&apos;", "'").replace("&quot;", '"')

    ws = openpyxl.load_workbook(xlsx, read_only=True).active
    rows = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue
        code = str(r[6]).strip()
        if code not in names: continue
        groups = [" ".join(str(g or "").split()).lower() for g in (r[5], r[4])]  # sotto-sottogruppo, poi sottogruppo
        sub = next((g for g in groups if g in GROUPS), "")
        vals, notes = {}, {}
        for col, idx in FIELDS.items():
            vals[col], note = num(r[idx])
            if note: notes[col] = note
        extra = {}
        for col, idx in EXTRA.items():
            v, note = num(r[idx])
            if v is not None and note is None: extra[col] = v
        traces = [c for c, n in notes.items() if n == "tracce"]
        below = {c: n for c, n in notes.items() if n != "tracce"}
        if traces: extra["tracce"] = traces
        if below: extra["sotto_soglia"] = below
        extra["nome_francese"] = str(r[7]).strip()
        en = english.get(code, "")
        if en: extra["nome_inglese"] = en
        rows.append((code, names[code], GROUPS.get(sub), state_of(en) if en else None, vals, extra))

    out = [
        "-- Catalogo alimentare: alimenti generici dalla tabella Ciqual 2025 (ANSES), nomi tradotti in italiano.",
        "-- Fonte: ANSES. 2025. Table de composition nutritionnelle des aliments Ciqual, https://ciqual.anses.fr",
        "-- DOI 10.57745/RDMHWY. Licenza Ouverte Etalab 2.0 (riuso consentito citando fonte e data).",
        "-- Generato da scripts/ciqual_seed.py con i nomi di scripts/ciqual_it.txt. Valori per 100 g di parte edibile.",
        "-- Energia secondo il Regolamento UE 1169/2011, proteine N x fattore di Jones.",
        "-- \"traces\" diventa 0 (extra.tracce); \"< x\" diventa 0 con la soglia in extra.sotto_soglia; \"-\" resta vuoto.",
        "-- Si aggiunge la fonte 'ciqual' ai vincoli del catalogo. Le voci CREA restano quelle principali:",
        "-- Ciqual copre gli alimenti che le tabelle CREA non hanno.",
        f"-- Alimenti: {len(rows)}.",
        "",
        "alter table public.foods drop constraint foods_source_check;",
        "alter table public.foods add constraint foods_source_check",
        "  check (source in ('crea', 'bda_ieo', 'ciqual', 'institutional', 'label', 'manufacturer', 'off', 'manual'));",
        "drop index public.foods_source_ref;",
        "create unique index foods_source_ref on public.foods (source, source_ref)",
        "  where source_ref is not null and source in ('crea', 'bda_ieo', 'ciqual');",
        "",
        "create temporary table ciqual_seed (code text, name text, category text, state text, "
        + ", ".join(f"{c} numeric" for c in FIELDS) + ", extra jsonb);",
        "",
        "insert into ciqual_seed values",
    ]
    vals_sql = []
    for code, name, cat, st, vals, extra in rows:
        vals_sql.append("  (" + ", ".join([q(code), q(name), q(cat), q(st)] + [q(vals[c]) for c in FIELDS]
                        + [q(json.dumps(extra, ensure_ascii=False)) + "::jsonb"]) + ")")
    out.append(",\n".join(vals_sql) + ";")
    out += [
        "",
        "insert into public.foods (kind, name, category, aliases, state, basis, source, source_ref, status)",
        "select 'generic', name, category, '{}', state, 'g', 'ciqual', code, 'verified' from ciqual_seed",
        "on conflict do nothing;",
        "",
        "insert into public.food_versions (food_id, version, " + ", ".join(FIELDS) + ", extra, provenance, note)",
        "select f.id, 1, " + ", ".join(f"s.{c}" for c in FIELDS) + ", s.extra, 'import',",
        "  'ANSES, tabella Ciqual 2025, codice ' || s.code",
        "from ciqual_seed s join public.foods f on f.source = 'ciqual' and f.source_ref = s.code",
        "where not exists (select 1 from public.food_versions v where v.food_id = f.id);",
        "",
        "update public.foods f set current_version_id = v.id",
        "from public.food_versions v where v.food_id = f.id and v.version = 1",
        "  and f.source = 'ciqual' and f.current_version_id is null;",
        "",
        "drop table ciqual_seed;",
        "",
        "-- A parità di nome, prima le tabelle CREA (riferimento italiano), poi Ciqual.",
        "create or replace function public.search_foods(q text, max_rows int default 20)",
        "returns table (",
        "  id uuid, kind text, name text, brand text, variant text, state text, basis text,",
        "  source text, status text, version_id uuid,",
        "  kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric",
        ")",
        "language sql stable security invoker set search_path = public as $$",
        "  with words as (",
        "    select w from unnest(string_to_array(public.food_norm(q), ' ')) w where length(w) > 0",
        "  )",
        "  select f.id, f.kind, f.name, f.brand, f.variant, f.state, f.basis, f.source, f.status, v.id,",
        "         v.kcal, v.protein_g, v.carbs_g, v.fat_g",
        "  from public.foods f",
        "  left join public.food_versions v on v.id = f.current_version_id",
        "  where f.merged_into is null",
        "    and exists (select 1 from words)",
        "    and not exists (select 1 from words where position(w in f.search_text) = 0)",
        "  order by (f.search_text like (select string_agg(w, ' ') from words) || '%') desc,",
        "           (f.status = 'verified') desc, (f.source = 'ciqual'), length(f.name), f.name",
        "  limit least(greatest(max_rows, 1), 100);",
        "$$;",
        "",
    ]
    print("\n".join(out))


if __name__ == "__main__":
    build(sys.argv[1])
