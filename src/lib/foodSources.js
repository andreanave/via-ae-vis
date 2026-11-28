// Fonti dei valori nutrizionali, con la citazione da mostrare accanto ai dati.
export const FOOD_SOURCES = {
  crea: {
    label: "Tabelle CREA",
    citation: "CREA Centro di ricerca Alimenti e Nutrizione, Tabelle di composizione degli alimenti, aggiornamento 2019",
    url: "https://www.alimentinutrizione.it",
  },
  bda_ieo: {
    label: "BDA IEO",
    citation: "Gnagnarella P, Salvini S, Parpinel M. Banca Dati di Composizione degli Alimenti per Studi Epidemiologici in Italia",
    url: "https://bda.ieo.it",
  },
  ciqual: {
    label: "Tabella Ciqual",
    citation: "ANSES, Table de composition nutritionnelle des aliments Ciqual 2025 (licenza Ouverte Etalab 2.0), nomi tradotti in italiano",
    url: "https://ciqual.anses.fr",
  },
  institutional: { label: "Fonte istituzionale" },
  label: { label: "Etichetta del prodotto" },
  manufacturer: { label: "Scheda del produttore" },
  off: { label: "Open Food Facts", citation: "Open Food Facts, dati disponibili con licenza ODbL", url: "https://world.openfoodfacts.org" },
  manual: { label: "Inserito a mano" },
};

export const FOOD_STATES = { raw: "crudo", cooked: "cotto", drained: "sgocciolato", prepared: "preparato" };

export const FOOD_STATUS = { to_verify: "Da verificare", auto_approved: "Approvato da etichetta", verified: "Verificato" };

export function sourceLabel(source) {
  return FOOD_SOURCES[source]?.label ?? source;
}
