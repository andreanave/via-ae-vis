import { BRAND } from "../config/brand.js";

const asset = path => `${import.meta.env.BASE_URL}${path}`;

// variant="logo": logo completo (login, inviti), con la versione giusta per il tema.
// Senza variant: monogramma e nome, per la barra in alto.
export default function BrandMark({ showName = true, variant }) {
  if (variant === "logo" && BRAND.logo) {
    return (
      <span className="brand-logo">
        <img className="on-light" src={asset(BRAND.logo.onLight)} alt={BRAND.logo.alt} />
        <img className="on-dark" src={asset(BRAND.logo.onDark)} alt="" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">{BRAND.logoText}</span>
      {showName && <span>{BRAND.name}</span>}
    </span>
  );
}
