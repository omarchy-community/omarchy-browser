#!/usr/bin/env python3
"""Drive the Omarchy Browser dev window over CDP and screenshot it.
usage: obshot.py OUT.png [js-or-seconds ...]   (numbers = sleep seconds)"""
import json, sys, time, base64, urllib.request, asyncio
import websockets

def page():
    return next(t for t in json.load(urllib.request.urlopen('http://localhost:9566/json')) if t['type'] == 'page')

async def main(out, steps):
    async with websockets.connect(page()['webSocketDebuggerUrl'], max_size=None) as ws:
        n = 0
        async def call(m, p):
            nonlocal n
            n += 1
            await ws.send(json.dumps({'id': n, 'method': m, 'params': p}))
            while True:
                r = json.loads(await ws.recv())
                if r.get('id') == n:
                    return r.get('result', {})
        for s in steps:
            try:
                await asyncio.sleep(float(s)); continue
            except ValueError:
                pass
            r = await call('Runtime.evaluate', {'expression': s, 'awaitPromise': True, 'returnByValue': True})
            print(r.get('result', {}).get('value'), r.get('exceptionDetails', {}).get('text', ''))
        if out != '-':
            await call('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await asyncio.sleep(1.5)
            d = await call('Page.captureScreenshot', {'format': 'png'})
            open(out, 'wb').write(base64.b64decode(d['data']))
            await call('Emulation.clearDeviceMetricsOverride', {})
            print('saved', out)

asyncio.run(main(sys.argv[1], sys.argv[2:]))
