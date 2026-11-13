// obsidian-web MCP(무상태 Streamable HTTP)의 도구를 pi 에이전트 도구로 옮겨 단다.
// pi-web-ui의 MCP 연결은 도구를 접두사 없이 늘 실어서 read·edit가 기본 도구와 겹치고 노출 방식을 못 고른다.
// 플러그인 도구는 설정 → 도구에서 도구마다 상시/필요할 때/끄기를 정할 수 있다.

const RETRY_MS = 30_000;
const CALL_TIMEOUT_MS = 60_000;

export default {
	activate(host) {
		const settings = () => {
			const s = host.getSettings?.() ?? {};
			return {
				url: String(s.url || "http://127.0.0.1:55020/mcp").trim(),
				token: String(s.token || "").trim(),
				prefix: String(s.prefix ?? "vault_").trim(),
			};
		};

		let rpcId = 0;
		async function rpc(method, params, signal) {
			const { url, token } = settings();
			const headers = { "Content-Type": "application/json", Accept: "application/json" };
			if (token) headers.Authorization = `Bearer ${token}`;
			const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
			const res = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? {} }),
				signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
			});
			if (!res.ok) throw new Error(`obsidian-web ${method}: HTTP ${res.status}`);
			const body = await res.json();
			if (body.error) throw new Error(`obsidian-web ${method}: ${body.error.message}`);
			return body.result;
		}

		let unregister = [];
		let timer = null;
		let disposed = false;

		function register(tools, instructions) {
			const { prefix } = settings();
			unregister = tools.map((tool, i) =>
				host.registerAgentTool({
					name: prefix + tool.name,
					label: `Obsidian · ${tool.annotations?.title ?? tool.name}`,
					description: tool.description ?? tool.name,
					promptSnippet: tool.annotations?.title ?? tool.name,
					// 서버 안내문(어떤 도구부터 쓰는지)은 한 번만 싣는다. 설명 안의 도구 이름은 접두사 없는 원래 이름이다.
					promptGuidelines:
						i === 0 && instructions
							? [instructions, `Vault tool names here start with ${prefix}; descriptions use the bare names.`]
							: undefined,
					parameters: tool.inputSchema ?? { type: "object", properties: {} },
					async execute(_toolCallId, params, signal) {
						const result = await rpc("tools/call", { name: tool.name, arguments: params ?? {} }, signal);
						const text = (result?.content ?? [])
							.filter((c) => c?.type === "text")
							.map((c) => c.text)
							.join("\n");
						if (result?.isError) throw new Error(text || "obsidian-web tool error");
						return { content: [{ type: "text", text }], details: {} };
					},
				}),
			);
		}

		async function connect() {
			timer = null;
			if (disposed) return;
			try {
				const init = await rpc("initialize", {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "pi-obsidian-vault", version: "0.1.0" },
				});
				const list = await rpc("tools/list");
				if (disposed) return;
				register(list?.tools ?? [], init?.instructions);
				console.log(`[obsidian-vault] ${unregister.length} tools`);
			} catch (e) {
				console.warn(`[obsidian-vault] connect failed, retry in ${RETRY_MS / 1000}s: ${e?.message ?? e}`);
				if (!disposed) timer = setTimeout(connect, RETRY_MS);
			}
		}

		connect();

		return () => {
			disposed = true;
			if (timer) clearTimeout(timer);
			for (const off of unregister) {
				try {
					off?.();
				} catch {}
			}
			unregister = [];
		};
	},
};
