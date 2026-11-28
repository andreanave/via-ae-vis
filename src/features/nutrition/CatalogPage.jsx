import { useState } from "react";
import FoodSearch from "./FoodSearch.jsx";
import AddFoodForm from "./AddFoodForm.jsx";
import FoodDetail from "./FoodDetail.jsx";

// Catalogo alimentare comune: cercare un prodotto, vederne i valori e la fonte, aggiungerne uno nuovo.
export default function CatalogPage() {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [added, setAdded] = useState(false);

  return (
    <section className="page">
      <div className="page-head">
        <span className="eyebrow">Tabelle CREA e prodotti di marca</span>
        <h1>Catalogo alimenti</h1>
        <p className="muted">Alimenti generici dalle tabelle CREA e prodotti di marca inseriti da atleti e coach.</p>
      </div>
      {added && <div className="notice success" role="status">Prodotto aggiunto: puoi già usarlo.</div>}
      {adding !== null ? (
        <div className="editor-card narrow-card">
          <h2>Nuovo prodotto</h2>
          <AddFoodForm initialName={adding} prefill={prefill}
            onPick={f => { setAdding(null); setSelected(f.id); }}
            onDone={id => { setAdding(null); if (id) { setSelected(id); setAdded(true); } }} />
        </div>
      ) : (
        <div className="split">
          <FoodSearch selectedId={selected} onPick={f => { setSelected(f.id); setAdded(false); }} onAdd={(name, data) => { setAdding(name); setPrefill(data || null); setAdded(false); }} />
          {selected && <div className="editor-card split-detail"><FoodDetail id={selected} /></div>}
        </div>
      )}
    </section>
  );
}
