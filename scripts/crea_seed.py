"""Genera la migrazione con gli alimenti delle Tabelle di composizione degli alimenti CREA (aggiornamento 2019).

Fonte: CREA Centro di ricerca Alimenti e Nutrizione, https://www.alimentinutrizione.it
Il sito consente la riproduzione dei dati con una chiara indicazione della fonte originale:
la citazione è nella migrazione, in ogni voce (source = 'crea', source_ref = codice alimento)
e nell'app (src/lib/foodSources.js).

Uso:
  python3 scripts/crea_seed.py fetch  CARTELLA   # scarica le schede (1 richiesta al secondo)
  python3 scripts/crea_seed.py build  CARTELLA > supabase/migrations/20261128000510_catalogo_crea.sql
"""
import html, json, os, re, sys, time, urllib.request

BASE = "https://www.alimentinutrizione.it/tabelle-nutrizionali"

def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).replace("\xa0", " ").strip()

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "via-ae-vis-catalog-import/0.1"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf8")

def fetch(folder):
    os.makedirs(folder, exist_ok=True)
    index = get(f"{BASE}/ricerca-per-ordine-alfabetico")
    codes = sorted(set(re.findall(r'href="/tabelle-nutrizionali/(\d+)"', index)))
    for code in codes:
        path = os.path.join(folder, f"{code}.html")
        if os.path.exists(path) and os.path.getsize(path) > 5000:
            continue
        with open(path, "w", encoding="utf8") as f:
            f.write(get(f"{BASE}/{code}"))
        time.sleep(1)

def parse(path):
    t = open(path, encoding="utf8").read()
    name = clean(re.search(r'<h1 class="article-title"[^>]*>(.*?)<meta', t, re.S).group(1))
    info = {clean(a): clean(b) for a, b in re.findall(r"<tr><td>([^<]*)</td><td>(.*?)</td></tr>", t, re.S)}
    nut = {}
    for row in re.findall(r'<tr class="corpo[a-z]+[^"]*">(.*?)</tr>', t, re.S):
        tds = [clean(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(tds) >= 3:
            nut[tds[0]] = tds[2]
    return name, info, nut

ACCENT = {"a": "à", "e": "è", "i": "ì", "o": "ò", "u": "ù", "A": "À", "E": "È"}

def fix_accents(name):
    # Nelle tabelle gli accenti sono scritti con l'apostrofo: "Caffe'" -> "Caffè", "Baba'" -> "Babà".
    name = re.sub(r"([aeiouAE])'(?=$|[\s,;)])", lambda m: ACCENT[m.group(1)], name)
    return name.replace("perchè", "perché").replace("Perchè", "Perché")

def state_of(name):
    n = name.lower()
    if re.search(r"sgocciolat", n): return "drained"
    if re.search(r"\b(cott[oaie]|bollit|arrost|al forno|fritt|al microonde|in umido|alla griglia|grigliat|al vapore|stufat|brasat|lessat)", n): return "cooked"
    if re.search(r"\b(crud[oaie]|secch[ie]|secc[oa])\b", n): return "raw"
    return None

def num(v):
    if v is None or v == "": return None
    if v == "tr": return 0.0
    try: return float(v)
    except ValueError: return None

def q(v):
    if v is None: return "null"
    if isinstance(v, (int, float)): return repr(round(v, 3)).rstrip("0").rstrip(".") if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"

FIELDS = {  # colonna -> nutriente CREA
    "kcal": "Energia (kcal)", "kj": "Energia (kJ)", "protein_g": "Proteine (g)",
    "carbs_g": "Carboidrati disponibili (g)", "sugars_g": "Zuccheri solubili (g)", "fat_g": "Lipidi (g)",
    "fiber_g": "Fibra totale (g)", "sodium_mg": "Sodio (mg)", "water_g": "Acqua (g)", "alcohol_g": "Alcool (g)",
}
EXTRA = {
    "starch_g": "Amido (g)", "cholesterol_mg": "Colesterolo (mg)",
    "sfa_pct_fa": "Acidi grassi Saturi (%)", "mufa_pct_fa": "Acidi grassi Monoinsaturi (%)",
    "pufa_pct_fa": "Acidi grassi Polinsaturi (%)",
}

def build(folder):
    rows = []
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith(".html"): continue
        name, info, nut = parse(os.path.join(folder, fn))
        code = info.get("Codice Alimento") or fn[:-5]
        edible = num((info.get("Parte Edibile") or "").replace("%", "").strip())
        portion = num((info.get("Porzione") or "").replace("g", "").strip())
        vals = {col: num(nut.get(src)) for col, src in FIELDS.items()}
        extra = {k: num(nut[src]) for k, src in EXTRA.items() if src in nut and num(nut[src]) is not None}
        traces = [col for col, src in FIELDS.items() if nut.get(src) == "tr"]
        if traces: extra["tracce"] = traces
        if info.get("English Name"): extra["nome_inglese"] = info["English Name"]
        fixed = fix_accents(name)
        aliases = [name] if fixed != name else []
        rows.append((code, fixed, info.get("Categoria"), state_of(fixed), edible, portion, aliases, vals, extra))

    # Senza indicazione nel nome ma con una versione cotta accanto ("Riso, brillato" e "Riso, brillato, cotto"):
    # è il prodotto crudo.
    names = [r[1].lower() for r in rows]
    rows = [r if r[3] or not any(n.startswith(r[1].lower() + ", cott") for n in names) else r[:3] + ("raw",) + r[4:]
            for r in rows]

    out = [
        "-- Catalogo alimentare: alimenti generici dalle Tabelle di composizione degli alimenti CREA.",
        "-- Fonte: CREA Centro di ricerca Alimenti e Nutrizione, Tabelle di composizione degli alimenti,",
        "-- aggiornamento 2019, https://www.alimentinutrizione.it - https://www.crea.gov.it/alimenti-e-nutrizione",
        "-- Generato da scripts/crea_seed.py. Valori per 100 g di parte edibile; energia come dichiarata dalla fonte.",
        "-- \"tr\" (tracce) diventa 0 e il campo è elencato in extra.tracce. Gli acidi grassi CREA sono in % sul totale",
        "-- degli acidi grassi (extra.*_pct_fa), non in grammi: sat_fat_g resta vuoto.",
        f"-- Alimenti: {len(rows)}.",
        "",
        "create temporary table crea_seed (code text, name text, category text, state text, edible numeric,",
        "  portion numeric, aliases text[], " + ", ".join(f"{c} numeric" for c in FIELDS) + ", extra jsonb);",
        "",
        "insert into crea_seed values",
    ]
    vals_sql = []
    for code, name, cat, st, edible, portion, aliases, vals, extra in rows:
        arr = "array[" + ", ".join(q(a) for a in aliases) + "]::text[]" if aliases else "'{}'::text[]"
        vals_sql.append("  (" + ", ".join([q(code), q(name), q(cat), q(st), q(edible), q(portion), arr]
                        + [q(vals[c]) for c in FIELDS] + [q(json.dumps(extra, ensure_ascii=False)) + "::jsonb"]) + ")")
    out.append(",\n".join(vals_sql) + ";")
    out += [
        "",
        "insert into public.foods (kind, name, category, aliases, state, basis, edible_part_pct, portion_g, source, source_ref, status)",
        "select 'generic', name, category, aliases, state, 'g', edible, portion, 'crea', code, 'verified' from crea_seed",
        "on conflict do nothing;",
        "",
        "insert into public.food_versions (food_id, version, " + ", ".join(FIELDS) + ", extra, provenance, note)",
        "select f.id, 1, " + ", ".join(f"s.{c}" for c in FIELDS) + ", s.extra, 'import',",
        "  'CREA, Tabelle di composizione degli alimenti, aggiornamento 2019, codice ' || s.code",
        "from crea_seed s join public.foods f on f.source = 'crea' and f.source_ref = s.code",
        "where not exists (select 1 from public.food_versions v where v.food_id = f.id);",
        "",
        "update public.foods f set current_version_id = v.id",
        "from public.food_versions v where v.food_id = f.id and v.version = 1",
        "  and f.source = 'crea' and f.current_version_id is null;",
        "",
        "drop table crea_seed;",
        "",
    ]
    print("\n".join(out))

if __name__ == "__main__":
    {"fetch": fetch, "build": build}[sys.argv[1]](sys.argv[2])
