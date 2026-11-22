"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

/*
 * Ad-hoc code-sign the macOS .app after packaging.
 *
 * We have no Apple Developer certificate, so electron-builder skips signing
 * (CSC_IDENTITY_AUTO_DISCOVERY=false) and ships an UNSIGNED app. On Apple
 * Silicon, Gatekeeper rejects an unsigned downloaded app outright with
 * "<app> is damaged and can't be opened" — a hard block, not a prompt.
 *
 * An ad-hoc signature ("--sign -") is enough for macOS to treat the app as
 * openable: the user instead gets the ordinary "unidentified developer"
 * warning, which they can clear with right-click -> Open. (Removing that prompt
 * entirely requires a Developer ID certificate + notarisation.)
 *
 * No-op on Windows/Linux.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename; // "SPECTRE"
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  // --deep signs the nested Electron frameworks/helpers; --sign - is ad-hoc;
  // no hardened runtime / entitlements so Electron's JIT runs without a
  // Developer ID.
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    { stdio: "inherit" }
  );
};
