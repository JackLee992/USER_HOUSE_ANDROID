import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const compat = fileURLToPath(new URL('..', import.meta.url));
const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';

test('real loopback asset server serves only packaged allowlisted GET/HEAD requests and releases its port', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wanba-compat-server-'));
  try {
    await mkdir(join(folder, 'android/content/res'), {recursive: true});
    await writeFile(join(folder, 'android/content/res/AssetManager.java'), `package android.content.res;
import java.io.*;
import java.nio.charset.StandardCharsets;
public class AssetManager {
  public InputStream open(String path) throws IOException {
    if (path.equals("www/standalone/index.html")) return new ByteArrayInputStream("玩吧 local".getBytes(StandardCharsets.UTF_8));
    if (path.equals("www/assets/space-cadet/game.wasm")) return new ByteArrayInputStream(new byte[]{0,97,115,109});
    throw new FileNotFoundException(path);
  }
}`);
    await writeFile(join(folder, 'ServerContract.java'), `package io.github.jacklee992.wanba;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
public class ServerContract {
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  static String request(String method, String path, String host) throws Exception {
    try (Socket socket = new Socket("127.0.0.1", CompatAssetServer.PORT)) {
      socket.setSoTimeout(3000);
      socket.getOutputStream().write((method+" "+path+" HTTP/1.1\\r\\nHost: "+host+"\\r\\nConnection: close\\r\\n\\r\\n").getBytes(StandardCharsets.UTF_8));
      return new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }
  }
  public static void main(String[] args) throws Exception {
    var assets = new android.content.res.AssetManager();
    try (CompatAssetServer server = new CompatAssetServer(assets)) {
      String page = request("GET", "/assets/www/standalone/index.html", CompatAssetServer.HOST);
      check(page.startsWith("HTTP/1.1 200"), "entry response");
      check(page.contains("Content-Security-Policy:") && page.endsWith("玩吧 local"), "CSP and UTF8 bytes");
      String wasm = request("GET", "/assets/www/assets/space-cadet/game.wasm", CompatAssetServer.HOST);
      check(wasm.contains("Content-Type: application/wasm"), "WASM streaming MIME");
      String head = request("HEAD", "/assets/www/standalone/index.html", CompatAssetServer.HOST);
      check(head.startsWith("HTTP/1.1 200") && head.endsWith("\\r\\n\\r\\n"), "HEAD has no payload");
      check(request("GET", "/assets/www/standalone/missing.html", CompatAssetServer.HOST).startsWith("HTTP/1.1 404"), "missing asset");
      check(request("POST", "/assets/www/standalone/index.html", CompatAssetServer.HOST).startsWith("HTTP/1.1 405"), "no mutations");
      for (String path : new String[]{"/private/data.json", "/assets/www/.git/config", "/assets/www/src/../secret", "/assets/www/src/%2e%2e/secret", "/assets/www/src/%252e%252e/secret", "http://evil.test/assets/www/standalone/index.html"}) {
        check(request("GET", path, CompatAssetServer.HOST).startsWith("HTTP/1.1 403"), "denied path " + path);
      }
      check(request("GET", "/assets/www/standalone/index.html", "evil.test").startsWith("HTTP/1.1 403"), "host validation");
      check(CompatAssetServer.assetPath("http://127.0.0.1:386570/assets/www/standalone/index.html") == null, "exact port");
      check(!CompatAssetServer.isEntry(CompatAssetServer.ORIGIN + "/assets/www/src/index.js"), "bridge exact entry");
      boolean occupied = false;
      try (CompatAssetServer second = new CompatAssetServer(assets)) { }
      catch (BindException expected) { occupied = true; }
      check(occupied, "port collision does not connect to another listener");
      Socket[] waiting = new Socket[8];
      for (int i = 0; i < waiting.length; i++) {
        waiting[i] = new Socket("127.0.0.1", CompatAssetServer.PORT);
        waiting[i].setSoTimeout(1000);
        waiting[i].getOutputStream().write("GET /assets/".getBytes(StandardCharsets.UTF_8));
      }
      server.close();
      for (Socket socket : waiting) {
        try (socket) {
          try { check(socket.getInputStream().read() == -1, "close cancels active and queued requests"); }
          catch (SocketException closed) { /* A reset is also a closed socket. */ }
        }
      }
    }
    try (CompatAssetServer reopened = new CompatAssetServer(assets)) {
      check(request("GET", "/assets/www/standalone/index.html", CompatAssetServer.HOST).startsWith("HTTP/1.1 200"), "destroy releases origin");
    }
    System.out.println("loopback policy and lifecycle passed");
  }
}`);
    const sources = [join(folder, 'android/content/res/AssetManager.java'), join(folder, 'ServerContract.java'),
      resolve(compat, '../main/java/io/github/jacklee992/wanba/LocalAssetPolicy.java'),
      resolve(compat, 'java/io/github/jacklee992/wanba/CompatAssetServer.java')];
    execFileSync(join(javaHome, 'bin/javac'), ['-d', folder, ...sources], {encoding: 'utf8'});
    const output = execFileSync(join(javaHome, 'bin/java'), ['-cp', folder, 'io.github.jacklee992.wanba.ServerContract'], {encoding: 'utf8'});
    assert.match(output, /loopback policy and lifecycle passed/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
