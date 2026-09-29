"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { ApiError, uploadFile } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { Category } from "@/lib/types";

export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  discountPercentage: number | null;
  discountDurationDays: number | null;
  brand: string | null;
  stock: number;
  categoryId: string;
  images: string[];
  weightInGrams: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  sku: string;
  isActive: boolean;
}

const REQUIRED_IMAGE_COUNT = 4;

const EMPTY_VALUES: Omit<ProductFormValues, "categoryId"> = {
  name: "",
  description: "",
  price: 0,
  discountPercentage: null,
  discountDurationDays: null,
  brand: null,
  stock: 0,
  images: [],
  weightInGrams: 0,
  widthCm: 0,
  heightCm: 0,
  depthCm: 0,
  sku: "",
  isActive: true,
};

interface ProductFormProps {
  categories: Category[];
  initialValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
  loading?: boolean;
}

function toSlots(images: string[] | undefined): string[] {
  const slots = [...(images ?? [])];
  while (slots.length < REQUIRED_IMAGE_COUNT) slots.push("");
  return slots.slice(0, REQUIRED_IMAGE_COUNT);
}

export function ProductForm({ categories, initialValues, onSubmit, onCancel, submitLabel, loading }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>({
    ...EMPTY_VALUES,
    categoryId: categories[0]?.id ?? "",
    ...initialValues,
  });
  const [imageSlots, setImageSlots] = useState<string[]>(toSlots(initialValues?.images));
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imagesTouched, setImagesTouched] = useState(false);
  const token = useAuthStore((state) => state.token);
  const t = useT();
  const SLOT_LABELS = [t("productForm.slotMain"), t("productForm.slotThumb", { n: 2 }), t("productForm.slotThumb", { n: 3 }), t("productForm.slotThumb", { n: 4 })];

  function update<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setSlot(index: number, url: string) {
    setImageSlots((prev) => prev.map((slot, i) => (i === index ? url : slot)));
  }

  async function handleSlotUpload(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setUploadingSlot(index);
    try {
      const { url } = await uploadFile<{ url: string }>("/uploads/product-image", file, token);
      setSlot(index, url);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t("productForm.uploadError"));
    } finally {
      setUploadingSlot(null);
    }
  }

  const filledImages = imageSlots.map((s) => s.trim()).filter(Boolean);
  const imagesComplete = filledImages.length === REQUIRED_IMAGE_COUNT;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImagesTouched(true);
    if (!imagesComplete) return;
    await onSubmit({ ...values, images: filledImages });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={values.name}
        onChange={(e) => update("name", e.target.value)}
        placeholder={t("productForm.name")}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <textarea
        value={values.description}
        onChange={(e) => update("description", e.target.value)}
        placeholder={t("productForm.description")}
        required
        rows={2}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          value={values.price}
          onChange={(e) => update("price", Number(e.target.value))}
          placeholder={t("productForm.price")}
          required
          min={1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={values.discountPercentage ?? ""}
          onChange={(e) => update("discountPercentage", e.target.value === "" ? null : Number(e.target.value))}
          placeholder={t("productForm.discountPercent")}
          min={1}
          max={99}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>
      {values.discountPercentage ? (
        <input
          type="number"
          value={values.discountDurationDays ?? ""}
          onChange={(e) => update("discountDurationDays", e.target.value === "" ? null : Number(e.target.value))}
          placeholder={t("productForm.discountDuration")}
          min={1}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      ) : null}
      <input
        type="number"
        value={values.stock}
        onChange={(e) => update("stock", Number(e.target.value))}
        placeholder={t("productForm.stock")}
        required
        min={0}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <select
        value={values.categoryId}
        onChange={(e) => update("categoryId", e.target.value)}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        value={values.sku}
        onChange={(e) => update("sku", e.target.value)}
        placeholder={t("productForm.sku")}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <input
        value={values.brand ?? ""}
        onChange={(e) => update("brand", e.target.value === "" ? null : e.target.value)}
        placeholder={t("productForm.brand")}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />

      <div>
        <p className="mb-1 text-sm font-medium">
          {t("productForm.imagesTitle", { count: filledImages.length, total: REQUIRED_IMAGE_COUNT })}
        </p>
        <p className="mb-2 text-xs text-muted-foreground">{t("productForm.imagesHint")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {imageSlots.map((slot, index) => (
            <div key={index} className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">{SLOT_LABELS[index]}</p>
              {slot ? (
                <div className="product-media relative aspect-square overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setSlot(index, "")}
                    aria-label={t("productForm.removeImage")}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-2 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSlotUpload(index, e)}
                    disabled={uploadingSlot === index}
                    className="w-full text-[10px]"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {uploadingSlot === index ? t("productForm.uploading") : t("productForm.orPasteUrl")}
                  </span>
                  <input
                    type="url"
                    value={slot}
                    onChange={(e) => setSlot(index, e.target.value)}
                    placeholder={t("productForm.urlPlaceholder")}
                    className="w-full rounded border border-border px-1 py-0.5 text-[10px]"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {imagesTouched && !imagesComplete ? (
          <p className="mt-1 text-sm text-red-600">
            {t("productForm.missingImages", { count: REQUIRED_IMAGE_COUNT - filledImages.length })}
          </p>
        ) : null}
        {uploadError ? <p className="mt-1 text-sm text-red-600">{uploadError}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <input
          type="number"
          value={values.weightInGrams}
          onChange={(e) => update("weightInGrams", Number(e.target.value))}
          placeholder={t("productForm.weight")}
          required
          min={1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={values.widthCm}
          onChange={(e) => update("widthCm", Number(e.target.value))}
          placeholder={t("productForm.width")}
          required
          min={0.1}
          step={0.1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={values.heightCm}
          onChange={(e) => update("heightCm", Number(e.target.value))}
          placeholder={t("productForm.height")}
          required
          min={0.1}
          step={0.1}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>
      <input
        type="number"
        value={values.depthCm}
        onChange={(e) => update("depthCm", Number(e.target.value))}
        placeholder={t("productForm.depth")}
        required
        min={0.1}
        step={0.1}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => update("isActive", e.target.checked)}
        />
        {t("productForm.activeLabel")}
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 rounded-full px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("productForm.saving") : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-6 py-2.5 text-sm text-muted-foreground"
          >
            {t("productForm.cancel")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
