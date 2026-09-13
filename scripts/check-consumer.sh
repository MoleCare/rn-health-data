#!/usr/bin/env bash
# Install the packed package the way an app would, with one package manager,
# and check that it loads.
#
#   scripts/check-consumer.sh <npm|yarn1|yarn4-pnp|yarn4-node-modules|pnpm|bun> [path/to/package.tgz]
#
# The app gets a stand-in `react-native` (Platform.OS 'ios', no native modules),
# so the package can be loaded outside React Native; with no HealthKit module
# linked, getAvailability must answer 'module_missing'.
#
# Every package manager gets require() from CommonJS. npm also gets the checks
# that do not depend on the package manager: the ES module build bundled for
# iOS and for Android, a Jest project with Jest's default settings
# (node_modules not transformed), and a strict TypeScript project in both
# node16 and bundler resolution.
#
# Why no plain-Node `import`: the Android and iOS builds differ by a
# platform-specific file (healthConnect.ios.js), which bundlers choose from an
# extensionless import. Node's ES module loader cannot, and a native health
# library never runs in plain Node, so the ES module build is checked the way
# apps use it: through a bundler.
set -euo pipefail

PM="${1:?package manager}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$(node -p "require('$ROOT/package.json').name")"

TARBALL="${2:-}"
if [ -z "$TARBALL" ]; then
  TARBALL="$ROOT/$(cd "$ROOT" && npm pack --silent | tail -n 1)"
fi
TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

YARN4=yarn@4.9.4
PNPM=pnpm@10.18.2
BUN=bun@1.2.23

mkdir -p stubs/react-native
printf '{"name":"react-native","version":"0.79.0","main":"index.js"}' > stubs/react-native/package.json
echo "module.exports = {Platform: {OS: 'ios'}, NativeModules: {}};" > stubs/react-native/index.js

write_package_json() {
  node -e '
    const [name, tarball, pm] = process.argv.slice(1);
    const pkg = {
      name: "consumer", version: "1.0.0", private: true, type: "commonjs",
      dependencies: {[name]: "file:" + tarball, "react-native": "file:./stubs/react-native"},
    };
    if (pm) pkg.packageManager = pm;
    require("fs").writeFileSync("package.json", JSON.stringify(pkg, null, 2));
  ' "$NAME" "$TARBALL" "${1:-}"
}

RUN=(node)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
case "$PM" in
  npm)
    write_package_json
    npm install --no-audit --no-fund --silent
    ;;
  yarn1)
    write_package_json
    npx --yes yarn@1.22.22 install --non-interactive --silent
    ;;
  yarn4-pnp | yarn4-node-modules)
    write_package_json "$YARN4"
    printf 'nodeLinker: %s\nenableGlobalCache: false\n' "${PM#yarn4-}" > .yarnrc.yml
    YARN_ENABLE_IMMUTABLE_INSTALLS=false corepack yarn install
    [ "$PM" = yarn4-pnp ] && RUN=(corepack yarn node)
    ;;
  pnpm)
    write_package_json
    npx --yes "$PNPM" install
    ;;
  bun)
    write_package_json
    npx --yes "$BUN" install
    ;;
  *)
    echo "unknown package manager: $PM" >&2
    exit 2
    ;;
esac

echo "--- $PM: require() from CommonJS"
cat > use.cjs <<EOF
const {createHealthData, HEALTH_DATA_TYPES} = require('$NAME');
if (HEALTH_DATA_TYPES.length !== 5) throw new Error('wrong exports');
createHealthData().getAvailability().then((r) => {
  if (!r.ok || r.value !== 'module_missing') throw new Error('wrong result ' + JSON.stringify(r));
  console.log('ok');
});
EOF
"${RUN[@]}" use.cjs

if [ "$PM" != npm ]; then
  exit 0
fi

npm install --no-audit --no-fund --silent jest@30 typescript@~6.0.3 @types/node@22 esbuild@0.28

echo "--- ES module build, bundled for iOS and for Android"
cat > use.mjs <<EOF
import {createHealthData} from '$NAME';
export const health = createHealthData();
EOF
for platform in ios android; do
  npx esbuild use.mjs --bundle --format=esm --platform=neutral --main-fields=module,main \
    --conditions=import --resolve-extensions=.$platform.js,.js \
    --external:react-native --external:react-native-health-connect \
    --outfile=bundle-$platform.js --log-level=warning
done
# A require or import of the module, not the name in an error message.
LOADS='(require|__require)\(["'"'"']react-native-health-connect["'"'"']\)|from ["'"'"']react-native-health-connect["'"'"']'
if grep -qE "$LOADS" bundle-ios.js; then
  echo "the iOS bundle loads react-native-health-connect" >&2
  exit 1
fi
grep -qE "$LOADS" bundle-android.js || {
  echo "the Android bundle does not load react-native-health-connect" >&2
  exit 1
}
echo ok

echo "--- Jest with its default settings"
mkdir -p __tests__
cat > __tests__/load.test.js <<EOF
test('loads without transforming node_modules', async () => {
  const {createHealthData} = require('$NAME');
  await expect(createHealthData().getAvailability()).resolves.toEqual({ok: true, value: 'module_missing'});
});
EOF
npx jest --ci

for resolution in node16 bundler; do
  echo "--- TypeScript, strict, moduleResolution $resolution"
  module=$([ "$resolution" = node16 ] && echo node16 || echo esnext)
  cat > tsconfig.json <<EOF
{"compilerOptions": {"strict": true, "noEmit": true, "module": "$module", "moduleResolution": "$resolution", "types": []}, "include": ["*.ts", "*.mts", "*.cts"]}
EOF
  cat > use-types.mts <<EOF
import {createHealthData, type HealthResult, type SleepStage} from '$NAME';
const health = createHealthData({sleepWindowStartHour: 20});
const steps: HealthResult<number> = await health.getSteps();
if (steps.ok) { const n: number = steps.value; void n; }
else { const code: 'module_missing' | 'unavailable' | 'not_permitted' | 'native_error' | 'unsupported_platform' = steps.error.code; void code; }
// @ts-expect-error value exists only once ok is checked
const wrong: number = steps.value;
const stage: SleepStage = 'rem';
export {wrong, stage};
EOF
  if [ "$resolution" = node16 ]; then
    cat > use-types.cts <<EOF
import lib = require('$NAME');
const health: lib.HealthData = lib.createHealthData();
export = health;
EOF
  else
    rm -f use-types.cts
  fi
  npx tsc -p tsconfig.json
  echo ok
done
