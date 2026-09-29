"use client";

import { useState, type FormEvent } from "react";
import { useT } from "@/lib/i18n";

export interface AddressFormValues {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

const EMPTY_VALUES: AddressFormValues = {
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
};

interface AddressFormProps {
  initialValues?: Partial<AddressFormValues>;
  onSubmit: (values: AddressFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
  loading?: boolean;
}

export function AddressForm({ initialValues, onSubmit, onCancel, submitLabel, loading }: AddressFormProps) {
  const [values, setValues] = useState<AddressFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const t = useT();

  function update<K extends keyof AddressFormValues>(key: K, value: AddressFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={values.fullName}
        onChange={(e) => update("fullName", e.target.value)}
        placeholder={t("addressForm.fullName")}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <input
        value={values.addressLine1}
        onChange={(e) => update("addressLine1", e.target.value)}
        placeholder={t("addressForm.address")}
        required
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <input
        value={values.addressLine2}
        onChange={(e) => update("addressLine2", e.target.value)}
        placeholder={t("addressForm.addressLine2")}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          value={values.city}
          onChange={(e) => update("city", e.target.value)}
          placeholder={t("addressForm.city")}
          required
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          value={values.state}
          onChange={(e) => update("state", e.target.value)}
          placeholder={t("addressForm.state")}
          required
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          value={values.postalCode}
          onChange={(e) => update("postalCode", e.target.value)}
          placeholder={t("addressForm.postalCode")}
          required
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder={t("addressForm.phone")}
          required
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 rounded-full px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("addressForm.saving") : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-6 py-2.5 text-sm text-muted-foreground"
          >
            {t("addressForm.cancel")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
