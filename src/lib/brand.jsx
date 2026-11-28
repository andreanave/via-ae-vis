import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useActor } from "./assist.jsx";

// Marchio dello studio dell'utente (o dell'utente assistito dal master).
// null = marchio della piattaforma (src/config/brand.js). Una copia locale lo mostra subito e offline.
const BrandContext = createContext(null);
const KEY = id => `app.brand.${id}`;
const readCache = id => { try { return JSON.parse(localStorage.getItem(KEY(id))); } catch { return null; } };

export const loadBrand = async actor => {
  const { data, error } = await supabase.rpc("brand_for", actor.assisting ? { target: actor.id } : {});
  if (error) throw error;
  return data?.[0] || null;
};

export const loadInviteBrand = async token => {
  const { data } = await supabase.rpc("invite_brand", { invite_token: token });
  return data?.[0] || null;
};

export function BrandProvider({ children }) {
  const actor = useActor();
  const [brand, setBrand] = useState(() => (actor.id ? readCache(actor.id) : null));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!actor.id) { setBrand(null); return undefined; }
    let active = true;
    setBrand(readCache(actor.id));
    loadBrand(actor).then(row => {
      if (!active) return;
      setBrand(row);
      try { localStorage.setItem(KEY(actor.id), JSON.stringify(row)); } catch { /* */ }
    }).catch(() => {});
    return () => { active = false; };
  }, [actor.id, actor.assisting, version]);

  return <BrandContext.Provider value={{ brand, refresh: () => setVersion(v => v + 1) }}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext) || { brand: null, refresh: () => {} };
