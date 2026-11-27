import { BRAND } from "../config/brand.js";

export default function BrandMark({ showName = true }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">{BRAND.logoText}</span>
      {showName && <span>{BRAND.name}</span>}
    </span>
  );
}
