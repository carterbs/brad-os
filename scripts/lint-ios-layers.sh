#!/usr/bin/env bash
# lint-ios-layers.sh - Enforce iOS architecture layer boundaries
#
# Rule 1: Views/ must not directly reference Service types
#         (Views should access services through ViewModels)
# Rule 2: Components/ must not reference ViewModel types
#         (Components should receive data via parameters)
#
# Exits 0 if clean, 1 if violations found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_APP="$REPO_ROOT/ios/BradOS/BradOS"
SERVICES_DIR="$IOS_APP/Services"
VIEWMODELS_DIR="$IOS_APP/ViewModels"
VIEWS_DIR="$IOS_APP/Views"
COMPONENTS_DIR="$IOS_APP/Components"

violations=0

# ── Discover Service class/actor names from Services/ ────────────────────────
# Only class/actor types are actual services. Structs and enums in Services/
# are data models (e.g. StravaTokens, WatchWorkoutContext) and are fine to use.
service_types=()
if [[ -d "$SERVICES_DIR" ]]; then
    while IFS= read -r name; do
        [[ -n "$name" ]] && service_types+=("$name")
    done < <(
        grep -hE '^\s*(final\s+)?(class|actor)\s+\w+' "$SERVICES_DIR"/*.swift 2>/dev/null \
        | sed -E 's/.*(class|actor)[[:space:]]+([[:alnum:]_]+).*/\2/' \
        | sort -u
    )
fi

# ── Discover ViewModel class names from ViewModels/ ──────────────────────────
# Only class types are actual ViewModels. Structs/enums in ViewModels/ are
# supporting data types (e.g. WeightChartPoint, HealthChartRange) that
# Components may legitimately reference.
vm_types=()
if [[ -d "$VIEWMODELS_DIR" ]]; then
    while IFS= read -r name; do
        [[ -n "$name" ]] && vm_types+=("$name")
    done < <(
        grep -hE '^\s*(final\s+)?class\s+\w+' "$VIEWMODELS_DIR"/*.swift 2>/dev/null \
        | sed -E 's/.*class[[:space:]]+([[:alnum:]_]+).*/\1/' \
        | sort -u
    )
fi

if [[ ${#service_types[@]} -eq 0 ]]; then
    echo "Warning: No service types discovered in $SERVICES_DIR"
fi
if [[ ${#vm_types[@]} -eq 0 ]]; then
    echo "Warning: No ViewModel types discovered in $VIEWMODELS_DIR"
fi

# ── Helper: build a grep pattern from an array of type names ─────────────────
build_pattern() {
    local IFS='|'
    echo "\\b($*)\\b"
}

# ── Helper: find the first #Preview or PreviewProvider line number ───────────
# Returns 0 if no preview section found.
first_preview_line() {
    grep -nE '^#Preview|_Previews:' "$1" 2>/dev/null | head -1 | cut -d: -f1 || echo "0"
}

# ── Helper: check if a line is a comment-only line ──────────────────────────
is_comment_line() {
    echo "$1" | grep -qE '^\s*//'
}

# ── Helper: strip trailing comment from a line ──────────────────────────────
strip_trailing_comment() {
    echo "$1" | sed -E 's|[[:space:]]//.*$||'
}

# ── Rule 1: Views/ must not directly reference Service types ─────────────────
if [[ -d "$VIEWS_DIR" ]] && [[ ${#service_types[@]} -gt 0 ]]; then
    pattern=$(build_pattern "${service_types[@]}")

    while IFS= read -r view_file; do
        # Find where preview section starts (everything after is ignored)
        preview_start=$(first_preview_line "$view_file")

        # Search for service type references with line numbers
        matches=$(grep -nE "$pattern" "$view_file" 2>/dev/null || true)
        if [[ -z "$matches" ]]; then
            continue
        fi

        while IFS= read -r match; do
            line_num="${match%%:*}"
            line_content="${match#*:}"

            # Skip lines in preview section
            if [[ "$preview_start" -gt 0 ]] && [[ "$line_num" -ge "$preview_start" ]]; then
                continue
            fi

            # Skip comment-only lines
            if is_comment_line "$line_content"; then
                continue
            fi

            # Strip trailing comment, then check if type still appears in code part
            code_part=$(strip_trailing_comment "$line_content")

            # Skip lines where the type only appears in a Mock reference
            if echo "$code_part" | grep -qE 'Mock\w+'; then
                cleaned=$(echo "$code_part" | sed -E 's/Mock[[:alnum:]_]+//g')
                if ! echo "$cleaned" | grep -qE "$pattern"; then
                    continue
                fi
            fi

            # Report each matched service type
            for stype in "${service_types[@]}"; do
                if echo "$code_part" | grep -qw "$stype"; then
                    # Skip if part of a Mock type name
                    if echo "$code_part" | grep -qE "Mock${stype}"; then
                        continue
                    fi
                    rel_path="${view_file#"$REPO_ROOT/"}"
                    echo "VIOLATION: $rel_path:$line_num references $stype (a Service type). Views should access services through ViewModels."
                    violations=$((violations + 1))
                fi
            done
        done <<< "$matches"
    done < <(find "$VIEWS_DIR" -name '*.swift' -type f | sort)
fi

# ── Rule 2: Components/ must not reference ViewModel types ───────────────────
if [[ -d "$COMPONENTS_DIR" ]] && [[ ${#vm_types[@]} -gt 0 ]]; then
    pattern=$(build_pattern "${vm_types[@]}")

    while IFS= read -r comp_file; do
        preview_start=$(first_preview_line "$comp_file")

        matches=$(grep -nE "$pattern" "$comp_file" 2>/dev/null || true)
        if [[ -z "$matches" ]]; then
            continue
        fi

        while IFS= read -r match; do
            line_num="${match%%:*}"
            line_content="${match#*:}"

            if [[ "$preview_start" -gt 0 ]] && [[ "$line_num" -ge "$preview_start" ]]; then
                continue
            fi

            if is_comment_line "$line_content"; then
                continue
            fi

            code_part=$(strip_trailing_comment "$line_content")

            for vtype in "${vm_types[@]}"; do
                if echo "$code_part" | grep -qw "$vtype"; then
                    rel_path="${comp_file#"$REPO_ROOT/"}"
                    echo "VIOLATION: $rel_path:$line_num references $vtype (a ViewModel type). Components should receive data via parameters."
                    violations=$((violations + 1))
                fi
            done
        done <<< "$matches"
    done < <(find "$COMPONENTS_DIR" -name '*.swift' -type f | sort)
fi

# ── Summary ──────────────────────────────────────────────────────────────────
if [[ $violations -gt 0 ]]; then
    echo ""
    echo "Found $violations architecture violation(s)."
    exit 1
else
    echo "iOS architecture layers: OK (no violations found)"
    exit 0
fi
