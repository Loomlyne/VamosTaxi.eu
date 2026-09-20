/**
 * K76: TLS for dashboard.vamostaxi.site lands here (custom domain), not on
 * Worker `vamos`. Internet Host spoof on apex never reaches this script.
 * No secrets. Forwards to vamos's `Dashboard` entrypoint (not default fetch).
 * Do not bind vamostaxi.eu. Do not bind this hostname to vamos-ops-changes.
 */
export interface Env {
  APP: Fetcher;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    return env.APP.fetch(request);
  },
};
