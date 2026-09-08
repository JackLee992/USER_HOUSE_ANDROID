#!/usr/bin/env python3
"""Isolated integration host; no SillyTavern account, API or user data required.
Run: python3 tests/browser/serve.py --port 8765 --artifacts /path/to/evidence
The --upstream flag serves the original runtime for the same A/B fixture.
"""
import argparse, http.server, json, mimetypes, pathlib, subprocess
from urllib.parse import urlsplit
ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(); p.add_argument('--port', type=int, default=8765); p.add_argument('--artifacts', type=pathlib.Path, required=True); p.add_argument('--upstream', action='store_true'); args=p.parse_args()
args.artifacts.mkdir(parents=True, exist_ok=True)
PREFIX='/scripts/extensions/third-party/USER_HOUSE/'
def instrument_paopao(s):
 for marker in ["    env.getHostWindow().addEventListener('resize', onResize, { passive:true });", "    getHostWindow().addEventListener('resize', onResize, { passive:true });", "    getHostWindow().addEventListener('resize', () => { if(currentGame === 'paopao'){ resize(); draw(); } }, { passive:true });"]:
  if marker in s:
   return s.replace(marker,marker+'''
      window.paopaoTest = {
        snapshot:() => JSON.parse(JSON.stringify({falling,popping,flying,bubbles,shots,score,lastT})),
        setup:() => {lastT=performance.now();falling=[{x:100,y:50,vy:1,color:'blue'}];popping=[];},
        shoot:() => {flying={x:launch.x,y:launch.y,vx:0,vy:-1,color:'blue',bomb:false};},
      };
    ''')
 return s
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self, *a): pass
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/': data=(ROOT/'tests/browser/index.html').read_bytes(); kind='text/html'
  elif path=='/jquery.js': data=(args.artifacts/'jquery.min.js').read_bytes(); kind='text/javascript'
  elif path=='/script.js': data=b'export function getRequestHeaders(){return {"Content-Type":"application/json"}}';kind='text/javascript'
  elif path.startswith(PREFIX):
   rel=path[len(PREFIX):]; f=(ROOT/rel).resolve()
   if not f.is_relative_to(ROOT) or not f.is_file(): self.send_error(404);return
   data=f.read_bytes();kind=mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
   if rel=='src/runtime/wanban-app.js':
    s=subprocess.check_output(['git','show','upstream/main:src/runtime/wanban-app.js'],cwd=ROOT).decode() if args.upstream else data.decode()
    s=s.replace('  function init() {', '''  window.wbTest = {
      open:buildPopup, select:renderGame, start:startCurrentGame, stop:stopGame,
      pause:value => {gamePaused=value;}, state:() => activeGameController?.getState?.(),
      game:() => ({currentGame,gameStarted,gamePaused}),
      prepare:id => {clearProgress(id);renderGame(id);startCurrentGame(id,null,{forceNew:true});},
      save:() => activeGameController?.save?.(),
    };
    function init() {''')
    s=instrument_paopao(s)
    s=s.replace('scheduleInitialUpdateCheck();','')
    data=s.encode()
   elif rel=='src/games/plugins/paopao/index.js':
    data=instrument_paopao(data.decode()).encode()
  else: self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if urlsplit(self.path).path!='/results':self.send_error(404);return
  data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  name=('before' if args.upstream else 'after')+'-'+''.join(c for c in data.get('name','run') if c.isalnum() or c=='-')+'.json'
  (args.artifacts/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
  self.send_response(200);self.end_headers();self.wfile.write(b'ok')
print(f'http://127.0.0.1:{args.port}',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
