"use client";

import { useActionState, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createRecipeAction,
  updateRecipeAction,
  type ActionState,
} from "@/app/(app)/recipes/actions";
import type { Recipe } from "@/lib/recipes";

const initialState: ActionState = { error: null, success: false };

const INPUT =
  "bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none";

// Rows carry a stable key so React never reuses an input's DOM node — and its
// typed value — for a different row after a removal.
type Row = { key: number; value: string };

function initialRows(recipe?: Recipe): Row[] {
  if (recipe && recipe.items.length > 0) {
    return recipe.items.map((item, key) => ({ key, value: item.label }));
  }
  return [{ key: 0, value: "" }];
}

export function RecipeForm({ groupId, recipe }: { groupId: string; recipe?: Recipe }) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(recipe));
  const [nextKey, setNextKey] = useState(rows.length);

  const [state, formAction] = useActionState(
    recipe
      ? updateRecipeAction.bind(null, recipe.id)
      : createRecipeAction.bind(null, groupId),
    initialState,
  );

  function addRow() {
    setRows((current) => [...current, { key: nextKey, value: "" }]);
    setNextKey((key) => key + 1);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function setRowValue(key: number, value: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));
  }

  return (
    // Extra bottom padding on top of the layout's tab-bar clearance, so the
    // last item field stays above the on-screen keyboard.
    <form action={formAction} className="flex flex-col gap-3 pb-16">
      <input
        name="name"
        defaultValue={recipe?.name}
        placeholder="Recipe name"
        required
        enterKeyHint="next"
        className={INPUT}
      />

      <p className="text-tertiary tracking-label text-xs font-bold uppercase">Items</p>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            name="item"
            value={row.value}
            onChange={(event) => setRowValue(row.key, event.target.value)}
            placeholder="What someone brings"
            enterKeyHint="next"
            className={INPUT}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove ${row.value || "item"}`}
              className="text-tertiary min-h-tap flex min-w-tap items-center justify-center"
            >
              <XIcon size={18} />
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="text-accent-strong min-h-tap self-start text-sm font-bold"
      >
        Add item
      </button>

      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
      <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
        Save recipe
      </Button>
    </form>
  );
}
