import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Locate a `/dev/input/eventN` path for a USB HID device by USB
 * vendor/product ID. Linux exposes each evdev under
 * `/sys/class/input/eventN/device/` along with a `uevent` file that contains
 * a `PRODUCT=bus/vendor/product/version` line (hex, no leading zeros).
 *
 * A composite HID device (like this 3-key keyboard with a knob) exposes
 * multiple interfaces — typically a "keyboard" interface for the 3 keys and
 * a "consumer control" interface for the volume knob. We pick the one that
 * advertises EV_KEY support for the volume codes; if multiple match we
 * prefer the one whose name doesn't end in "Mouse"/"System Control" since
 * those tend to be the other HID collections from the same device.
 */

const SYSFS_INPUT_ROOT = "/sys/class/input";
const DEV_INPUT_ROOT = "/dev/input";

export type FoundDevice = {
  path: string;
  name: string;
};

export async function findDevicesByVidPid(
  vendorHex: string,
  productHex: string,
): Promise<FoundDevice[]> {
  const wantVendor = vendorHex.toLowerCase().replace(/^0+/, "") || "0";
  const wantProduct = productHex.toLowerCase().replace(/^0+/, "") || "0";

  let entries: string[];
  try {
    entries = await readdir(SYSFS_INPUT_ROOT);
  } catch {
    return [];
  }

  const eventDirs = entries.filter((name) => /^event\d+$/.test(name));

  const candidates: FoundDevice[] = [];

  for (const eventName of eventDirs) {
    const sysDevice = join(SYSFS_INPUT_ROOT, eventName, "device");
    let uevent: string;
    try {
      uevent = await readFile(join(sysDevice, "uevent"), "utf8");
    } catch {
      continue;
    }

    // Sample line: PRODUCT=3/1189/8890/111
    const match = uevent.match(/^PRODUCT=([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/im);
    if (!match) continue;
    const vendor = match[2].toLowerCase().replace(/^0+/, "") || "0";
    const product = match[3].toLowerCase().replace(/^0+/, "") || "0";
    if (vendor !== wantVendor || product !== wantProduct) continue;

    let name = "";
    try {
      name = (await readFile(join(sysDevice, "name"), "utf8")).trim();
    } catch {
      name = eventName;
    }

    candidates.push({
      path: join(DEV_INPUT_ROOT, eventName),
      name,
    });
  }

  /*
   * Return every matching interface. Composite HID keyboards expose several
   * event nodes (keyboard, mouse, system control, consumer control); the
   * volume knob may live on any of them, and identifying it reliably from
   * sysfs alone is brittle. The caller watches all of them in parallel so
   * whichever interface actually emits VOLUMEUP/VOLUMEDOWN gets through.
   */
  candidates.sort((a, b) => a.path.localeCompare(b.path));
  return candidates;
}
