#!/usr/bin/env bash
# 포크한 플러그인 <id>를 업스트림 최신본과 비교한다.
#   tools/upstream-diff.sh <id> [ref]   (ref 기본값: main)
# 업스트림 사본은 .upstream/<ref>/plugins/<id> 에 남는다(gitignore).
set -euo pipefail
id=${1:?usage: tools/upstream-diff.sh <id> [ref]}; ref=${2:-main}
root=$(cd "$(dirname "$0")/.." && pwd)
repo=$(python3 -c "import json;print(json.load(open('$root/upstream.json'))['repo'])")
base=$(python3 -c "import json;print(json.load(open('$root/upstream.json'))['commit'])")
dst="$root/.upstream/$ref"
rm -rf "$dst"
git clone -q --depth 1 --branch "$ref" --filter=blob:none --no-checkout "https://github.com/$repo" "$dst"
git -C "$dst" sparse-checkout set --no-cone "/plugins/$id/"
git -C "$dst" checkout -q
echo "upstream $repo@$(git -C "$dst" rev-parse --short HEAD) (base in upstream.json: ${base:0:7})"
git diff --no-index --stat "$dst/plugins/$id" "$root/$id" || true
echo "자세히: git diff --no-index $dst/plugins/$id $root/$id"
