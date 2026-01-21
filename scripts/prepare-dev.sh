set -e

sed -i 's/jp.nonbili.nora/jp.nonbili.nora_dev/' app.config.ts
sed -i 's/Nora/Nora-dev/' app.config.ts
yes | bun expo prebuild -p android --clean --no-install
