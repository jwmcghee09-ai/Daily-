import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

export const runtime = "nodejs";

/**
 * SPECTRE Local, as a zip the browser can save.
 *
 * The Settings page told people to "download SPECTRE Local" and then linked to
 * a GitHub path that does not exist, so there was no way to actually get it.
 * Serving it from the app removes the dependency on a repository layout
 * entirely: the bytes come from the deployment that is already running, so the
 * download cannot drift out of step with the server it talks to.
 *
 * The archive is written by hand rather than with a zip library. The whole
 * folder is 15 small text files, so this stays a few dozen lines of the format
 * and adds no dependency to the deploy.
 */

const SOURCE_DIR = path.join(process.cwd(), "local");
const SKIP = new Set(["node_modules", ".git", ".DS_Store"]);

interface Entry {
  name: string;
  data: Buffer;
}

function collect(dir: string, prefix = ""): Entry[] {
  const out: Entry[] = [];
  for (const item of readdirSync(dir).sort()) {
    if (SKIP.has(item)) continue;
    const full = path.join(dir, item);
    const name = prefix ? `${prefix}/${item}` : item;
    if (statSync(full).isDirectory()) {
      out.push(...collect(full, name));
    } else {
      out.push({ name: `spectre-local/${name}`, data: readFileSync(full) });
    }
  }
  return out;
}

/** DOS timestamp — zip predates Unix time, and readers still expect this. */
function dosTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2)),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function buildZip(entries: Entry[]): Buffer {
  const { time, date } = dosTime(new Date());
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const sum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(sum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    locals.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory header
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(sum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([Buffer.concat(locals), centralBuf, end]);
}

export async function GET() {
  let zip: Buffer;
  try {
    zip = buildZip(collect(SOURCE_DIR));
  } catch {
    return new Response(
      JSON.stringify({ error: "SPECTRE Local is not bundled with this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="spectre-local.zip"',
      "Content-Length": String(zip.length),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
