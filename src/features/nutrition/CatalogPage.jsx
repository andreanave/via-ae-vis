import { useState } from "react";
import FoodSearch from "./FoodSearch.jsx";
import AddFoodForm from "./AddFoodForm.jsx";
import FoodDetail from "./FoodDetail.jsx";

// Catalogo alimentare comune: cercare un prodotto, vederne i valori e la fonte, aggiungerne uno nuovo.
export default function CatalogPage() {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(false);

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div className="page-head">
        <h1>Catalogo alimenti</h1>
        <p className="muted" style={{ margin: 0 }}>Alimenti generici dalle tabelle CREA e prodotti di marca inseriti da atleti e coach.</p>
      </div>
      {added && <div className="notice success" role="status">Prodotto aggiunto: puoi già usarlo.</div>}
      {adding !== null ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Nuovo prodotto</h2>
          <AddFoodForm initialName={adding}
            onPick={f => { setAdding(null); setSelected(f.id); }}
            onDone={id => { setAdding(null); if (id) { setSelected(id); setAdded(true); } }} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
          <FoodSearch selectedId={selected} onPick={f => { setSelected(f.id); setAdded(false); }} onAdd={name => { setAdding(name); setAdded(false); }} />
          {selected && <div className="card"><FoodDetail id={selected} /></div>}
        </div>
      )}
    </section>
  );
}
