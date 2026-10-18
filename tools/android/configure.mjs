#!/usr/bin/env node
// Applies the game-specific Android activity settings to Tauri's generated project. `src-tauri/gen/android` is
// intentionally ignored by git, so this script is run after `tauri android init` and before every Android build.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const android = path.join(root, 'src-tauri', 'gen', 'android');
const manifestPath = path.join(android, 'app', 'src', 'main', 'AndroidManifest.xml');

async function findFile(dir, filename) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (['.gradle', 'build', 'target', 'node_modules'].includes(entry.name)) continue;
      const found = await findFile(path.join(dir, entry.name), filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

function configureManifest(xml) {
  let text = xml;
  const manifestTag = text.match(/<manifest\b[^>]*>/s)?.[0];
  if (!manifestTag) throw new Error('Could not find the root <manifest> in AndroidManifest.xml.');
  if (!/android:name\s*=\s*["']android\.permission\.VIBRATE["']/.test(text)) {
    text = text.replace(manifestTag, `${manifestTag}\n    <uses-permission android:name="android.permission.VIBRATE" />`);
  }
  const activity = text.match(/<activity\b(?=[^>]*\bandroid:name\s*=\s*["'][^"']*MainActivity[^"']*["'])[^>]*>/s)?.[0];
  if (!activity) throw new Error('Could not find the generated MainActivity in AndroidManifest.xml.');
  const updated = /\bandroid:screenOrientation\s*=/.test(activity)
    ? activity.replace(/android:screenOrientation\s*=\s*["'][^"']*["']/, 'android:screenOrientation="landscape"')
    : activity.replace(/\s*\/?>$/, (end) => ` android:screenOrientation="landscape"${end}`);
  return text.replace(activity, updated);
}

function configureTestSigning(source) {
  const releaseBlock = 'getByName("release") {';
  const signing = 'signingConfig = signingConfigs.getByName("debug")';
  if (source.includes(signing)) return source;
  if (!source.includes(releaseBlock)) throw new Error('Could not find the Android release build type to enable test signing.');
  return source.replace(releaseBlock, `${releaseBlock}\n            ${signing}`);
}

function configureActivity(source) {
  let text = source;
  const imports = [
    'import android.os.Build',
    'import android.view.View',
    'import android.view.WindowInsets',
    'import android.view.WindowInsetsController',
    'import android.view.WindowManager',
  ];
  const missing = imports.filter((line) => !text.split(/\r?\n/).includes(line));
  if (missing.length) {
    const packageLine = /^(package\s+[^\r\n]+\r?\n)/m;
    if (!packageLine.test(text)) throw new Error('Could not locate the package declaration in MainActivity.kt.');
    text = text.replace(packageLine, (line) => `${line}\n${missing.join('\n')}\n`);
  }

  if (!text.includes('private fun hideSystemBars()')) {
    if (!/override fun onCreate\s*\(/.test(text) || !text.includes('super.onCreate(savedInstanceState)')) {
      throw new Error('Unexpected Tauri MainActivity template; cannot install immersive mode safely.');
    }
    text = text.replace('super.onCreate(savedInstanceState)', 'super.onCreate(savedInstanceState)\n    hideSystemBars()');
    const end = text.lastIndexOf('}');
    if (end < 0) throw new Error('Could not locate the end of MainActivity.kt.');
    const helpers = `

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.let { controller ->
        controller.hide(WindowInsets.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
          View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
          View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
          View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_FULLSCREEN
      )
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
  }
`;
    text = `${text.slice(0, end)}${helpers}${text.slice(end)}`;
  }
  return text;
}

try {
  const manifest = await fs.readFile(manifestPath, 'utf8');
  const configuredManifest = configureManifest(manifest);
  if (configuredManifest !== manifest) await fs.writeFile(manifestPath, configuredManifest);

  const activityPath = await findFile(path.join(android, 'app', 'src', 'main'), 'MainActivity.kt');
  if (!activityPath) throw new Error('Could not find Tauri Android app/src/main/MainActivity.kt.');
  const activity = await fs.readFile(activityPath, 'utf8');
  const configuredActivity = configureActivity(activity);
  if (configuredActivity !== activity) await fs.writeFile(activityPath, configuredActivity);

  if (process.env.ANDROID_DEBUG_SIGN_RELEASE === '1') {
    const gradlePath = path.join(android, 'app', 'build.gradle.kts');
    const gradle = await fs.readFile(gradlePath, 'utf8');
    const configuredGradle = configureTestSigning(gradle);
    if (configuredGradle !== gradle) await fs.writeFile(gradlePath, configuredGradle);
    console.log('Android release variant configured with the debug key for sideload testing.');
  }

  console.log('Android configured: landscape, immersive full-screen, cutout support, and haptics permission.');
} catch (error) {
  console.error(`Android project setup required: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Run `npm run android:init` after installing Rust, Android Studio, and the Android SDK.');
  process.exitCode = 1;
}
