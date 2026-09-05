"use client";

import { Input } from "../forms";

export type ContactFieldsValue = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
};

export type ContactFieldsErrors = Partial<Record<keyof ContactFieldsValue, string>>;

export function ContactFields({
  value,
  errors,
  onChange,
  emailHint,
  mobileHint,
  labels,
}: {
  value: ContactFieldsValue;
  errors: ContactFieldsErrors;
  onChange: (patch: Partial<ContactFieldsValue>) => void;
  emailHint: string;
  mobileHint: string;
  labels: ContactFieldsValue;
}) {
  return (
    <div className="vt-checkout-contact">
      <Input
        label={labels.firstName}
        required
        value={value.firstName}
        error={errors.firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
        autoComplete="given-name"
      />
      <Input
        label={labels.lastName}
        required
        value={value.lastName}
        error={errors.lastName}
        onChange={(e) => onChange({ lastName: e.target.value })}
        autoComplete="family-name"
      />
      <Input
        label={labels.email}
        icon="mail"
        required
        type="email"
        value={value.email}
        error={errors.email}
        hint={emailHint}
        onChange={(e) => onChange({ email: e.target.value })}
        autoComplete="email"
      />
      <Input
        label={labels.mobile}
        icon="phone"
        required
        type="tel"
        value={value.mobile}
        error={errors.mobile}
        hint={mobileHint}
        onChange={(e) => onChange({ mobile: e.target.value })}
        autoComplete="tel"
      />
    </div>
  );
}
