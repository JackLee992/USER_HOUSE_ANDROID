import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const implementation = fileURLToPath(new URL('../java/io/github/jacklee992/wanba/CompatImportCache.java', import.meta.url));
let folder;

// The harness is compiled beside the actual package-private implementation, with no Android stubs.
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'wanba-import-cache-test-'));
  await writeFile(join(folder, 'ImportCacheContract.java'), String.raw`package io.github.jacklee992.wanba;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public final class ImportCacheContract {
  static final long MIB = 1024L * 1024;
  interface Action { void run() throws Exception; }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  static void rejects(Action action, String message) throws Exception {
    try { action.run(); } catch (IllegalArgumentException expected) { return; }
    throw new AssertionError(message);
  }
  static ByteArrayInputStream stream(byte[] bytes) { return new ByteArrayInputStream(bytes); }
  static final class RepeatedStream extends InputStream {
    long remaining;
    RepeatedStream(long size) { remaining = size; }
    @Override public int read() { if (remaining == 0) return -1; remaining--; return 0x57; }
    @Override public int read(byte[] target, int offset, int length) {
      if (length == 0) return 0;
      if (remaining == 0) return -1;
      int count = (int)Math.min(length, remaining);
      Arrays.fill(target, offset, offset + count, (byte)0x57);
      remaining -= count;
      return count;
    }
  }
  static void names(File root) throws Exception {
    byte[] data = {0, 1, 2, 0x7f, (byte)0xff};
    try (CompatImportCache cache = new CompatImportCache(root)) {
      for (String name : new String[]{"PINBALL.DAT", "SOUND1.WAV", "音效 01.wav"}) {
        File file = cache.copy(stream(data), name, 32 * MIB);
        check(file.getName().equals(name), "preserve original DAT/WAV basename: " + name);
        check(file.isFile() && file.canRead(), "Gecko receives a readable local file");
        check(Arrays.equals(Files.readAllBytes(file.toPath()), data), "preserve binary bytes");
      }
    }
  }
  static void duplicates(File root) throws Exception {
    try (CompatImportCache cache = new CompatImportCache(root)) {
      File first = cache.copy(stream(new byte[]{1}), "PINBALL.DAT", MIB);
      File second = cache.copy(stream(new byte[]{2}), "PINBALL.DAT", MIB);
      check(first.getName().equals(second.getName()), "duplicate names remain recognizable");
      check(!first.getCanonicalPath().equals(second.getCanonicalPath()), "separate paths for duplicate basenames");
      check(Files.readAllBytes(first.toPath())[0] == 1, "second copy does not overwrite first");
      check(Files.readAllBytes(second.toPath())[0] == 2, "second file has its own content");
    }
  }
  static void sanitization(File root) throws Exception {
    try (CompatImportCache cache = new CompatImportCache(root)) {
      for (String name : new String[]{"../../escape.wav", "..\\..\\escape.dat", "/absolute.json", "bad\n\r\0name.wav"}) {
        File file = cache.copy(stream(new byte[]{3}), name, MIB);
        check(file.toPath().toRealPath().startsWith(root.toPath().toRealPath()), "unsafe name stays inside private cache");
        check(file.getName().indexOf('/') < 0 && file.getName().indexOf('\\') < 0, "strip path separators");
        check(file.getName().chars().noneMatch(c -> c < 32), "strip control characters");
        check(file.getName().endsWith(name.substring(name.lastIndexOf('.'))), "retain safe extension");
      }
      for (String name : new String[]{"", ".", "..", "a".repeat(161)})
        rejects(() -> cache.copy(stream(new byte[]{1}), name, MIB), "reject invalid basename");
    }
  }
  static void perFile(File root) throws Exception {
    for (long limit : new long[]{8 * MIB, 32 * MIB}) {
      try (CompatImportCache cache = new CompatImportCache(root)) {
        File file = cache.copy(new RepeatedStream(limit), "boundary.dat", limit);
        check(file.length() == limit, "accept exact per-file byte boundary");
      }
      try (CompatImportCache cache = new CompatImportCache(root)) {
        rejects(() -> cache.copy(new RepeatedStream(limit + 1), "oversized.dat", limit), "reject per-file limit plus one byte");
      }
    }
  }
  static void total(File root) throws Exception {
    try (CompatImportCache cache = new CompatImportCache(root)) {
      File first = cache.copy(new RepeatedStream(32 * MIB), "first.dat", 32 * MIB);
      File second = cache.copy(new RepeatedStream(32 * MIB), "second.wav", 32 * MIB);
      check(first.length() + second.length() == 64 * MIB, "accept exact 64 MiB cumulative boundary");
      rejects(() -> cache.copy(stream(new byte[]{1}), "overflow.json", 8 * MIB), "reject cumulative 64 MiB plus one byte");
      check(first.length() == 32 * MIB && second.length() == 32 * MIB, "overflow cannot alter previous files");
    }
  }
  static void utf8(File root) throws Exception {
    String json = "{\"name\":\"玩吧🀄\"}";
    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
    check(bytes.length > json.length(), "fixture distinguishes UTF8 bytes from Java characters");
    try (CompatImportCache cache = new CompatImportCache(root)) {
      File file = cache.copy(stream(bytes), "备份.json", bytes.length);
      check(Arrays.equals(bytes, Files.readAllBytes(file.toPath())), "UTF8 content is unchanged");
      rejects(() -> cache.copy(stream(bytes), "too-small.json", json.length()), "byte limit cannot be bypassed by multibyte text");
    }
  }
  static void cleanup(File root) throws Exception {
    File keep = new File(root, "unrelated.keep");
    Files.write(keep.toPath(), new byte[]{9});
    CompatImportCache cache = new CompatImportCache(root);
    File copied = cache.copy(stream(new byte[]{1, 2}), "save.json", MIB);
    Path ownedDirectory = copied.getParentFile().getParentFile().toPath();
    rejects(() -> cache.copy(new RepeatedStream(16385), "partial.wav", 16384), "fixture leaves a partial failed copy");
    cache.close();
    check(!Files.exists(ownedDirectory), "close removes successful and partial files and the owning directory");
    check(keep.isFile() && Files.readAllBytes(keep.toPath())[0] == 9, "close preserves unrelated cache entries");
    cache.close();
    Files.delete(keep.toPath());
  }
  public static void main(String[] args) throws Exception {
    File root = Files.createTempDirectory(Path.of(args[1]), "cache-").toFile();
    try {
      switch (args[0]) {
        case "names": names(root); break;
        case "duplicates": duplicates(root); break;
        case "sanitization": sanitization(root); break;
        case "per-file": perFile(root); break;
        case "total": total(root); break;
        case "utf8": utf8(root); break;
        case "cleanup": cleanup(root); break;
        default: throw new AssertionError("Unknown scenario");
      }
      check(Objects.requireNonNull(root.list()).length == 0, "every scenario releases its cache files");
      System.out.println(args[0] + " passed");
    } finally { root.delete(); }
  }
}
`);
  execFileSync(join(javaHome, 'bin/javac'), ['-encoding', 'UTF-8', '-d', folder,
    implementation, join(folder, 'ImportCacheContract.java')], { encoding: 'utf8', timeout: 30000 });
});

after(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

for (const [scenario, description] of [
  ['names', 'preserves original DAT/WAV names and binary content in readable private files'],
  ['duplicates', 'keeps duplicate basenames in separate paths without overwriting data'],
  ['sanitization', 'sanitizes unsafe paths and rejects invalid basenames'],
  ['per-file', 'enforces exact 8 MiB and 32 MiB per-file byte limits'],
  ['total', 'enforces the cumulative 64 MiB byte limit'],
  ['utf8', 'preserves UTF8 bytes and counts bytes rather than characters'],
  ['cleanup', 'removes owned successful and partial files on close without deleting unrelated data'],
]) {
  test(`real CompatImportCache ${description}`, () => {
    const output = execFileSync(join(javaHome, 'bin/java'), ['-cp', folder,
      'io.github.jacklee992.wanba.ImportCacheContract', scenario, folder], { encoding: 'utf8', timeout: 30000 });
    assert.match(output, new RegExp(`${scenario} passed`));
  });
}
