// Per-category barrel (navigation). Same pattern as components/core/index.ts and
// components/forms/index.ts — each port batch gets its own barrel so they never
// contend for one shared file.
export { SectionHeader } from "./SectionHeader";
export type { SectionHeaderProps, SectionHeaderLevel, SectionHeaderTone } from "./SectionHeader";

export { StepIndicator } from "./StepIndicator";
export type { StepIndicatorProps, StepIndicatorItem } from "./StepIndicator";

export { Tabs } from "./Tabs";
export type { TabsProps, TabsItem, TabsVariant } from "./Tabs";
