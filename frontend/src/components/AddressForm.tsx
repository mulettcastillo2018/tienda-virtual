"use client";

import { useState, type FormEvent } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

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
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label={t("addressForm.fullName")}>
        {(control) => (
          <Input {...control} value={values.fullName} onChange={(e) => update("fullName", e.target.value)} autoComplete="name" required />
        )}
      </Field>
      <Field label={t("addressForm.address")}>
        {(control) => (
          <Input
            {...control}
            value={values.addressLine1}
            onChange={(e) => update("addressLine1", e.target.value)}
            autoComplete="address-line1"
            required
          />
        )}
      </Field>
      <Field label={t("addressForm.addressLine2")}>
        {(control) => (
          <Input {...control} value={values.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} autoComplete="address-line2" />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("addressForm.city")}>
          {(control) => (
            <Input {...control} value={values.city} onChange={(e) => update("city", e.target.value)} autoComplete="address-level2" required />
          )}
        </Field>
        <Field label={t("addressForm.state")}>
          {(control) => (
            <Input {...control} value={values.state} onChange={(e) => update("state", e.target.value)} autoComplete="address-level1" required />
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("addressForm.postalCode")}>
          {(control) => (
            <Input
              {...control}
              value={values.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              autoComplete="postal-code"
              required
            />
          )}
        </Field>
        <Field label={t("addressForm.phone")}>
          {(control) => (
            <Input {...control} type="tel" value={values.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" required />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" size="lg" loading={loading} className="flex-1">
          {loading ? t("addressForm.saving") : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" size="lg" onClick={onCancel}>
            {t("addressForm.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
