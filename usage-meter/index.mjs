// usage-meter: shows usage limits / remaining credit for every provider logged in to pi,
// as bottom-bar badges in pi-web-ui. Refreshes every REFRESH_MS on the server.
//
// Credentials are read (never written) from pi's own store:
//   ~/.pi/agent/auth.json           OAuth tokens and API keys
//   ~/.pi/agent/provider-keys.json  extra API keys (active key per provider)
// Expired OAuth access tokens are not refreshed here (pi refreshes them when it uses them);
// the badge shows "만료" until then.
//
// Endpoints (unofficial ones may break without notice):
//   Claude   GET api.anthropic.com/api/oauth/usage                (OAuth, unofficial)
//   Codex    GET chatgpt.com/backend-api/wham/usage               (OAuth, unofficial)
//   Copilot  GET api.github.com/copilot_internal/user             (GitHub token, unofficial)
//   Z.ai     GET api.z.ai/api/monitor/usage/quota/limit           (API key, unofficial)
//   DeepSeek GET api.deepseek.com/user/balance                    (API key, official)
//   Google (Gemini API key) has no balance/quota API, so it is not shown.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const REFRESH_MS = 3 * 60_000;
const SLOT = "bottombar";

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(path.join(AGENT_DIR, file), "utf8"));
	} catch {
		return {};
	}
}

function credentials() {
	const auth = readJson("auth.json");
	const keys = readJson("provider-keys.json");
	const apiKey = (id) => {
		const a = auth[id];
		if (a?.key) return a.key;
		const pk = keys[id];
		if (!pk?.keys?.length) return undefined;
		return (pk.keys.find((k) => k.name === pk.activeKeyName) ?? pk.keys[0])?.apiKey;
	};
	return { auth, apiKey };
}

const pct = (n) => `${Math.round(Number(n) || 0)}%`;

function until(when) {
	const t = typeof when === "number" ? (when < 1e12 ? when * 1000 : when) : Date.parse(when);
	if (!Number.isFinite(t)) return "";
	const m = Math.max(0, Math.round((t - Date.now()) / 60_000));
	if (m < 60) return `${m}분`;
	const h = Math.floor(m / 60);
	if (h < 48) return `${h}시간 ${m % 60}분`;
	return `${Math.floor(h / 24)}일 ${h % 24}시간`;
}

function windowName(seconds) {
	const h = Math.round(seconds / 3600);
	if (h >= 24 * 6) return `${Math.round(h / 24)}d`;
	return `${h}h`;
}

async function getJson(host, url, headers) {
	const r = await host.net.fetch(url, { method: "GET", headers: { Accept: "application/json", ...headers } });
	if (!r.ok) {
		const e = new Error(r.status ? `HTTP ${r.status}` : r.error || "network error");
		e.status = r.status;
		throw e;
	}
	return JSON.parse(r.text || "{}");
}

const expired = (cred) => typeof cred?.expires === "number" && cred.expires < Date.now();

// Each collector returns null (not configured) or { label, hint }.
const collectors = {
	async claude(host, { auth }) {
		const c = auth.anthropic;
		if (c?.type !== "oauth") return null;
		if (expired(c)) return { label: "Claude 토큰 만료", hint: "pi로 Claude를 한 번 쓰면 토큰이 갱신됩니다." };
		const j = await getJson(host, "https://api.anthropic.com/api/oauth/usage", {
			Authorization: `Bearer ${c.access}`,
			"anthropic-beta": "oauth-2025-04-20",
		});
		const parts = [];
		const hint = [];
		if (j.five_hour) {
			parts.push(`5h ${pct(j.five_hour.utilization)}`);
			hint.push(`5시간: ${pct(j.five_hour.utilization)} 사용, ${until(j.five_hour.resets_at)} 후 초기화`);
		}
		if (j.seven_day) {
			parts.push(`7d ${pct(j.seven_day.utilization)}`);
			hint.push(`주간: ${pct(j.seven_day.utilization)} 사용, ${until(j.seven_day.resets_at)} 후 초기화`);
		}
		for (const [k, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) {
			if (j[k]) hint.push(`주간 ${name}: ${pct(j[k].utilization)}`);
		}
		const ex = j.extra_usage;
		if (ex?.is_enabled) hint.push(`추가 사용량: ${ex.used_credits}/${ex.monthly_limit} ${ex.currency ?? ""}`);
		return { label: `Claude ${parts.join(" · ")}`, hint: hint.join(" / ") };
	},

	async codex(host, { auth }) {
		const c = auth["openai-codex"];
		if (c?.type !== "oauth") return null;
		if (expired(c)) return { label: "Codex 토큰 만료", hint: "pi로 Codex를 한 번 쓰면 토큰이 갱신됩니다." };
		const headers = { Authorization: `Bearer ${c.access}` };
		if (c.accountId) headers["ChatGPT-Account-Id"] = c.accountId;
		const j = await getJson(host, "https://chatgpt.com/backend-api/wham/usage", headers);
		const rl = j.rate_limit ?? {};
		const parts = [];
		const hint = [];
		for (const w of [rl.primary_window, rl.secondary_window]) {
			if (!w) continue;
			const name = w.limit_window_seconds ? windowName(w.limit_window_seconds) : "?";
			parts.push(`${name} ${pct(w.used_percent)}`);
			const reset = w.reset_at ?? (w.reset_after_seconds != null ? Date.now() + w.reset_after_seconds * 1000 : undefined);
			hint.push(`${name}: ${pct(w.used_percent)} 사용${reset ? `, ${until(reset)} 후 초기화` : ""}`);
		}
		if (j.credits?.has_credits && !j.credits.unlimited) hint.push(`크레딧 잔액: ${j.credits.balance}`);
		return { label: `Codex ${parts.join(" · ") || "?"}`, hint: hint.join(" / ") || j.plan_type || "" };
	},

	async copilot(host, { auth }) {
		const c = auth["github-copilot"];
		if (!c?.refresh) return null;
		const enterprise = c.enterpriseUrl && c.enterpriseUrl !== "github.com" ? c.enterpriseUrl : null;
		const api = enterprise ? `https://api.${enterprise}` : "https://api.github.com";
		if (enterprise) return { label: "Copilot (Enterprise 미지원)", hint: `${enterprise}는 netAllowlist에 없음` };
		const j = await getJson(host, `${api}/copilot_internal/user`, {
			Authorization: `token ${c.refresh}`,
			"Editor-Version": "vscode/1.99.0",
			"User-Agent": "GitHubCopilotChat/0.26.7",
		});
		const p = j.quota_snapshots?.premium_interactions;
		const reset = j.quota_reset_date_utc || j.quota_reset_date;
		if (!p) return { label: "Copilot ?", hint: `플랜: ${j.copilot_plan ?? "?"}` };
		if (p.unlimited) return { label: "Copilot 무제한", hint: `플랜: ${j.copilot_plan ?? "?"}` };
		const left = Math.floor(p.quota_remaining ?? p.remaining ?? 0);
		return {
			label: `Copilot ${left}/${p.entitlement} 남음`,
			hint: `프리미엄 요청 ${left}/${p.entitlement} 남음 (${pct(p.percent_remaining)})${reset ? `, ${until(reset)} 후 초기화` : ""}, 플랜 ${j.copilot_plan ?? "?"}`,
		};
	},

	async zai(host, { apiKey }) {
		const key = apiKey("zai");
		if (!key) return null;
		const j = await getJson(host, "https://api.z.ai/api/monitor/usage/quota/limit", { Authorization: key });
		const unit = { 1: "d", 3: "h", 5: "M", 6: "w" };
		const parts = [];
		const hint = [];
		for (const l of j.data?.limits ?? []) {
			const name = `${l.number ?? ""}${unit[l.unit] ?? "?"}`;
			if (l.type === "TOKENS_LIMIT") {
				parts.push(`${name} ${pct(l.percentage)}`);
				hint.push(`토큰 ${name}: ${pct(l.percentage)} 사용, ${until(l.nextResetTime)} 후 초기화`);
			} else if (l.type === "TIME_LIMIT") {
				hint.push(`도구 호출 ${name}: ${l.currentValue ?? 0}/${l.usage} 사용`);
			}
		}
		return { label: `Z.ai ${parts.join(" · ") || "?"}`, hint: `${j.data?.level ?? ""} 플랜 / ${hint.join(" / ")}` };
	},

	async deepseek(host, { apiKey }) {
		const key = apiKey("deepseek");
		if (!key) return null;
		const j = await getJson(host, "https://api.deepseek.com/user/balance", { Authorization: `Bearer ${key}` });
		const b = (j.balance_infos ?? []).map((x) => `${x.currency === "CNY" ? "¥" : x.currency === "USD" ? "$" : `${x.currency} `}${x.total_balance}`);
		return {
			label: `DeepSeek ${b.join(" + ") || "?"}`,
			hint: `${j.is_available ? "사용 가능" : "잔액 부족"} / ${(j.balance_infos ?? []).map((x) => `${x.currency} 충전 ${x.topped_up_balance}, 무료 ${x.granted_balance}`).join(" / ")}`,
		};
	},
};

// pi provider id (the part before "/" in the session model) -> collector.
const PROVIDER_OF = {
	anthropic: "claude",
	"openai-codex": "codex",
	"github-copilot": "copilot",
	zai: "zai",
	deepseek: "deepseek",
};
const NAME = { claude: "Claude", codex: "Codex", copilot: "Copilot", zai: "Z.ai", deepseek: "DeepSeek" };
const CACHE_MS = 2 * 60_000;

function modelOf(snap) {
	const r = snap && typeof snap === "object" ? snap : {};
	const provider = r.provider ?? r.modelProvider ?? r.model?.provider;
	const model = typeof r.model === "string" ? r.model : (r.model?.id ?? r.modelId ?? "");
	if (provider && model && !String(model).includes("/")) return `${provider}/${model}`;
	return String(model || "");
}

function collectorFor(model) {
	const seg = String(model).split("/")[0].trim();
	return PROVIDER_OF[seg] ?? "";
}

export default {
	activate(host) {
		const state = { model: "", cache: new Map() };

		const readModel = () => {
			try {
				return modelOf(host.getActiveConversation?.());
			} catch {
				return "";
			}
		};

		async function load(id, force) {
			const hit = state.cache.get(id);
			if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit;
			let r;
			try {
				r = await collectors[id](host, credentials());
				if (!r) r = { label: `${NAME[id]} 로그인 안 됨`, hint: "pi에 이 제공자의 로그인/키가 없습니다." };
			} catch (e) {
				const auth = e.status === 401 || e.status === 403;
				r = { label: `${NAME[id]} ${auth ? "인증 실패" : "조회 실패"}`, hint: String(e.message || e), error: true };
				host.log("warn", `${id}: ${e.message || e}`);
			}
			const entry = { ...r, at: Date.now() };
			state.cache.set(id, entry);
			return entry;
		}

		async function summary(force) {
			if (!state.model) state.model = readModel();
			const id = collectorFor(state.model);
			if (!id) return { ok: true, model: state.model, active: "", footer: null };
			const r = await load(id, force);
			return {
				ok: true,
				model: state.model,
				active: id,
				name: NAME[id],
				lines: String(r.hint || "").split(" / ").filter(Boolean),
				updatedAt: new Date(r.at).toISOString(),
				footer: { text: r.label, tip: `${r.hint}`.slice(0, 300) },
			};
		}

		host.route("GET", "/summary", (req, res) => {
			const force = String(req?.query?.force ?? "") === "1";
			summary(force)
				.then((p) => res.json(p))
				.catch((e) => res.status(500).json({ ok: false, error: String(e?.message || e) }));
		});

		// Per-provider card for the Model Studio injection: ?id=claude|codex|copilot|zai|deepseek
		host.route("GET", "/provider", (req, res) => {
			const id = String(req?.query?.id ?? "");
			if (!collectors[id]) return res.status(400).json({ ok: false, error: "unknown provider" });
			const force = String(req?.query?.force ?? "") === "1";
			load(id, force)
				.then((r) =>
					res.json({
						ok: true,
						id,
						name: NAME[id],
						label: r.label,
						lines: String(r.hint || "").split(" / ").filter(Boolean),
						error: !!r.error,
						updatedAt: new Date(r.at).toISOString(),
					}),
				)
				.catch((e) => res.status(500).json({ ok: false, error: String(e?.message || e) }));
		});

		host.onClientModelChanged?.((snap) => {
			const m = modelOf(snap);
			if (m) state.model = m;
			host.log("info", `model -> ${state.model}`);
		});
		host.onConversationChanged?.(() => {
			const m = readModel();
			if (m) state.model = m;
		});
		state.model = readModel();
		host.log("info", `initial model: ${state.model || "(none)"}`);
	},
};
