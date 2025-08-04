import asyncio
import json
from pynput.mouse import Controller as MouseController, Button
from pynput.keyboard import Controller as KeyboardController

mouse = MouseController()
keyboard = KeyboardController()

async def handler(ws):
    async for msg in ws:
        try:
            obj = json.loads(msg)
        except:
            continue
        if obj.get("type") != "input":
            continue
        if obj.get("inputType") == "mouse":
            x = obj.get("x")
            y = obj.get("y")
            event = obj.get("event")
            button = obj.get("button", "left")
            if event == "move" and x is not None and y is not None:
                mouse.position = (int(x), int(y))
            elif event == "click":
                btn = Button.left if button == "left" else Button.right if button == "right" else Button.middle
                mouse.click(btn)
        elif obj.get("inputType") == "keyboard":
            key = obj.get("key")
            event = obj.get("event")
            if event == "keydown":
                keyboard.press(key)
            elif event == "keyup":
                keyboard.release(key)

async def main():
    import websockets
    async with websockets.serve(handler, "localhost", 5001):
        print("Python control agent listening on ws://localhost:5001")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
