import { BRAND } from "../config/brand.js";

const asset = path => (/^https?:\/\//.test(path) ? path : `${import.meta.env.BASE_URL}${path}`);

// Marchio da mostrare. `brand` è il marchio dello studio (riga di my_brand() o invite_brand()):
// logo_light_url = logo per lo sfondo chiaro, logo_dark_url = per lo sfondo scuro.
// Senza `brand` (o senza logo) si usa il marchio della piattaforma da src/config/brand.js.
const resolve = brand => ({
  name: brand?.brand_name || BRAND.name,
  monogram: BRAND.logoText,
  onLight: brand?.logo_light_url || (brand ? null : BRAND.logo?.onLight),
  onDark: brand?.logo_dark_url || brand?.logo_light_url || (brand ? null : BRAND.logo?.onDark),
  icon: brand?.icon_url || null,
});

// variant="logo": logo completo (login, inviti), con la versione giusta per il tema.
// Senza variant: monogramma e nome, per la barra in alto.
export default function BrandMark({ showName = true, variant, brand }) {
  const b = resolve(brand);
  if (variant === "logo" && b.onLight) {
    return (
      <span className="brand-logo">
        <img className="on-light" src={asset(b.onLight)} alt={brand?.brand_name || BRAND.logo?.alt || b.name} />
        <img className="on-dark" src={asset(b.onDark || b.onLight)} alt="" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="brand">
      {b.icon
        ? <img className="brand-mark brand-icon" src={asset(b.icon)} alt="" aria-hidden="true" />
        : <span className="brand-mark" aria-hidden="true">{b.monogram}</span>}
      {showName && <span>{b.name}</span>}
    </span>
  );
}
