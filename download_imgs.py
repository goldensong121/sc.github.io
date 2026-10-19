import urllib.request
import os

assets_dir = r"C:\Users\Administrator\Doubao\chats\2026-10-15\new-chat\supply-chain-vr\assets"
os.makedirs(assets_dir, exist_ok=True)

images = [
    ("https://aka.doubaocdn.com/s/iS4ScgjNdH", "login-bg.jpg"),
    ("https://aka.doubaocdn.com/s/85PK21CiA2", "factory-line.jpg"),
]

for url, name in images:
    path = os.path.join(assets_dir, name)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            with open(path, "wb") as f:
                f.write(data)
            print(f"下载成功: {name} ({len(data)} bytes)")
    except Exception as e:
        print(f"下载失败: {name} - {e}")

print("完成")
