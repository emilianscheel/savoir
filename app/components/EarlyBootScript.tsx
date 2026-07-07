const CANONICAL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://aws-builder-hackathon.butterbase.dev"
).replace(/\/$/, "");

/** Runs before React — OAuth callback escape hatch + session capture. */
export function EarlyBootScript() {
  const canonicalJson = JSON.stringify(CANONICAL);
  const script = `
(function () {
  try {
    var host = location.hostname;
    var path = location.pathname;
    var canonical = ${canonicalJson};

    if (host === "api.butterbase.ai") {
      if (path.indexOf("slack_oauth_callback") !== -1) {
        var oauthParams = new URLSearchParams(location.search);
        if (oauthParams.get("code") || oauthParams.get("error")) {
          location.replace(canonical + "/oauth/callback?" + oauthParams.toString());
          return;
        }
      }
      if (path.indexOf("/v1/") !== 0) {
        var routes = ["/signin", "/onboarding", "/dashboard", "/connect", "/oauth/callback"];
        var appPath = "/";
        for (var i = 0; i < routes.length; i++) {
          if (path === routes[i] || path.endsWith(routes[i])) {
            appPath = routes[i];
            break;
          }
        }
        location.replace(canonical + appPath + location.search + location.hash);
        return;
      }
    }

    var params = new URLSearchParams(location.search);
    var token = params.get("access_token");
    if (!token) return;

    var payload = { access_token: token };
    var jobId = params.get("job_id");
    if (jobId) payload.job_id = jobId;
    localStorage.setItem("savoir_session", JSON.stringify(payload));
    window.dispatchEvent(new Event("savoir:session-changed"));

    params.delete("access_token");
    params.delete("job_id");
    var qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  } catch (e) {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
