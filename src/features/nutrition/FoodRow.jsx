import { FOOD_STATES, FOOD_STATUS, sourceLabel } from "../../lib/foodSources.js";
import { formatAmount } from "../../lib/foodMath.js";

// Una voce del catalogo in un elenco: nome, marca, stato, fonte e macro per 100 g/ml.
export default function FoodRow({ food, onClick, active }) {
  const title = [food.brand, food.name, food.variant].filter(Boolean).join(" · ");
  const meta = [food.state && FOOD_STATES[food.state], sourceLabel(food.source),
    food.status !== "verified" && FOOD_STATUS[food.status]].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="food-name">
        <span>{title}</span>
        <span className="muted hint">{meta}</span>
      </span>
      {food.kcal !== undefined && (
        <span className="num food-macros">
          <span>{formatAmount(food.kcal, 0)} kcal</span>
          <span className="muted">P {formatAmount(food.protein_g)} · C {formatAmount(food.carbs_g)} · G {formatAmount(food.fat_g)} / 100 {food.basis || "g"}</span>
        </span>
      )}
    </>
  );
  return (
    <li className={`food-row${active ? " active" : ""}`}>
      {onClick
        ? <button type="button" onClick={onClick}>{body}</button>
        : <div>{body}</div>}
    </li>
  );
}
