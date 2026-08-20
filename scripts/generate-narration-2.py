#!/usr/bin/env python3
from __future__ import annotations
import json, os, ssl, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/workspace/public/audio")
API = "https://api.x.ai/v1/tts"
KEY = os.environ.get("XAI_API_KEY", "")
if not KEY:
    sys.exit("XAI_API_KEY missing")

PAGES = [
    ("ke-zhou", "p0", "小朋友，我们来听成语故事：刻舟求剑。"),
    ("ke-zhou", "p1", "从前有个人坐船过河，他把宝剑挂在腰上。"),
    ("ke-zhou", "p2", "船走到江心，一晃，宝剑掉进了水里。"),
    ("ke-zhou", "p3", "他不着急捞，只在船帮上刻了一个记号。"),
    ("ke-zhou", "p4", "他说：剑是从这儿掉下去的，等船靠岸再找。"),
    ("ke-zhou", "p5", "船靠岸了，他顺着记号下水去找，当然找不到。"),
    ("ke-zhou", "moral", "刻舟求剑，是说情况已经变了，还用老办法，是找不到的。做事要看眼前的变化。"),
    ("dui-niu", "p0", "小朋友，我们来听成语故事：对牛弹琴。"),
    ("dui-niu", "p1", "古时候有个音乐家，琴弹得特别好听。"),
    ("dui-niu", "p2", "有一天，他看见路边有一头大黄牛，就坐下来弹琴给它听。"),
    ("dui-niu", "p3", "琴声轻轻的，很好听。可是牛只顾着吃草，根本不理他。"),
    ("dui-niu", "p4", "他换了一首更美的曲子，牛还是低头吃草。"),
    ("dui-niu", "p5", "他叹了口气：不是琴不好，是听的人不对呀。"),
    ("dui-niu", "moral", "对牛弹琴，是说说话做事要看对象。对听不懂的人讲大道理，是没有用的。"),
    ("yi-ming", "p0", "小朋友，我们来听成语故事：一鸣惊人。"),
    ("yi-ming", "p1", "楚国有个国王，三年都不爱做事，大家都很着急。"),
    ("yi-ming", "p2", "有个聪明的大臣问他：大王，有只大鸟三年不飞也不叫，这是怎么回事？"),
    ("yi-ming", "p3", "国王眨眨眼说：这只鸟啊，不飞则已，一飞冲天；不鸣则已，一鸣惊人。"),
    ("yi-ming", "p4", "原来国王一直在想办法。从那天起，他天天认真治理国家。"),
    ("yi-ming", "p5", "没过多久，国家变得又安定又热闹。大家都说：大王真是一鸣惊人！"),
    ("yi-ming", "moral", "一鸣惊人，是说平时好好准备，关键时刻就能做出让人吃惊的好事。"),
    ("jing-wei", "p0", "小朋友，我们来听成语故事：精卫填海。"),
    ("jing-wei", "p1", "炎帝有个小女儿，名字叫女娃，她最喜欢去海边玩。"),
    ("jing-wei", "p2", "有一天她去海里游泳，遇上大风浪，回不来了。"),
    ("jing-wei", "p3", "女娃变成了一只小鸟，花脑袋，白嘴巴，名字叫精卫。"),
    ("jing-wei", "p4", "精卫天天衔着小石子和小树枝，丢到东海里。"),
    ("jing-wei", "p5", "海那么大，石子那么小，可她一天也不停。"),
    ("jing-wei", "moral", "精卫填海，是说事情再难，只要不放弃，一点点去做，也是了不起的。"),
    ("ba-miao", "p0", "小朋友，我们来听成语故事：拔苗助长。"),
    ("ba-miao", "p1", "有个农夫种了禾苗，每天都去田里看。"),
    ("ba-miao", "p2", "他嫌禾苗长得太慢，心里很着急。"),
    ("ba-miao", "p3", "他想了个办法：把每棵苗都往上拔一拔。"),
    ("ba-miao", "p4", "回到家，他高兴地对儿子说：今天我帮禾苗长高了！"),
    ("ba-miao", "p5", "儿子跑去一看，禾苗全都枯了。"),
    ("ba-miao", "moral", "拔苗助长，是说想快点好，用错办法，反而会把事情弄糟。要按它自己的节奏来。"),
    ("yu-gong", "p0", "小朋友，我们来听成语故事：愚公移山。"),
    ("yu-gong", "p1", "从前有位老爷爷，叫愚公。他家门口有两座大山挡住了路。"),
    ("yu-gong", "p2", "愚公对家人说：我们把山搬走吧！大家一起挖土搬石头。"),
    ("yu-gong", "p3", "有个老邻居笑话他：山那么高，你这么大年纪，搬得完吗？"),
    ("yu-gong", "p4", "愚公说：我搬不完，还有儿子；儿子搬不完，还有孙子。一代一代搬下去。"),
    ("yu-gong", "p5", "天上的神被他感动了，派人把两座山搬走了。"),
    ("yu-gong", "moral", "愚公移山，是说只要下定决心，一点点做，再难的事也能做成。"),
]

def fetch(item):
    story, page, text = item
    dest = ROOT / story / f"{page}.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 2000:
        return f"skip {story}/{page}"
    body = json.dumps({"text": text, "voice_id": "luna", "language": "zh"}, ensure_ascii=False).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    ctx = ssl.create_default_context()
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=ctx) as res:
                data = res.read()
            if len(data) < 1000:
                raise RuntimeError(f"tiny {len(data)}")
            dest.write_bytes(data)
            return f"ok {story}/{page} {len(data)}"
        except Exception as e:
            last = e
            time.sleep(1.2 * (attempt + 1))
    return f"FAIL {story}/{page} {last}"

def main():
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(fetch, p) for p in PAGES]
        for f in as_completed(futs):
            msg = f.result()
            print(msg, flush=True)
            if msg.startswith("FAIL"):
                fail += 1
            else:
                ok += 1
    print(f"done ok={ok} fail={fail}")
    if fail:
        sys.exit(1)

if __name__ == "__main__":
    main()
