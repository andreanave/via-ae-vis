import { FOOD_STATES, FOOD_STATUS, sourceLabel } from "../../lib/foodSources.js";
import { formatAmount } from "../../lib/foodMath.js";

// Una voce del catalogo in un elenco: nome, marca, stato, fonte e macro per 100 g/ml.
export default function FoodRow({ food, onClick, active }) {
  const title = [food.brand, food.name, food.variant].filter(Boolean).join(" · ");
  const meta = [food.state && FOOD_STATES[food.state], sourceLabel(food.source),
    food.status !== "verified" && FOOD_STATUS[food.status]].filter(Boolean).join(" · ");
  const body = (
    <>
      <span style={{ flex: "1 1 200px", display: "grid", gap: 2, textAlign: "left" }}>
        <span>{title}</span>
        <span className="muted" style={{ fontSize: "0.85rem" }}>{meta}</span>
      </span>
      {food.kcal !== undefined && (
        <span className="num muted" style={{ fontSize: "0.85rem", textAlign: "right" }}>
          {formatAmount(food.kcal, 0)} kcal · P {formatAmount(food.protein_g)} · C {formatAmount(food.carbs_g)} · G {formatAmount(food.fat_g)}
          <br />per 100 {food.basis || "g"}
        </span>
      )}
    </>
  );
  return (
    <li className="row" style={{ flexWrap: "wrap", background: active ? "var(--surface-2)" : undefined }}>
      {onClick
        ? <button type="button" onClick={onClick} style={{ all: "unset", cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 8, width: "100%", minHeight: 48, alignItems: "center" }}>{body}</button>
        : body}
    </li>
  );
}
