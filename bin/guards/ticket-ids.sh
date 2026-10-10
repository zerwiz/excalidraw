#!/usr/bin/env bash
# ticket-ids — every ticket file carries a dev id, and no number is taken twice.
#
#   <type>-<NNNN>-<devid>-<slug>.md      devid comes from tickets/DEVIDS
#
# Why a guard and not a convention: two developers filing at once can take the same
# number, and the collision is invisible in a directory listing until the filename
# carries the id. The id makes the clash *legible*; this script makes it fatal.
#
#   ./bin/guards/ticket-ids.sh
#
# Escape hatch: none. A ticket file that does not match the rule is wrong, not taste.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

[ -d tickets ] || exit 0

# --- dev ids ---------------------------------------------------------------
if [ -f tickets/DEVIDS ]; then
  DEVIDS=$(grep -vE '^\s*#|^\s*$' tickets/DEVIDS | awk '{print $1}' | paste -sd'|')
else
  DEVIDS=""
fi

if [ -z "$DEVIDS" ]; then
  echo "✖ tickets/DEVIDS is missing or lists no dev id"
  echo "    add:  <devid> <github-handle>   (e.g. 'uw @zerwiz')"
  exit 1
fi

# handle expected for a given dev id
handle_for() {
  grep -vE '^\s*#|^\s*$' tickets/DEVIDS | awk -v id="$1" '$1==id {print $2}'
}

bad=0

# --- 1. every ticket file is named <type>-<NNNN>-<devid>-<slug>.md ----------
while IFS= read -r f; do
  base=$(basename "$f" .md)
  if ! printf '%s' "$base" | grep -Eq "^(bug|feature|chore|spike)-[0-9]{4}-($DEVIDS)-.+"; then
    echo "✖ $f"
    echo "    expected <type>-<NNNN>-($DEVIDS)-<slug>.md"
    bad=1
  fi
done < <(find tickets -mindepth 2 -name '*.md' -not -path 'tickets/_templates/*' | sort)

# --- 2. the same number is never taken twice for the same type --------------
while IFS= read -r dup; do
  [ -z "$dup" ] && continue
  type=${dup%%:*}
  num=${dup##*:}
  echo "✖ duplicate ticket number $num for type '$type':"
  find tickets -mindepth 2 -name "${type}-${num}-*.md" -not -path 'tickets/_templates/*' \
    | sed 's/^/    /'
  bad=1
done < <(find tickets -mindepth 2 -name '*.md' -not -path 'tickets/_templates/*' \
           | xargs -n1 basename 2>/dev/null \
           | grep -Eo "^(bug|feature|chore|spike)-[0-9]{4}" \
           | sort | uniq -d | sed 's/-/:/')

# --- 3. every ticket carries an Owner, and the id agrees with it ------------
while IFS= read -r f; do
  base=$(basename "$f" .md)
  id=$(printf '%s' "$base" | sed -nE "s/^[a-z]+-[0-9]{4}-($DEVIDS)-.*/\1/p")
  [ -z "$id" ] && continue
  owner=$(grep -m1 '^\*\*Type\*\*' "$f" | sed -nE 's/.*\*\*Owner\*\* *@([A-Za-z0-9-]+).*/\1/p')
  want=$(handle_for "$id" | tr -d '@')
  case "$owner" in
    "") echo "✖ $f — no **Owner** in the header; a ticket with no owner is not filed"; bad=1 ;;
    "$want") ;;
    *)  echo "✖ $f — filename id '$id' expects owner @$want, found @$owner"; bad=1 ;;
  esac
done < <(find tickets -mindepth 2 -name '*.md' -not -path 'tickets/_templates/*' | sort)

if [ "$bad" -eq 0 ]; then
  n=$(find tickets -mindepth 2 -name '*.md' -not -path 'tickets/_templates/*' | wc -l)
  echo "✔ ticket naming and ownership ($n tickets)"
fi
exit $bad
