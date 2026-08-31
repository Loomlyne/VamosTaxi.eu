import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SettingsPanes, PolicyVersionCard } from "@/components/ops";
import { loadCurrentPolicyVersion, loadPolicyHistory, loadSettings } from "@/lib/ops/settings";
import { requireStaffClaims } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateSettings } from "./actions";

export const dynamic = "force-dynamic";

const PANES = ["company", "locale", "payments", "notifications", "dispatch"] as const;

export type SettingsPane = (typeof PANES)[number];

function parsePane(value: string | undefined): SettingsPane {
  if (value && (PANES as readonly string[]).includes(value)) return value as SettingsPane;
  return "company";
}

export default async function OpsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ pane?: string }>;
}) {
  const query = await searchParams;
  const pane = parsePane(query.pane);

  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();

  const [settings, current, history] = await Promise.all([
    loadSettings(env, claims),
    loadCurrentPolicyVersion(env, claims),
    loadPolicyHistory(env, claims),
  ]);

  return (
    <div data-ops-settings="1">
      <SettingsPanes settings={settings} pane={pane} updateSettings={updateSettings} />
      <PolicyVersionCard current={current} history={history} />
    </div>
  );
}
