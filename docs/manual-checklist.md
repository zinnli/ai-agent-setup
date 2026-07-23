# 수동 확인 체크리스트 (실제 도구 로딩)

자동 테스트는 실제 HOME을 절대 수정하지 않으며, 실제 Claude/Codex가 생성 설정을 읽는지는 아래를 **수동으로** 확인한다. 먼저 임시 HOME으로 예행한 뒤, 준비되면 실제 HOME에 설치한다.

## 예행 (임시 HOME)

```bash
TMP=$(mktemp -d)
node dist/src/cli.js install --target=all --home="$TMP"
find "$TMP" -type f -not -path '*/.ai-agent-setup/*' | sort
node dist/src/cli.js doctor --target=all --home="$TMP"
node dist/src/cli.js uninstall --target=all --home="$TMP"
```

## 실제 설치

```bash
node dist/src/cli.js install --target=all
```

## Claude Code 확인

- [ ] `~/.claude/CLAUDE.md`가 지침으로 로드된다.
- [ ] `~/.claude/agents/*`의 서브에이전트가 인식된다.
- [ ] `~/.claude/skills/<name>/SKILL.md`가 스킬로 인식된다.
- [ ] `~/.claude.json`의 `mcpServers.notion`이 로드되고 `NOTION_TOKEN`이 주입된다.
- [ ] `~/.claude/settings.json`의 훅이 발화한다(예: `.env` 읽기 시도 → 차단, exit 2).
- [ ] 훅 명령의 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`가 올바로 확장된다.

## Codex 확인

- [ ] `~/.codex/AGENTS.md`가 사용자 레벨 지침으로 로드된다(경로 확인 — `COMPATIBILITY.md`).
- [ ] `~/.codex/agents/*.toml` 커스텀 에이전트가 인식된다.
- [ ] `~/.agents/skills/<name>/SKILL.md`가 스킬로 인식된다.
- [ ] `~/.codex/config.toml`의 `[mcp_servers.notion]`이 로드되고 `${NOTION_TOKEN}`이 실제로 확장/주입되는지 확인.
- [ ] `~/.codex/hooks.json`의 훅이 발화하고 차단이 동작한다(PreToolUse `tool_input` 필드명 확인).

## 정리

```bash
node dist/src/cli.js uninstall --target=all
```

`uninstall` 후 기존 사용자 설정(`settings.json`·`config.toml`·`~/.claude.json`의 사용자 키)이 그대로 남아 있는지 확인한다.
