#!/usr/bin/env python3
"""Screenshot / drive the running Omarchy Browser via CDP (port 9444).
usage: obshot.py <out.png> [js-to-eval-in-ui-first] [wait-seconds]
"""
import json, sys, base64, time, urllib.request, asyncio
import websockets

out = sys.argv[1]
js = sys.argv[2] if len(sys.argv) > 2 else ''
wait = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

pages = json.load(urllib.request.urlopen('http://localhost:9444/json'))
ui = [p for p in pages if p['url'].endswith('index.html')][0]

async def main():
    async with websockets.connect(ui['webSocketDebuggerUrl'], max_size=50_000_000) as ws:
        i = 0
        async def call(method, **params):
            nonlocal i; i += 1
            await ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
            while True:
                m = json.loads(await ws.recv())
                if m.get('id') == i: return m.get('result', m)
        if js:
            r = await call('Runtime.evaluate', expression=js, awaitPromise=True, returnByValue=True)
            if 'exceptionDetails' in r: print('JS error:', r['exceptionDetails'].get('text'), r['exceptionDetails'].get('exception', {}).get('description'))
            else: print('js ->', r.get('result', {}).get('value'))
        time.sleep(wait)
        r = await call('Page.captureScreenshot', format='png')
        open(out, 'wb').write(base64.b64decode(r['data']))
        # also dump console errors from the UI page
        print('saved', out)
asyncio.run(main())
